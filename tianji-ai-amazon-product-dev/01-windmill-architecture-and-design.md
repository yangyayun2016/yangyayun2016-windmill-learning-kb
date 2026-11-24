# 01 · Windmill 架构与编排思路

本篇解释 `amazon_product_development` v186181 为什么长成现在这样。依据是本目录的 OpenFlow、两份 TypeScript，以及 [03-troubleshooting-and-evolution.md](./03-troubleshooting-and-evolution.md) 里已经核对过的排错记录。

Flow 的一句话定义和 `results` / `flow_input` 的含义，仍以知识库正文为准：[../00-overview.md](../00-overview.md)、[../03-expressions-and-results.md](../03-expressions-and-results.md)。

## 1. 核心设计：确定性代码垫底，AI 只做判断

14 个模块分成两层。

| 层 | 模块 | `value.type` | 为什么用这种模块 |
| --- | --- | --- | --- |
| 数据底座 | `collect`、`validate` | `script` | 口径、偏差、采信必须每次一样。换一个模型不该换「销量认谁」 |
| 分析链 | `s01_overview`～`s12_review` | `aiagent` | 要读市场、拆差评、写升级和 BOM，步骤之间还要调用不同的 MCP 工具 |

采集和验证如果放进 Agent，模型会在工具结果上重新挑一个「看起来更合理」的源。这条 Flow 把这个选择从提示词里拿掉，写进代码。

`collect_market.ts` 开头的分工是硬约束，注释写明「任何一步都不许换源」：

- 销量 → SIF `ops_get_asin_sales_list`（`boughtInPastMonth` / `boughtHistory`）
- 销售额 → 卖家精灵 `product_research`（`revenue` / `units`，按月）
- coupon → 卖家精灵 `asin_detail_with_coupon_trend`（Keepa 口径的优惠趋势 + 成交价）
- 竞品发现 → SIF `market_get_keyword_root_competitors`（ABA 真实点击）

`cross_validate.ts` 把同一句话再说一遍，并加了一句边界：**偏差只用来判断这份数据能不能拿来做决策，不用来改采信源。**

AI 步骤收到的是已经采信过的对象（`market_summary`、`adopted`、`verification`、`competitors`），再加上上游 Agent 的**原文** `results.步骤id.output`。它们可以质疑数据够不够做决定，不能在提示词里把销量改成卖家精灵。

## 2. `collect`：一次采集，五个出口

脚本路径：`u/tianjikuajingyayun/collect_market`。入口：

```ts
export async function main(
  keyword: string,
  marketplace: string = "US",
  top_n: number = 10,
  with_coupon: boolean = true,
  node_id_path: string | null = null
)
```

Flow 把 `keyword` / `marketplace` / `top_n` / `with_coupon` 绑到 `flow_input`，`node_id_path` 传静态 `""`。空字符串在脚本里是 falsy，于是进入自动选类目。

### 2.1 资源只在运行时取出

```ts
const SIF = "u/tianjikuajingyayun/sif_mcp";
const SS = "u/tianjikuajingyayun/sellersprite_mcp";
```

`conn()` 调用 `wmill.getResource(path)`，要求对象上有 `url`，可选 `token` 和 `headers`。`token` 只放进当次请求的 `Authorization: Bearer ...`，不写进返回值。MCP 会话自己做 `initialize`（`protocolVersion: "2025-06-18"`，客户端名 `apd-collector`）和 `tools/call`，单次 `fetch` 超时 120 秒。响应按 SSE 的 `data:` 行解析，解析失败的行丢掉；如果整段正文本身是 JSON，也收进来。

### 2.2 五步采集，失败进 diagnostics，不中断整次采集

