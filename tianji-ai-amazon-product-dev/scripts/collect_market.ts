// 采集层：一个品类关键词 → 归一化的「市场 + 对标 ASIN」数据集。
//
// 数据源分工（按你的口径约定，写死在这里，任何一步都不许换源）：
//   · 销量      → SIF   ops_get_asin_sales_list        （boughtInPastMonth / boughtHistory）
//   · 销售额    → 卖家精灵 product_research            （revenue / units，按月）
//   · coupon    → 卖家精灵 asin_detail_with_coupon_trend（Keepa 口径的优惠趋势 + 成交价）
//   · 竞品发现  → SIF   market_get_keyword_root_competitors（ABA 真实点击行为）
import * as wmill from "windmill-client";

const SIF = "u/tianjikuajingyayun/sif_mcp";
const SS = "u/tianjikuajingyayun/sellersprite_mcp";

// ---------- 通用 MCP 会话 ----------
type Conn = { url: string; token?: string; headers?: Record<string, string> };

async function conn(path: string): Promise<Conn> {
  const v: any = await wmill.getResource(path);
  if (!v?.url) throw new Error(`资源 ${path} 缺少 url`);
  return { url: v.url, token: v.token || undefined, headers: v.headers || undefined };
}

function parseSse(text: string): any[] {
  const out: any[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const body = t.slice(5).trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {}
  }
  if (out.length === 0 && text.trim().startsWith("{")) {
    try {
      out.push(JSON.parse(text));
    } catch {}
  }
  return out;
}

class Session {
  private sid?: string;
  private id = 1;
  constructor(private c: Conn) {}
  private h(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(this.c.headers ?? {}) };
    if (this.c.token) h["Authorization"] = `Bearer ${this.c.token}`;
    if (this.sid) h["mcp-session-id"] = this.sid;
    return h;
  }
  private async post(body: any): Promise<any[]> {
    const res = await fetch(this.c.url, { method: "POST", headers: this.h(), body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sid = sid;
    return parseSse(await res.text());
  }
  async init(): Promise<void> {
    const msgs = await this.post({
      jsonrpc: "2.0",
      id: this.id++,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "apd-collector", version: "1.0" } },
    });
    const m = msgs.find((x) => x.result || x.error);
    if (!m?.result) throw new Error(`MCP initialize 失败: ${JSON.stringify(msgs).slice(0, 400)}`);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  }
  async call(name: string, args: Record<string, any>): Promise<any> {
    const msgs = await this.post({ jsonrpc: "2.0", id: this.id++, method: "tools/call", params: { name, arguments: args } });
    const m = msgs.find((x) => x.result || x.error);
    if (!m) throw new Error(`MCP ${name} 无响应`);
    if (m.error) throw new Error(`MCP ${name} 错误: ${JSON.stringify(m.error).slice(0, 500)}`);
    const texts = (m.result?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text);
    let data: any = texts.length === 1 ? texts[0] : texts;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {}
    }
    return data;
  }
}

// ---------- 工具函数 ----------
const ASIN_RE = /^B0[A-Z0-9]{8}$/;

function cleanAsin(v: any): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/B0[A-Z0-9]{8}/);
  return m ? m[0] : null;
}

/** SIF 的销量是分桶字符串（"<50"、"100+"、">1K"）或数字，统一转成可比的数值区间 */
function parseUnits(v: any): { value: number | null; bucket: string | null; is_bucket: boolean } {
  if (typeof v === "number") return { value: v, bucket: null, is_bucket: false };
  if (typeof v !== "string" || !v.trim()) return { value: null, bucket: null, is_bucket: false };
  const s = v.trim().toUpperCase().replace(/,/g, "");
  const num = (t: string) => {
    const x = parseFloat(t);
    if (isNaN(x)) return null;
    if (t.endsWith("K")) return x * 1000;
    if (t.endsWith("M")) return x * 1_000_000;
    return x;
  };
  // "100+" / "<50" / "50" / ">1K" 都当分桶，取边界值作为保守估计
  const m = s.match(/^(<=|>=|<|>)?\s*([0-9.]+)\s*([KM])?\s*(\+)?$/);
  if (!m) return { value: null, bucket: v, is_bucket: true };
  const value = num(m[2] + (m[3] ?? ""));
  if (value === null) return { value: null, bucket: v, is_bucket: true };
  return { value, bucket: v, is_bucket: Boolean(m[1] || m[4]) };
}

