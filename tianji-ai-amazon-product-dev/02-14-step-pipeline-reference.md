# 02 · 14 步全流程拆解

依据：[flow/amazon_product_development.v186181.flow.json](./flow/amazon_product_development.v186181.flow.json)、[scripts/collect_market.ts](./scripts/collect_market.ts)、[scripts/cross_validate.ts](./scripts/cross_validate.ts)。

逐步耗时是这次跑通核对的步骤用时。续跑段 `s05`～`s12` 的墙钟是 5 分 58 秒，总状态 100% Success。总览表在 [README.md](./README.md)。

12 个 AI 步骤共用这些配置，下面每个步骤不再重复：

- `provider.kind = deepseek`，`provider.model = deepseek-v4-pro`
- `provider.resource = $res:u/tianjikuajingyayun/ecstatic_deepseek`
- `output_type = text`，`output_schema = null`
- `temperature`、`streaming`、`memory`、`enabled_tools`、`max_completion_tokens`、`user_attachments` 均为 `null`
- System Prompt 与 User Prompt 表达式的全文在 [04-prompts-catalog.md](./04-prompts-catalog.md)

User message 都是 JavaScript 表达式：运行时求值后变成字符串，交给模型。表达式里出现的 `results.*.output` 是上游 AI 步骤的原文，不再 `JSON.parse`。下面为了阅读把对象字段拆成多行；导出文件里是同一段逻辑的单行表达式，逐字原文在 [04-prompts-catalog.md](./04-prompts-catalog.md)。

## collect · 采集

| 项 | 值 |
| --- | --- |
| ID | `collect` |
| 中文名 | 采集：SIF 销量 + 卖家精灵销售额 + Keepa 口径 coupon |
| 模块类型 | `script` |
| 脚本路径 | `u/tianjikuajingyayun/collect_market` |
| 分组 | 数据底座 |
| 实测耗时 | 5.925s |

输入：

| 参数 | 变换 |
| --- | --- |
| `keyword` | `flow_input.keyword` |
| `marketplace` | `flow_input.marketplace` |
| `top_n` | `flow_input.top_n` |
| `with_coupon` | `flow_input.with_coupon` |
| `node_id_path` | 静态 `""` |

职责：按写死的源拉类目、月销售额、近 30 天销量、头部 ASIN 的 Keepa 口径 coupon、ABA 竞品。单步失败写入 `diagnostics`，不把整次采集打成异常（MCP `initialize` 或资源缺 `url` 仍会抛错）。

交付物：`input`、`listings`（带 `sif` 与 `coupon`）、`competitors`、`diagnostics`、`source_policy`。

没有模型，没有 MCP `include_tools`。脚本自己用资源路径连 MCP，见 [01-windmill-architecture-and-design.md](./01-windmill-architecture-and-design.md)。

## validate · 交叉验证

| 项 | 值 |
| --- | --- |
| ID | `validate` |
| 中文名 | 交叉验证：三方口径对齐、算偏差、定采信值 |
| 模块类型 | `script` |
| 脚本路径 | `u/tianjikuajingyayun/cross_validate` |
| 分组 | 数据底座 |
| 实测耗时 | 0.158s |

输入：`market = results.collect`。

职责：算销量偏差、卖家精灵内部自洽、销售额交叉偏差、三源价格离散；按「高 / 中 / 低 / 不可用」给 verdict；采信值永远是销量 SIF、销售额卖家精灵、优惠 Keepa 口径。市场汇总前按父 ASIN 去重。

交付物：`adopted`、`verification`（含 `summary`、`per_asin`、`all_flags`）、`market_summary`、`competitors`。

`dog mats` 这次的 `verification.summary` 是 10 行全部 `低`（`low_confidence_rows = 10`，`usable_rows = 0`）。数字来自 `s12` 的入参，见 [examples/dog-mats-us-s12-review.md](./examples/dog-mats-us-s12-review.md)。

## s01_overview · ①概览

| 项 | 值 |
| --- | --- |
| ID | `s01_overview` |
| 中文名 | ①概览 |
| 模块类型 | `aiagent` |
| 分组 | 市场判定 ①-② |
| `reasoning_effort` | `high` |
| `max_iterations` | 6 |
| `continue_on_error` | `false`（只有这一步在模块上写了该字段） |
| 实测耗时 | 47.691s |