1. **类目节点**（卖家精灵 `product_node`）。先用关键词搜，再拿命中节点的父路径展开一次兄弟节点。打分规则写在代码里：关键词 token（长度大于 2）在 label 里出现得越多越好；同分时，叶节点里「关键词对不上的多余词」更少的优先，再优先层级更浅的路径。一个都解析不到，就在 diagnostics 里记警告，市场层退回关键词检索。这一步失败不致命。
2. **销售额**（`product_research`）。月份用 `pickLatestMonth()`：取 UTC 今天所在月的上一个月，格式 `yyyyMM`。注释说明这是 T+1 数据延迟。`size` 被夹在 1 和 50 之间，`variation` 固定 `"Y"`。有 `nodeIdPath` 就按节点查，否则用 `keyword`。行字段原样映射进 `listings`（价格、销量、销售额、毛利率、评分、BSR、FBA 费、包装尺寸重量、卖家国别等），并打上 `source_revenue: "sellersprite.product_research"`。
3. **销量**（SIF `ops_get_asin_sales_list`）。一次传入全部 ASIN，`timePieceType: "latelyDay"`，`timePieceValue: "30"`。`boughtHistory` 和 `boughtHistoryDates` 对齐后只留最近 6 个有数字的月。`boughtInPastMonth` 交给 `parseUnits`。
4. **coupon**。只对前 `min(5, asins.length)` 个 ASIN 调 `asin_detail_with_coupon_trend`，用来控额度。注释写明：Keepa 口径的优惠在 `couponTrends` 里，`asin.coupon` 经常是空串。脚本保存趋势最后一个点的 `type`、`asinPrice`、`couponPrice`、`finalPrice`、`date`。`with_coupon === false` 时整段跳过。
5. **竞品**。`market_get_keyword_root_competitors`，`pageSize` 在 5 和 20 之间，随 `top_n` 变化。每条留下 ASIN、覆盖搜索量、关键词数、排名第一的词数，以及最多 5 个 `rank1_top_keywords`。

返回值固定四块：`input`、`listings`（每行挂上 `sif` 和 `coupon`）、`competitors`、`diagnostics`，外加 `source_policy`。

### 2.3 销量分桶怎么变成数字

SIF 的销量可能是数字，也可能是带比较符或末尾加号的分桶字符串（源码注释里的例子是小于 50、`100+`、大于 `1K`）。`parseUnits` 的行为：

- 数字：`value` 为该数字，`is_bucket: false`。
- 空串或解析失败：`value: null`；带不了数字的字符串仍标 `is_bucket: true`，`bucket` 保留原文。
- 匹配到比较符或末尾 `+`：`is_bucket: true`，`value` 取边界值。`K` 乘 1000，`M` 乘 1,000,000。注释写的是「取边界值作为保守估计」。

这个 `is_bucket` 会进验证层，变成采信明细里的 `units_confidence: "分桶"`，以及告警 `SIF 销量为分桶值(...)`。`dog mats` 的 `all_flags` 里大量是这种告警。

## 3. `validate`：对齐、算偏差、定采信

脚本路径：`u/tianjikuajingyayun/cross_validate`。唯一入参是 `market`，Flow 表达式为 `results.collect`（脚本步骤的结果对象本身，不是 `.output`）。

输出三块，注释写明用途：

- `market_summary`：给 ①概览 / ②细分市场
- `verification`：数据采集对比
- `adopted`：下游统一口径

### 3.1 四个偏差，全是「(A − B) / B」

`pct(a, b)` 在 `b` 为 `null` 或 `0` 时返回 `null`，否则 `Math.round(((a - b) / b) * 10000) / 100`，也就是保留两位小数的百分比。

对每个 listing：

| 检查 | 算法 | 代码里的含义 |
| --- | --- | --- |
| 销量偏差 `units_deviation_pct` | `pct(SIF 近 30 天, 卖家精灵月销量)` | 两端时间窗本来就不同，只做量级校验 |
| 卖家精灵内部自洽 `ss_internal_selfcheck_pct` | `pct(revenue, units × averagePrice)` | `units` 或 `averagePrice` 缺失则为 `null` |
| 销售额交叉偏差 `revenue_cross_deviation_pct` | `pct(SIF 销量 × 成交价, 卖家精灵 revenue)` | 成交价优先用 Keepa 口径 |
| 价格离散 `price_spread_pct` | `pct(三源价格的最大值, 最小值)` | 三源是 listing 价、SIF 价、coupon 上的价格；少于 2 个价则为 `null` |