function pickLatestMonth(items: any[]): string {
  // 卖家精灵的月份参数用 yyyyMM；取今天所在月份的上一个月（T+1 数据延迟）
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function deepFind(obj: any, pred: (k: string, v: any) => boolean, depth = 0): any[] {
  const hits: any[] = [];
  if (!obj || typeof obj !== "object" || depth > 8) return hits;
  for (const [k, v] of Object.entries(obj)) {
    if (pred(k, v)) hits.push(v);
    if (v && typeof v === "object") hits.push(...deepFind(v, pred, depth + 1));
  }
  return hits;
}

// ---------- 主流程 ----------
export async function main(keyword: string, marketplace: string = "US", top_n: number = 10, with_coupon: boolean = true, node_id_path: string | null = null) {
  const diagnostics: any[] = [];
  const sif = new Session(await conn(SIF));
  const ss = new Session(await conn(SS));
  await Promise.all([sif.init(), ss.init()]);

  const month = pickLatestMonth();

  // 1) 类目节点（卖家精灵 product_node），失败不致命
  let nodePath = node_id_path ?? "";
  if (!nodePath) {
    try {
      const collectNodes = (o: any, depth = 0): any[] => {
        if (!o || typeof o !== "object" || depth > 8) return [];
        if (Array.isArray(o)) return o.flatMap((x) => collectNodes(x, depth + 1));
        const out: any[] = [];
        const path = o.nodeIdPath ?? o.nodeIdPaths ?? null;
        const label = o.nodeLabelPath ?? o.nodeLabelPathLocale ?? o.label ?? o.name ?? o.nodeLabel ?? "";
        if (typeof path === "string" && path.includes(":")) out.push({ path, label: String(label) });
        for (const v of Object.values(o)) out.push(...collectNodes(v, depth + 1));
        return out;
      };

      const kwResp = await ss.call("product_node", { request: { marketplace, keyword } });
      let cands = collectNodes(kwResp);

      // 关键词搜索可能只命中「Mat Bags / Mat Straps」这类带修饰的兄弟节点，而漏掉
      // 「Mats」本体（如 keyword=yoga mat）。用命中节点的父级再展开一次同级子节点，
      // 让打分能在完整兄弟集合里挑最贴合关键词的那个。
      const stripLeaf = (p: string) => p.split(":").slice(0, -1).join(":");
      const parentPath = cands.length > 0 ? stripLeaf(cands[0].path) : "";
      if (parentPath) {
        try {
          const sibResp = await ss.call("product_node", { request: { marketplace, nodeIdPath: parentPath } });
          const seen = new Set(cands.map((c: any) => c.path));
          for (const s of collectNodes(sibResp)) {
            if (!seen.has(s.path)) {
              seen.add(s.path);
              cands.push(s);
            }
          }
        } catch (e: any) {
          diagnostics.push({ step: "product_node_siblings", error: String(e?.message ?? e) });
        }
      }

      const tokens = String(keyword).toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const score = (c: any) => tokens.reduce((s: number, t: string) => s + (c.label.toLowerCase().includes(t) ? 1 : 0), 0);
      // 叶节点里「关键词之外的多余词」越多，越可能是跑偏的兄弟类目（如 yoga mat → Mat Bags）。
      // 同分时优先叶节点更贴近关键词、层级更浅的节点。
      const leafOf = (c: any) => (String(c.label ?? "").split(":").map((s: string) => s.trim()).filter(Boolean).pop() ?? "").toLowerCase();
      const extraWords = (c: any) => {
        const leaf = leafOf(c);
        if (!leaf) return 99;
        return leaf.split(/\s+/).filter((w: string) => !tokens.some((t: string) => w.includes(t) || t.includes(w))).length;
      };
      cands.sort((a, b) => score(b) - score(a) || extraWords(a) - extraWords(b) || a.path.split(":").length - b.path.split(":").length);
      if (cands.length > 0) {
        nodePath = cands[0].path;
        diagnostics.push({
          step: "product_node",
          candidates: cands.length,
          chosen: cands[0],
          scored_zero: score(cands[0]) === 0,
          others: cands.slice(1, 5).map((c) => `${score(c)}|${extraWords(c)}|${c.label || c.path}`),
        });
      } else {
        diagnostics.push({ step: "product_node", warning: "未解析到 nodeIdPath，市场层退回关键词检索", sample: JSON.stringify(kwResp).slice(0, 400) });
      }
    } catch (e: any) {
      diagnostics.push({ step: "product_node", error: String(e?.message ?? e) });
    }
  }

  // 2) 销售额层（卖家精灵 product_research，按月 revenue）
  const baseReq: any = { marketplace, month, page: 1, size: Math.max(1, Math.min(top_n, 50)), variation: "Y" };
  if (nodePath) baseReq.nodeIdPath = nodePath;
  else baseReq.keyword = keyword;
  let marketRows: any[] = [];
  try {
    const pr = await ss.call("product_research", { request: baseReq });
    marketRows = pr?.data?.items ?? pr?.items ?? [];
    if (marketRows.length === 0) diagnostics.push({ step: "product_research", warning: "返回 0 条，可能需要 nodeIdPath 而不是 keyword", request: baseReq });
  } catch (e: any) {
    diagnostics.push({ step: "product_research", error: String(e?.message ?? e) });
  }

  const listings = marketRows.map((r: any) => ({
    asin: cleanAsin(r.asin),
    parent: r.parent ?? null,
    title: r.title ?? null,
    brand: r.brand ?? null,
    price: typeof r.price === "number" ? r.price : null,
    avg_price: typeof r.averagePrice === "number" ? r.averagePrice : null,
    units_ss: typeof r.units === "number" ? r.units : null,
    revenue_ss: typeof r.revenue === "number" ? r.revenue : null,
    profit_pct: typeof r.profit === "number" ? r.profit : null,
    rating: r.rating ?? null,
    ratings: r.ratings ?? null,
    ratings_cv: r.ratingsCv ?? null,
    bsr: r.bsr ?? null,
    fba_fee: r.fba ?? null,
    lqs: r.lqs ?? null,
    weight: r.weight ?? null,
    pkg_weight: r.pkgWeight ?? null,
    dimensions: r.dimension ?? null,
    pkg_dimensions: r.pkgDimensions ?? null,
    size_type: r.dimensionsType ?? null,
    seller_nation: r.sellerNation ?? null,
    fulfillment: r.fulfillment ?? null,
    variations: r.variations ?? null,
    available_date: r.availableDate ?? null,
    node_path: r.nodeLabelPath ?? null,
    badge: r.badge ?? null,
    sku: r.sku ?? null,
    month,
    source_revenue: "sellersprite.product_research",
  }));

  // 3) 销量层（SIF ops_get_asin_sales_list）—— 一次可查多个 ASIN
  const asins = listings.map((l: any) => l.asin).filter((a: any): a is string => !!a);
  const sifMap: Record<string, any> = {};
  if (asins.length > 0) {
    try {
      const sales = await sif.call("ops_get_asin_sales_list", {
        asins,
        country: marketplace,
        timePieceType: "latelyDay",
        timePieceValue: "30",
        pageSize: Math.min(100, asins.length),
      });
      for (const row of sales?.asins ?? []) {
        const a = cleanAsin(row.asin);
        if (!a) continue;
        const monthly = Array.isArray(row.boughtHistory) && Array.isArray(row.boughtHistoryDates)
          ? row.boughtHistory
              .map((u: any, i: number) => ({ month: row.boughtHistoryDates[i], units: typeof u === "number" ? u : null }))
              .filter((x: any) => x.units !== null)
              .slice(-6)
          : [];
        const parsed = parseUnits(row.boughtInPastMonth);
        sifMap[a] = {
          asin: a,
          units_30d_raw: row.boughtInPastMonth ?? null,
          units_30d: parsed.value,
          units_is_bucket: parsed.is_bucket,
          units_monthly_series: monthly,
          price: typeof row.price === "number" ? row.price : null,
          rating: row.score ?? row.star ?? null,
          ratings: row.ratingNum ?? null,
          title: row.title ?? null,
          source_units: "SIF.ops_get_asin_sales_list",
        };
      }
      diagnostics.push({ step: "sif_sales", quota: sales?._quota ?? null });
    } catch (e: any) {
      diagnostics.push({ step: "sif_sales", error: String(e?.message ?? e) });
    }
  }

  // 4) coupon / 优惠层（卖家精灵，Keepa 口径）—— 只对头部 ASIN 做，控额度
  const couponTargets = asins.slice(0, Math.min(5, asins.length));
  const couponMap: Record<string, any> = {};
  if (with_coupon) {
    for (const a of couponTargets) {
      try {
        const d = await ss.call("asin_detail_with_coupon_trend", { marketplace, asin: a });
        const payload = d?.data ?? d;
        const asinInfo = payload?.asin ?? {};
        const trends = Array.isArray(payload?.couponTrends) ? payload.couponTrends : [];
        const latest = trends.length > 0 ? trends[trends.length - 1] : null;
        couponMap[a] = {
          asin: a,
          price: typeof asinInfo.price === "number" ? asinInfo.price : null,
          coupon_raw: asinInfo.coupon || null,
          coupon_trend_last: latest,
          coupon_trend_points: trends.length,
          // Keepa 口径：优惠真相在 couponTrends 里，asin.coupon 经常是空串
          coupon_type: latest?.type ?? null,
          coupon_list_price: typeof latest?.asinPrice === "number" ? latest.asinPrice : null,
          coupon_offer: typeof latest?.couponPrice === "number" ? latest.couponPrice : null,
          coupon_final_price: typeof latest?.finalPrice === "number" ? latest.finalPrice : null,
          coupon_last_date: latest?.date ?? null,
          source_coupon: "sellersprite.asin_detail_with_coupon_trend (Keepa 口径)",
        };
      } catch (e: any) {
        couponMap[a] = { asin: a, error: String(e?.message ?? e) };
      }
    }
  }

  // 5) 竞品发现（SIF ABA 真实点击行为）
  let competitors: any[] = [];
  try {
    const comp = await sif.call("market_get_keyword_root_competitors", { keyword_root: keyword, country: marketplace, pageSize: Math.min(20, Math.max(5, top_n)) });
    competitors = (comp?.competitors ?? []).map((c: any) => ({
      asin: cleanAsin(c.asin),
      covered_volume: c.covered_volume ?? null,
      keyword_count: c.keyword_count ?? null,
      rank1_count: c.rank1_count ?? null,
      top_keywords: (c.rank1_top_keywords ?? []).slice(0, 5),
    }));
    diagnostics.push({ step: "sif_competitors", quota: comp?._quota ?? null, total_analyzed: comp?.pagination?.analyzedCount ?? null });
  } catch (e: any) {
    diagnostics.push({ step: "sif_competitors", error: String(e?.message ?? e) });
  }

  return {
    input: { keyword, marketplace, month, node_id_path: nodePath || null, top_n },
    listings: listings.map((l: any) => ({ ...l, sif: sifMap[l.asin ?? ""] ?? null, coupon: couponMap[l.asin ?? ""] ?? null })),
    competitors,
    diagnostics,
    source_policy: {
      units: "SIF（销量以此为准）",
      revenue: "卖家精灵（销售额以此为准）",
      coupon: "卖家精灵 asin_detail_with_coupon_trend / Keepa 口径（优惠以此为准）",
    },
  };
}