输入表达式：

```js
JSON.stringify({
  阶段: "概览",
  输入: flow_input,
  市场汇总: results.validate.market_summary,
  可信度: results.validate.verification.summary,
  采信明细: results.validate.adopted,
})
```

MCP：

| id | 资源 | `include_tools` |
| --- | --- | --- |
| `t_ss_s01` | `u/tianjikuajingyayun/sellersprite_mcp` | `market_research_statistics`、`market_brand_concentration`、`market_product_concentration`、`product_research` |
| `t_sif_s01` | `u/tianjikuajingyayun/sif_mcp` | `query_quota`、`market_get_keyword_root_competitors`、`ops_get_asin_sales_list` |

工具说明（导出里的 summary / description）：卖家精灵「类目结构与集中度数据」；SIF「销量与竞争格局」。

职责：输出概览结论。Prompt 要求返回的键是：结论（进入 / 观察 / 放弃）、一句话判断、市场规模、竞争格局、机会点、风险点、数据可信度。只许使用给定数据，缺数字写「数据不足」。销量必须标注来自 SIF，销售额必须标注来自卖家精灵。

交付物：`results.s01_overview.output` 文本。

## s02_segments · ②细分市场

| 项 | 值 |
| --- | --- |
| ID | `s02_segments` |
| 中文名 | ②细分市场 |
| 模块类型 | `aiagent` |
| 分组 | 市场判定 ①-② |
| `reasoning_effort` | 未设置 |
| `max_iterations` | 10 |
| 实测耗时 | 6m 19s |

输入表达式：

```js
JSON.stringify({
  阶段: "细分市场",
  输入: flow_input,
  市场汇总: results.validate.market_summary,
  类目节点: results.validate.market_summary.node_id_path,
  概览: results.s01_overview.output,
})
```

MCP：只有卖家精灵 `t_ss_s02`，「市场分布与集中度工具」。

`include_tools`：`market_price_distribution`、`market_rating_distribution`、`market_ratings_count_distribution`、`market_listing_date_distribution`、`market_seller_country_distribution`、`market_ebc_distribution`、`market_brand_concentration`、`market_product_concentration`、`market_research_statistics`、`market_product_demand_trend`、`product_node`、`product_research`。

职责：把市场拆成 3～6 个可以独立进入的细分，每个都要有量化依据。返回键：细分市场数组（名称、月销售额、销量、价格带、集中度、评分门槛、进入难度、机会评级、选择理由）、推荐主攻细分。

交付物：`results.s02_segments.output`。这一步是整条链最慢的一段。清空 `output_schema` 之后，它的输出是「中文说明 + Markdown JSON」，后续步骤必须传原文。

## s03_benchmark · ③对标与元素

| 项 | 值 |
| --- | --- |
| ID | `s03_benchmark` |
| 中文名 | ③对标与元素 |
| 模块类型 | `aiagent` |
| 分组 | 产品定义 ③-④ |
| `reasoning_effort` | 未设置 |
| `max_iterations` | 12 |
| 实测耗时 | 2m 31s |

输入表达式：

```js
JSON.stringify({
  阶段: "对标与元素",
  输入: flow_input,
  主攻细分: results.s02_segments.output,
  采集竞品池: results.validate.competitors,
  采信明细: results.validate.adopted,
})
```

这里已经不再 `JSON.parse` 上游 `output`。`v186041` 的失败点就是这一步，见排错篇。

MCP：

| id | 资源 | `include_tools` |
| --- | --- | --- |
| `t_sif_s03` | SIF，「ASIN 画像与竞品发现」 | `market_get_keyword_root_competitors`、`market_discover_competitors`、`market_get_asin_profile`、`ops_get_asin_sales_list`、`query_quota` |
| `t_ss_s03` | 卖家精灵，「竞品与详情」 | `asin_detail`、`asin_competitor`、`competitor_lookup`、`product_research`、`review`、`asin_detail_with_coupon_trend` |