成交价 `finalPrice` 的优先级：

1. `coupon.coupon_final_price` 是数字时直接用。此时若 `coupon_offer` 是数字，`coupon_type` 记为 `"amount"`，否则 `"none"`。
2. 否则用 `finalPrice()` 解析原始 coupon 字符串：先认百分数（`10%` 这种），再认第一段数字当金额减免（`$5 off` 这种），空值则成交价等于标价、类型 `"none"`。解析用的标价顺序是 `coupon_list_price`，然后 `coupon.price`、`sif.price`、listing 的 `price`。

### 3.2 告警阈值和 verdict 的覆盖顺序

先收集 `flags`，再按下面的顺序赋值。后面的赋值会盖掉前面的：

1. 默认 `"高"`。
2. 任一 flag 含「缺失」或「失败」→ `"中"`。对应 flag 文案：`SIF 销量缺失`、`卖家精灵销量缺失`、`卖家精灵销售额缺失`、`coupon 取数失败`。
3. 卖家精灵销售额和 SIF 销量**同时**为 `null` → `"不可用"`。
4. `units_deviation_pct` 不是 `null` 且绝对值 **> 40** → `"低"`。

另外两个阈值只进 flags，不单独改 verdict：

- 销售额交叉偏差绝对值 **> 50** → `销售额交叉偏差 n%`
- 三源价格离散 **> 15** → `三源价格离散 n%`
- SIF 是分桶 → `SIF 销量为分桶值(原文)`

因此「销量偏差超过 40%」的行，即使前面已经被打成「中」或「不可用」，最终仍是 `"低"`。`verification.summary` 另外写了一句窗宽说明：偏差在 ±40% 内视为同量级。这和 flag 阈值是同一条 40% 界线。

`dog mats` 这次喂给 `s12` 的摘要是：`asin_count` 10，`high_confidence_rows` 0，`usable_rows` 0，`low_confidence_rows` 10，`unusable_rows` 0。10 行都落在 `"低"`。`usable_rows` 只统计 verdict 为「高」或「中」的行，所以低置信度不计入 usable。

### 3.3 采信值：偏差再大也不换源

`adopted` 每一行：

| 字段 | 取值 |
| --- | --- |
| `units_30d` / `units_source` | SIF 的 `units_30d`，来源固定 `"SIF"` |
| `units_confidence` | 分桶 → `"分桶"`；有数值 → `"数值"`；否则 `"缺失"` |
| `revenue_month` / `revenue_source` | 卖家精灵 `revenue`，来源固定 `"卖家精灵"`，月份标签用采集层的 `month` |
| `price_list` | listing 价格 |
| `price_final` | 上面算出的成交价 |
| `coupon` | 原始串、类型、数值、趋势点数，`source` 固定 `"Keepa 口径"` |

市场汇总前先按父体去重。注释说明：卖家精灵的 `units` / `revenue` 是父体级数字，同一父体的多个变体会各带一份相同的量，直接相加会把市场放大数倍。实现是按 `revenue_month` 从高到低排序，父 ASIN（没有父 ASIN 就用自己的 ASIN）只保留第一行。

汇总字段：

- `total_revenue_month`：去重后卖家精灵 revenue 之和，来源文案 `"卖家精灵 Σ revenue"`
- `total_units_30d`：去重后 SIF 销量之和，来源文案 `"SIF Σ units"`
- `price_median` / `price_min` / `price_max`
- `avg_profit_pct`、`avg_rating`
- `cn_seller_share_pct`：`seller_nation === "CN"` 的占比
- `top5_revenue_share_pct`：前 5 名 revenue 占合计的百分比
- `competitor_pool`：采集层竞品条数

