// 交叉验证层：把三个数据源的同口径指标对齐、算偏差、给采信结论。
//
// 采信规则（与你定的口径一致，不随数据好坏改口径）：
//   · 销量     → 永远采 SIF
//   · 销售额   → 永远采卖家精灵
//   · 优惠/coupon → 采 Keepa 口径（卖家精灵 asin_detail_with_coupon_trend）
// 偏差只用来判断「这份数据能不能拿来做决策」，不用来改采信源。
//
// 输入：collect_market 的输出
// 输出：market_summary（①概览用）+ verification（数据采集对比验证用）+ adopted（下游统一口径）
type Row = {
  asin: string | null;
  title?: string | null;
  brand?: string | null;
  price: number | null;
  avg_price?: number | null;
  units_ss: number | null;
  revenue_ss: number | null;
  profit_pct?: number | null;
  rating?: number | null;
  ratings?: number | null;
  bsr?: number | null;
  fba_fee?: number | null;
  seller_nation?: string | null;
  variations?: number | null;
  size_type?: string | null;
  pkg_weight?: string | null;
  pkg_dimensions?: string | null;
  month?: string;
  sif?: any;
  coupon?: any;
};

const n = (v: any): number | null => (typeof v === "number" && isFinite(v) ? v : null);
const pct = (a: number | null, b: number | null): number | null => {
  if (a === null || b === null || b === 0) return null;
  return Math.round(((a - b) / b) * 10000) / 100;
};
const round = (v: number | null, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** 优惠后成交价：原价 - coupon；coupon 可能是 "10%" / "$5 off" / "" */
function finalPrice(price: number | null, couponRaw: any): { final: number | null; coupon_type: string | null; coupon_value: number | null } {
  const p = n(price);
  if (p === null) return { final: null, coupon_type: null, coupon_value: null };
  if (!couponRaw) return { final: p, coupon_type: "none", coupon_value: 0 };
  const s = String(couponRaw).trim();
  const pctM = s.match(/([0-9.]+)\s*%/);
  if (pctM) {
    const v = parseFloat(pctM[1]);
    return { final: round(p * (1 - v / 100)), coupon_type: "percent", coupon_value: v };
  }
  const amtM = s.match(/([0-9.]+)/);
  if (amtM) {
    const v = parseFloat(amtM[1]);
    return { final: round(Math.max(0, p - v)), coupon_type: "amount", coupon_value: v };
  }
  return { final: p, coupon_type: "unknown", coupon_value: null };
}

function median(xs: number[]): number | null {
  const a = xs.filter((x) => typeof x === "number" && isFinite(x)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : round((a[mid - 1] + a[mid]) / 2);
}

export async function main(market: any) {
  const rows: Row[] = Array.isArray(market?.listings) ? market.listings : [];
  const month = market?.input?.month ?? null;

  const checks: any[] = [];
  const adopted: any[] = [];

  for (const r of rows) {
    const sif = r.sif ?? null;
    const coupon = r.coupon ?? null;

    // 1) 销量偏差：SIF 近30天 vs 卖家精灵月销量（两端时间窗不完全同口径，只做量级校验）
    const unitsSif = n(sif?.units_30d);
    const unitsSs = n(r.units_ss);
    const unitsDev = pct(unitsSif, unitsSs);

    // 2) 卖家精灵内部自洽：月销量 × 均价 ≈ 月销售额
    const ssSelf = pct(r.revenue_ss, unitsSs !== null && r.avg_price ? round(unitsSs * r.avg_price) : null);

    // 3) 交叉估算：SIF 销量 × 实际成交价 ≈ 卖家精灵销售额
    // Keepa 口径的优惠在 couponTrends 的最后一个点上（asin.coupon 通常是空串），
    // coupon_list_price 是当时的原价，coupon_offer 是优惠金额，coupon_final_price 是成交价。
    const couponFinal = n(coupon?.coupon_final_price);
    const couponList = n(coupon?.coupon_list_price);
    const couponOffer = n(coupon?.coupon_offer);
    const fp =
      couponFinal !== null
        ? { final: couponFinal, coupon_type: couponOffer !== null ? "amount" : "none", coupon_value: couponOffer }
        : finalPrice(couponList ?? n(coupon?.price) ?? n(sif?.price) ?? n(r.price), coupon?.coupon_raw);
    const revenueFromSif = unitsSif !== null && fp.final !== null ? round(unitsSif * fp.final) : null;
    const revenueDev = pct(revenueFromSif, n(r.revenue_ss));

    // 4) 价格一致性：三个源的价格是否对得上
    const prices = [n(r.price), n(sif?.price), n(coupon?.price)].filter((x): x is number => x !== null);
    const priceSpread = prices.length >= 2 ? pct(Math.max(...prices), Math.min(...prices)) : null;

    const flags: string[] = [];
    if (unitsSif === null) flags.push("SIF 销量缺失");
    if (unitsSs === null) flags.push("卖家精灵销量缺失");
    if (n(r.revenue_ss) === null) flags.push("卖家精灵销售额缺失");
    if (sif?.units_is_bucket) flags.push(`SIF 销量为分桶值(${sif.units_30d_raw})`);
    if (unitsDev !== null && Math.abs(unitsDev) > 40) flags.push(`销量跨源偏差 ${unitsDev}%`);
    if (revenueDev !== null && Math.abs(revenueDev) > 50) flags.push(`销售额交叉偏差 ${revenueDev}%`);
    if (priceSpread !== null && priceSpread > 15) flags.push(`三源价格离散 ${priceSpread}%`);
    if (coupon?.error) flags.push(`coupon 取数失败`);

    let verdict: "高" | "中" | "低" | "不可用" = "高";
    if (flags.some((f) => f.includes("缺失") || f.includes("失败"))) verdict = "中";
    if (n(r.revenue_ss) === null && unitsSif === null) verdict = "不可用";
    if (unitsDev !== null && Math.abs(unitsDev) > 40) verdict = "低";

    checks.push({
      asin: r.asin,
      title: r.title,
      units_sif_30d: unitsSif,
      units_sif_raw: sif?.units_30d_raw ?? null,
      units_ss_month: unitsSs,
      units_deviation_pct: unitsDev,
      revenue_ss: n(r.revenue_ss),
      revenue_from_sif_estimate: revenueFromSif,
      revenue_cross_deviation_pct: revenueDev,
      ss_internal_selfcheck_pct: ssSelf,
      price_spread_pct: priceSpread,
      coupon_raw: coupon?.coupon_raw ?? null,
      final_price: fp.final,
      verdict,
      flags,
      sources: {
        units: "SIF",
        revenue: "卖家精灵",
        coupon: "Keepa 口径（卖家精灵）",
      },
    });

    // 下游统一口径：销量取 SIF，销售额取卖家精灵，优惠取 Keepa 口径
    adopted.push({
      asin: r.asin,
      title: r.title,
      brand: r.brand,
      units_30d: unitsSif,
      units_source: "SIF",
      units_confidence: sif?.units_is_bucket ? "分桶" : unitsSif !== null ? "数值" : "缺失",
      revenue_month: n(r.revenue_ss),
      revenue_source: "卖家精灵",
      revenue_month_label: month,
      price_list: n(r.price),
      price_final: fp.final,
      coupon: { raw: coupon?.coupon_raw ?? null, type: fp.coupon_type, value: fp.coupon_value, trend_points: coupon?.coupon_trend_points ?? 0, source: "Keepa 口径" },
      rating: n(r.rating),
      ratings: n(r.ratings),
      profit_pct: n(r.profit_pct),
      bsr: n(r.bsr),
      fba_fee: n(r.fba_fee),
      seller_nation: r.seller_nation ?? null,
      variations: n(r.variations as any),
      size_type: r.size_type ?? null,
      pkg_weight: r.pkg_weight ?? null,
      pkg_dimensions: r.pkg_dimensions ?? null,
    });
  }

  // ---- 市场层汇总（①概览 / ②细分市场 用） ----
  // 卖家精灵的 units/revenue 是「父体级」的数字：同一父体的多个变体会各自返回同一个量，
  // 直接求和会把市场总额放大数倍。这里先按 parent ASIN 去重，再汇总。
  const parentOf: Record<string, string | null> = {};
  for (const r of rows) if (r.asin) parentOf[r.asin] = (r as any).parent ?? null;

  const seenParents = new Set<string>();
  const unique: any[] = [];
  for (const a of [...adopted].sort((x, y) => (y.revenue_month ?? 0) - (x.revenue_month ?? 0))) {
    const key = (a.asin && parentOf[a.asin]) || a.asin || `unknown_${unique.length}`;
    if (seenParents.has(key)) continue;
    seenParents.add(key);
    unique.push(a);
  }

  const revs = unique.map((a) => a.revenue_month).filter((x): x is number => x !== null);
  const totalRevenue = revs.length ? round(revs.reduce((a, b) => a + b, 0)) : null;
  const unitsList = unique.map((a) => a.units_30d).filter((x): x is number => x !== null);
  const prices = unique.map((a) => a.price_list).filter((x): x is number => x !== null);
  const profits = unique.map((a) => a.profit_pct).filter((x): x is number => x !== null);
  const ratings = unique.map((a) => a.rating).filter((x): x is number => x !== null);
  const cnShare = unique.length ? round((unique.filter((a) => a.seller_nation === "CN").length / unique.length) * 100) : null;
  const top5RevShare = totalRevenue && totalRevenue > 0 ? round((revs.sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) / totalRevenue) * 100) : null;

  const usable = checks.filter((c) => c.verdict === "高" || c.verdict === "中").length;

  return {
    adopted,
    verification: {
      summary: {
        asin_count: checks.length,
        usable_rows: usable,
        high_confidence_rows: checks.filter((c) => c.verdict === "高").length,
        low_confidence_rows: checks.filter((c) => c.verdict === "低").length,
        unusable_rows: checks.filter((c) => c.verdict === "不可用").length,
        units_window_caveat: "SIF 为近 30 天出单，卖家精灵 units 为自然月出单，两端窗宽不同，偏差在 ±40% 内视为同量级",
      },
      per_asin: checks,
      all_flags: Array.from(new Set(checks.flatMap((c) => c.flags))),
      source_policy: market?.source_policy ?? null,
      diagnostics: market?.diagnostics ?? [],
    },
    market_summary: {
      keyword: market?.input?.keyword ?? null,
      marketplace: market?.input?.marketplace ?? null,
      month,
      node_id_path: market?.input?.node_id_path ?? null,
      sample_size: adopted.length,
      total_revenue_month: totalRevenue,
      total_revenue_source: "卖家精灵 Σ revenue",
      total_units_30d: unitsList.length ? round(unitsList.reduce((a, b) => a + b, 0)) : null,
      total_units_source: "SIF Σ units",
      price_median: median(prices),
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
      avg_profit_pct: profits.length ? round(profits.reduce((a, b) => a + b, 0) / profits.length) : null,
      avg_rating: ratings.length ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
      cn_seller_share_pct: cnShare,
      top5_revenue_share_pct: top5RevShare,
      competitor_pool: (market?.competitors ?? []).length,
    },
    competitors: market?.competitors ?? [],
  };
}