职责：锁定 3～5 个对标 ASIN，优先主攻细分里的头部和高增长款。Prompt 要求竞品发现先走 SIF 的竞品发现工具做概览，再深挖。返回键：对标 ASIN、可复用元素、差异化空位。

交付物：`results.s03_benchmark.output`。

## s04_attr_matrix · ④属性矩阵

| 项 | 值 |
| --- | --- |
| ID | `s04_attr_matrix` |
| 中文名 | ④属性矩阵 |
| 模块类型 | `aiagent` |
| 分组 | 产品定义 ③-④ |
| `reasoning_effort` | 未设置 |
| `max_iterations` | 10 |
| 实测耗时 | 4m 25s |

输入表达式：

```js
JSON.stringify({
  阶段: "属性矩阵",
  输入: flow_input,
  对标: results.s03_benchmark.output,
  采信明细: results.validate.adopted,
  竞品池: results.validate.competitors,
})
```

MCP：

| id | 资源 | `include_tools` |
| --- | --- | --- |
| `t_ss_s04` | 卖家精灵，「属性、变体与分布数据」 | `product_research`、`asin_detail`、`asin_competitor`、`market_price_distribution`、`market_rating_distribution` |
| `t_sif_s04` | SIF，「ASIN 基础属性与变体」 | `market_get_asin_profile` |

职责：回答哪些取值组合被市场认可，哪些被低估（有销量但评分低，即改进机会）。属性要能落到产品定义和开模：尺寸、厚度、材质、结构、配件、颜色、包装形态。返回键：属性、被低估的取值、必备门槛取值。

交付物：`results.s04_attr_matrix.output`。

## s05_death_modes · ⑤差评死法

| 项 | 值 |
| --- | --- |
| ID | `s05_death_modes` |
| 中文名 | ⑤差评死法 |
| 模块类型 | `aiagent` |
| 分组 | 痛点与差距 ⑤-⑦ |
| `reasoning_effort` | `none` |
| `max_iterations` | 12 |
| 实测耗时 | 1m 2s |

输入表达式：

```js
JSON.stringify({
  阶段: "差评死法",
  输入: flow_input,
  对标: results.s03_benchmark.output,
  属性: results.s04_attr_matrix.output,
})
```

MCP：只有卖家精灵 `t_ss_s05`，「评论与详情」。`include_tools`：`review`、`asin_detail`、`competitor_lookup`。

职责：用 `review` 拉对标 ASIN 的 1～3 星差评，归纳死法。铁律写在 Prompt 里：差评原句必须来自工具返回，禁止编造；拿不到就写「评论数据不足」。返回键：死法（含原句、来源 ASIN、频次、场景、部件、失效机理、可规避方案、严重度）、结构风险清单、评论数据说明。

交付物：`results.s05_death_modes.output`。

这一步是 `v186041` → `v186181` 的失败点：DeepSeek thinking 模式下，worker 没有把 `reasoning_content` 回传。`reasoning_effort: "none"` 从这里开始，一直覆盖到 `s12`。

## s06_gap_matrix · ⑥差距矩阵

| 项 | 值 |
| --- | --- |
| ID | `s06_gap_matrix` |
| 中文名 | ⑥差距矩阵 |
| 模块类型 | `aiagent` |
| 分组 | 痛点与差距 ⑤-⑦ |
| `reasoning_effort` | `none` |
| `max_iterations` | 4 |
| 工具 | 空数组 |
| 实测耗时 | 24.981s |

输入表达式：

```js
JSON.stringify({
  阶段: "差距矩阵",
  输入: flow_input,
  概览: results.s01_overview.output,
  细分: results.s02_segments.output,
  对标: results.s03_benchmark.output,
  属性: results.s04_attr_matrix.output,
  死法: results.s05_death_modes.output,
})
```

职责：把前五个阶段压成结构化取舍。Prompt 写明不要重新发明数据。返回键：差距（维度、头部水平、我方现状或目标、差距、是否必须补齐、补齐成本等级）、核心结论。

交付物：`results.s06_gap_matrix.output`。

## s07_upgrade_plan · ⑦升级方案