`sample_size` 用的是去重**前**的 `adopted.length`。读 `market_summary` 时不要把它当成去重后的父体数。

## 4. 12 个 AI 步骤：同一模型，不同工具集

12 个节点的公共配置（导出 JSON 里都一样）：

| 字段 | 值 |
| --- | --- |
| `provider.kind` | `deepseek` |
| `provider.model` | `deepseek-v4-pro` |
| `provider.resource` | `$res:u/tianjikuajingyayun/ecstatic_deepseek` |
| `output_type` | `text` |
| `output_schema` | `null` |
| `temperature` / `streaming` / `memory` / `enabled_tools` / `max_completion_tokens` / `user_attachments` | `null` |

`output_schema` 被清空，是因为 DeepSeek 不接受 Windmill 为非空 schema 下发的 `response_format.type = json_schema`。结构改由 System Prompt 用文字约束。过程见 [03-troubleshooting-and-evolution.md](./03-troubleshooting-and-evolution.md)。

`reasoning_effort` **不是** 12 步都一样：

| 步骤 | `reasoning_effort` |
| --- | --- |
| `s01_overview` | `high` |
| `s02_segments`、`s03_benchmark`、`s04_attr_matrix` | 字段不存在，沿用模型默认 |
| `s05_death_modes`～`s12_review` | `none` |

`none` 是 `s05` 触发 DeepSeek 400（thinking 模式必须回传 `reasoning_content`）之后的临时绕过，映射为 DeepSeek `thinking: {type: "disabled"}`。`s01` 仍是 `high`，`s02`～`s04` 仍是默认。风险写在第 7 节和排错篇末尾。

## 5. 最小权限：按步骤裁剪 MCP

每个 AI 节点的工具都是 `tool_type: "mcp"`，`exclude_tools` 为空数组，真正生效的是 `include_tools`。资源只有两个：`u/tianjikuajingyayun/sellersprite_mcp`、`u/tianjikuajingyayun/sif_mcp`。

| 步骤 | 资源 | `include_tools` | `max_iterations` |
| --- | --- | --- | --- |
| `s01_overview` | 卖家精灵 | `market_research_statistics`、`market_brand_concentration`、`market_product_concentration`、`product_research` | 6 |
| `s01_overview` | SIF | `query_quota`、`market_get_keyword_root_competitors`、`ops_get_asin_sales_list` | 6 |
| `s02_segments` | 卖家精灵 | `market_price_distribution`、`market_rating_distribution`、`market_ratings_count_distribution`、`market_listing_date_distribution`、`market_seller_country_distribution`、`market_ebc_distribution`、`market_brand_concentration`、`market_product_concentration`、`market_research_statistics`、`market_product_demand_trend`、`product_node`、`product_research` | 10 |
| `s03_benchmark` | SIF | `market_get_keyword_root_competitors`、`market_discover_competitors`、`market_get_asin_profile`、`ops_get_asin_sales_list`、`query_quota` | 12 |
| `s03_benchmark` | 卖家精灵 | `asin_detail`、`asin_competitor`、`competitor_lookup`、`product_research`、`review`、`asin_detail_with_coupon_trend` | 12 |
| `s04_attr_matrix` | 卖家精灵 | `product_research`、`asin_detail`、`asin_competitor`、`market_price_distribution`、`market_rating_distribution` | 10 |
| `s04_attr_matrix` | SIF | `market_get_asin_profile` | 10 |
| `s05_death_modes` | 卖家精灵 | `review`、`asin_detail`、`competitor_lookup` | 12 |
| `s06_gap_matrix` | 无 | 空数组 | 4 |
| `s07_upgrade_plan` | 无 | 空数组 | 4 |
| `s08_cost_packaging` | SIF | `market_estimate_profit_threshold`、`market_assess_keyword_promotion`、`query_quota` | 10 |
| `s08_cost_packaging` | 卖家精灵 | `asin_detail`、`product_research`、`asin_detail_with_coupon_trend` | 10 |
| `s09_hypothesis_cards` | 无 | 空数组 | 4 |
| `s10_bom` | 卖家精灵 | `asin_detail`、`product_research` | 8 |
| `s11_test_plan` | SIF | `market_get_keyword_demand`、`market_get_keyword_competition`、`market_screen_keyword_opportunities`、`market_assess_keyword_promotion`、`market_get_keyword_root_trend`、`query_quota` | 10 |
| `s12_review` | 无 | 空数组 | 4 |

裁剪的原因，从工具名单和提示词对得上，不是抽象原则：

- **每步只看见自己那一问要用的工具。** `s05` 只留评论和详情，是因为 System Prompt 要求差评原句必须来自 `review` 的返回，拿不到就写「评论数据不足」。给它市场分布工具，不会让这句铁律更好执行。
- **和采信政策一致。** `s01` 的 SIF 工具是销量和竞品，卖家精灵工具是类目结构和集中度。提示词再要求「销量必标 SIF，销售额必标卖家精灵」。
- **带工具的步骤把 `max_iterations` 放到 6～12，纯推理步骤固定为 4。** 工具循环会吃迭代次数；不调工具的步骤没有这个预算。
- **SIF 额度在采集层就已经收过一次。** coupon 只打前 5 个 ASIN，`product_research` 的 `size` 不超过 50。若干 SIF 工具集里带了 `query_quota`，模型可以在那些步骤里看剩余额度。`query_quota` 没有出现在纯卖家精灵的步骤上。

### 为什么 `s06` / `s07` / `s09` / `s12` 是零工具

这四步的 System Prompt 都是在压缩上游原文，不要求新的外部数据：

| 步骤 | 提示词里的职责 | 读哪些上游 |
| --- | --- | --- |
| `s06_gap_matrix` | 把前五个阶段压成差距矩阵，「不要重新发明数据」 | `s01`～`s05` 的 `output` |
| `s07_upgrade_plan` | 只针对差距矩阵里必须补齐的项和高危死法写升级点 | `s06`、`s05`、`s04` 的 `output`，加 `market_summary` |
| `s09_hypothesis_cards` | 把还没被验证的判断写成可证伪的假设卡 | `s01`、`s07`、`s08`、`s06` 的 `output` |
| `s12_review` | 以试销计划为基准做复盘模板 | `s09`、`s11`、`s08` 的 `output`，加 `verification.summary` 和 `all_flags` |

零工具同时缩小了 DeepSeek 多轮工具调用的表面。`reasoning_content` 那个 400 就是在带工具的 `s05` 上先爆出来的。零工具步骤即使 `reasoning_effort` 不是 `none`，也没有工具循环要把 `reasoning_content` 回传。这次它们仍然设了 `none`，因为绕过是按 `s05`～`s12` 一整段做的，不是按「有没有工具」逐个挑的。

## 6. 凭据和 Flow 定义分开

OpenFlow 里 DeepSeek 只出现为：

```text
$res:u/tianjikuajingyayun/ecstatic_deepseek
```

两个 MCP 只出现为资源路径 `u/tianjikuajingyayun/sellersprite_mcp` 和 `u/tianjikuajingyayun/sif_mcp`。

脚本侧用 `wmill.getResource(...)` 在 job 里取 `url` / `token` / `headers`。返回给下游的 `listings`、`diagnostics`、`source_policy` 不包含这些字段。本仓库提交的 JSON 和 TypeScript 里没有 API Key、Bearer token 或邮箱；导入到自己的 workspace 时，密钥仍只创建在 Resource 上。步骤见 [05-reproduce-in-your-workspace.md](./05-reproduce-in-your-workspace.md)。