| 项 | 值 |
| --- | --- |
| ID | `s07_upgrade_plan` |
| 中文名 | ⑦升级方案 |
| 模块类型 | `aiagent` |
| 分组 | 痛点与差距 ⑤-⑦ |
| `reasoning_effort` | `none` |
| `max_iterations` | 4 |
| 工具 | 空数组 |
| 实测耗时 | 49.701s |

输入表达式：

```js
JSON.stringify({
  阶段: "升级方案",
  输入: flow_input,
  差距矩阵: results.s06_gap_matrix.output,
  死法: results.s05_death_modes.output,
  属性矩阵: results.s04_attr_matrix.output,
  市场汇总: results.validate.market_summary,
})
```

职责：针对必须补齐的差距和高危死法，写结构、材料、工艺、配件上的可执行方案。升级点要能直接进 BOM。返回键：升级点（升级项、解决什么、实现方式、成本增量、预期效果、优先级）、产品定义一句话。

交付物：`results.s07_upgrade_plan.output`。

## s08_cost_packaging · ⑧成本与包装

| 项 | 值 |
| --- | --- |
| ID | `s08_cost_packaging` |
| 中文名 | ⑧成本与包装 |
| 模块类型 | `aiagent` |
| 分组 | 成本与假设 ⑧-⑨ |
| `reasoning_effort` | `none` |
| `max_iterations` | 10 |
| 实测耗时 | 1m |

输入表达式：

```js
JSON.stringify({
  阶段: "成本与包装",
  输入: flow_input,
  目标售价: flow_input.target_price,
  目标毛利率_pct: flow_input.target_margin_pct,
  升级方案: results.s07_upgrade_plan.output,
  采信明细: results.validate.adopted,
  市场汇总: results.validate.market_summary,
})
```

MCP：

| id | 资源 | `include_tools` |
| --- | --- | --- |
| `t_sif_s08` | SIF，「采购成本上限反推与推广可行性」 | `market_estimate_profit_threshold`、`market_assess_keyword_promotion`、`query_quota` |
| `t_ss_s08` | 卖家精灵，「FBA 费、尺寸重量、价格与优惠」 | `asin_detail`、`product_research`、`asin_detail_with_coupon_trend` |

职责：用 SIF 的采购成本上限反推做核心测算，结合卖家精灵的 FBA 费、尺寸重量和毛利率。每个数字要说明来源（工具返回或计算式），估算值要标注「估算」。返回键：成本结构、包装方案、数据来源说明。

交付物：`results.s08_cost_packaging.output`。`dog mats` 的复盘把这一步和升级方案对质，指出采购上限和升级项成本对不上，见案例文档。

## s09_hypothesis_cards · ⑨假设卡

| 项 | 值 |
| --- | --- |
| ID | `s09_hypothesis_cards` |
| 中文名 | ⑨假设卡 |
| 模块类型 | `aiagent` |
| 分组 | 成本与假设 ⑧-⑨ |
| `reasoning_effort` | `none` |
| `max_iterations` | 4 |
| 工具 | 空数组 |
| 实测耗时 | 36.09s |

输入表达式：

```js
JSON.stringify({
  阶段: "假设卡",
  输入: flow_input,
  概览: results.s01_overview.output,
  升级方案: results.s07_upgrade_plan.output,
  成本: results.s08_cost_packaging.output,
  差距: results.s06_gap_matrix.output,
})
```

职责：把还没被验证的关键判断写成可执行、可证伪的假设卡。Prompt 禁止「大概会好卖」这种句子。返回键：假设（编号、假设内容、验证方式、验证指标、通过阈值、最晚验证时间、不通过时动作、关联升级项）、最高风险假设。

交付物：`results.s09_hypothesis_cards.output`。`s12` 读到的是带 json 代码围栏的原文，不是解析后的对象；复盘把它收成 H-01～H-09 的当前状态。

## s10_bom · ⑩开模 BOM 表

| 项 | 值 |
| --- | --- |
| ID | `s10_bom` |
| 中文名 | ⑩开模BOM表 |
| 模块类型 | `aiagent` |
| 分组 | 落地 ⑩-⑪ |
| `reasoning_effort` | `none` |
| `max_iterations` | 8 |
| 实测耗时 | 37.52s |

输入表达式：

```js
JSON.stringify({
  阶段: "开模BOM表",
  输入: flow_input,
  MOQ: flow_input.moq,
  产品定义: results.s07_upgrade_plan.output,
  属性矩阵: results.s04_attr_matrix.output,
  成本: results.s08_cost_packaging.output,
  结构风险: results.s05_death_modes.output,
})
```

MCP：卖家精灵 `t_ss_s10`，「尺寸重量与 FBA 费参考」。`include_tools`：`asin_detail`、`product_research`。

职责：出开模 BOM。金额用人民币。没有依据的单价必须标「需询价」，不许编造精确报价。返回键：结构件（件号、名称、材质、工艺、尺寸、数量、单件成本、成本依据、模具类型、模具费、开模周期）、总开模费、总 BOM 成本、关键公差、开模风险、需询价项。

交付物：`results.s10_bom.output`。`s12` 的 user message 没有直接引用这一步；BOM 通过升级方案和成本步骤间接进入复盘。

## s11_test_plan · ⑪试销计划

| 项 | 值 |
| --- | --- |
| ID | `s11_test_plan` |
| 中文名 | ⑪试销计划 |
| 模块类型 | `aiagent` |
| 分组 | 落地 ⑩-⑪ |
| `reasoning_effort` | `none` |
| `max_iterations` | 10 |
| 实测耗时 | 48.815s |

输入表达式：

```js
JSON.stringify({
  阶段: "试销计划",
  输入: flow_input,
  概览: results.s01_overview.output,
  对标: results.s03_benchmark.output,
  成本: results.s08_cost_packaging.output,
  假设卡: results.s09_hypothesis_cards.output,
  市场汇总: results.validate.market_summary,
})
```

MCP：SIF `t_sif_s11`，「关键词需求、竞争与推广可行性」。`include_tools`：`market_get_keyword_demand`、`market_get_keyword_competition`、`market_screen_keyword_opportunities`、`market_assess_keyword_promotion`、`market_get_keyword_root_trend`、`query_quota`。

职责：写试销计划。关键词和预算要有数据依据，用 SIF 的需求、竞争度、推广可行性工具。返回键：试销目标、首单数量、定价与优惠、主推关键词、上架节奏、成功标准、止损线。

交付物：`results.s11_test_plan.output`。复盘的六个维度（60 件、4.4 分、CVR 8%、ACOS 35%、采购 ≤ $2.38、首单 300 件）就是对着这份计划填的计划值。

## s12_review · ⑫复盘反馈

| 项 | 值 |
| --- | --- |
| ID | `s12_review` |
| 中文名 | ⑫复盘反馈 |
| 模块类型 | `aiagent` |
| 分组 | 复盘 ⑫（色块的 start 和 end 都是这一步） |
| `reasoning_effort` | `none` |
| `max_iterations` | 4 |
| 工具 | 空数组 |
| 实测耗时 | 37.652s |

输入表达式：

```js
JSON.stringify({
  阶段: "复盘反馈",
  输入: flow_input,
  假设卡: results.s09_hypothesis_cards.output,
  试销计划: results.s11_test_plan.output,
  成本: results.s08_cost_packaging.output,
  数据可信度: results.validate.verification.summary,
  数据告警: results.validate.verification.all_flags,
})
```

职责：以试销计划为基准，做可以直接开会用的复盘模板。返回键：复盘维度（维度、计划值、待回填实际值、判定标准）、假设卡结论、需要回填上游的修正、证据不足的结论、下一轮迭代建议。

交付物：`results.s12_review.output`。Flow 没有配置 Early return，成功时整条 Flow 的结果就是这一步。`dog mats` 的全文见 [examples/dog-mats-us-s12-review.md](./examples/dog-mats-us-s12-review.md)。

这一步的 `usage`：`input_tokens` 7799，`output_tokens` 2087，`total_tokens` 9886，`cache_read_input_tokens` 0。

## 续跑段

`s05`～`s12` 的步骤耗时相加是 356.759 秒。运行页这一段的墙钟是 **5m 58s**，状态 **100% Success**。截图：[assets/20-flow-success.png](./assets/20-flow-success.png)。