知识库对 Resource 的一般约定见 [../00-overview.md](../00-overview.md)：表达式用 `resource(path)`，不要把密钥写进步骤输入。这条 Flow 的 AI 节点走的是 provider 上的 `$res:` 绑定，采集脚本走的是 `getResource`，两边都没有把密钥放进 `input_transforms`。

## 7. 长链路怎么跑完：续跑、纯文本、配额

### 7.1 断点续跑

`v186181` 能到 100%，靠的是 Windmill 的 **Re-start from**（运行页顶部的控件，截图里能看到），加上上游结果 **reused**，并且续跑时选定部署版本 **v186181**。

这次成功截图的墙钟是 5 分 58 秒，对应 `s05`～`s12`。前面的 `collect` 到 `s04` 复用已完成结果，不重新打 SIF / 卖家精灵，也不重新跑 `s01` 的 `reasoning_effort: high`。

续跑时版本必须和产生那些 `results` 的定义一致。`v186041` 还在对 `s02` 做 `JSON.parse`，`v186181` 已经改成传原文。用错版本去续跑，复用的结果对不上新表达式。

### 7.2 步骤之间传原文，不 `JSON.parse`

`output_schema` 清空之后，Agent 的 `output` 是一段文本：中文说明，加上 Markdown 围栏里的 JSON。`v186041` 在 `s03` 的 QuickJS 表达式里 `JSON.parse(results.s02_segments.output)`，解析到中文「基」就报 `Unexpected token`。

`v186181` 的 user message 全部是「把上游 `.output` 放进对象，再 `JSON.stringify`」。例如 `s03`：

```js
JSON.stringify({
  阶段: "对标与元素",
  输入: flow_input,
  主攻细分: results.s02_segments.output,
  采集竞品池: results.validate.competitors,
  采信明细: results.validate.adopted,
})
```

`results.s02_segments.output` 作为字符串放进对象。`JSON.stringify` 会把它转义，不会去解析围栏里的 JSON。脚本步骤例外：`validate` 读的是 `results.collect`，因为 TypeScript 返回的是对象，不是文本。

代价是下游模型要自己从「说明 + 代码块」里读结构。`dog mats` 的 `s12` user message 里，假设卡原文以 json 代码围栏开头，而不是一个已解析的对象。复盘仍然产出了可解析的 JSON 文本，说明这条传递方式在这次运行里是通的。

### 7.3 执行配额

这次 Cloud workspace 上核对到的计算口径：

- **1 exec = 1 秒 compute**
- **1 seat = 10,000 execs / 月**
- 按自然月重置

早期免费额度触发过 `exceeded the free usage limit of 1000`。升级、月度配额恢复之后，workspace 额度是 **10,000 / 月**。这次完整跑通后，界面显示 **2,398 / 10,000**。

AI 步骤的 `usage`（例如 `s12` 的 9886 total tokens）是模型 token，和 exec 计数不是同一个数。一条 6 分钟的步骤大约对应数百 exec，所以 12 个 Agent 串起来会很快吃掉免费的 1000。续跑复用上游，是这条链路控制 exec 的主要办法：失败的后半段不必把 `s02` 的 6 分 19 秒再付一次。

## 8. 还没收口的风险

`s05`～`s12` 的 `reasoning_effort: "none"` 让 `v186181` 跑通了，它没有修好 worker。

- `s01` 仍是 `high`。
- `s02`、`s03`、`s04` 没有设置 `reasoning_effort`。这三步在那次续跑里碰巧通过。
- 全量重跑时，如果模型打开 thinking，并且这三步里任意一步进入多轮工具调用，DeepSeek 仍可能返回同一个 400：`The reasoning_content in the thinking mode must be passed back to the API`。
- 彻底修复是 Windmill worker 在多轮工具调用里把上一轮 `reasoning_content` 序列化回去。在那之前，带工具的 DeepSeek 节点应统一设为 `reasoning_effort: "none"`。

细节和 issue / PR 链接见 [03-troubleshooting-and-evolution.md](./03-troubleshooting-and-evolution.md)。
