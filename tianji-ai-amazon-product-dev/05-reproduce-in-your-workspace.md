# 05 · 在自己的 Workspace 里复现

目标：把 v186181 这条 Flow 导进**你自己的** Windmill Cloud workspace，用测试资源跑一次 `dog mats`，并知道失败后怎么从中间步骤续跑。

不要把本仓库里的 `u/tianjikuajingyayun/...` 当成你的路径，也不要向别人要他们的 Resource。API Key 只创建在你自己的 Resource 上，不要写进 Flow JSON、脚本或 Git。

知识库里的 CLI 速查见 [../06-cheatsheet.md](../06-cheatsheet.md)。下面用到的 `wmill flow push` / `wmill script push` 以那一页和 [CLI Flow](https://www.windmill.dev/docs/advanced/cli/flow) 为准。导入按钮的具体名字以你当前 Cloud 的编辑器为准；官方 OpenFlow 说明在 <https://www.windmill.dev/docs/openflow>。

## 0. 先准备三样东西

- 一个你有写权限的 Windmill workspace，以及还没用完的 exec 额度。这条链的步骤耗时相加大约 20 分钟，免费额度 1000 exec（约 1000 秒 compute）不够从头跑完。口径见 [03-troubleshooting-and-evolution.md](./03-troubleshooting-and-evolution.md)。
- DeepSeek API 的密钥，只用于创建 Resource。
- 卖家精灵 MCP 和 SIF MCP 的访问地址。采集脚本要求资源至少有 `url`，可选 `token`、`headers`。

建议路径都放在 `u/你的用户名/`，不要改团队已经在用的 Flow。

## 1. 创建三个 Resource

在 Resources 里新建，路径用下面的名字即可（用户名换成你的）：

| 路径 | 用途 | 本导出里对应的字段 |
| --- | --- | --- |
| `u/你的用户名/ecstatic_deepseek` | DeepSeek provider。在编辑器里选 DeepSeek 类型并发布。密钥留在 Resource 上 | AI 节点的 `provider.resource`：`$res:u/你的用户名/ecstatic_deepseek`。`kind` 保持 `deepseek`，`model` 保持 `deepseek-v4-pro` |
| `u/你的用户名/sellersprite_mcp` | 卖家精灵 MCP | 工具的 `resource_path`，以及 `collect_market.ts` 里的 `SS` |
| `u/你的用户名/sif_mcp` | SIF MCP | 工具的 `resource_path`，以及 `collect_market.ts` 里的 `SIF` |

两个 MCP Resource 的值要能被这段逻辑读到（摘自 `collect_market.ts` 的 `conn`）：

- `url`：必填。缺少时脚本抛出的信息是「资源」加上路径再加「缺少 url」。
- `token`：可选。有的话，请求头的 Authorization 使用 Bearer 方案，值就是这个 token。
- `headers`：可选，并进请求头。

v186181 的导出**不包含**这三个 Resource 的值。DeepSeek Resource 的表单字段以你当前 Cloud 的资源类型为准，不要从别的 workspace 复制密钥 JSON。

发布之后再部署脚本和 Flow。第 3 段排错记录就是「脚本指向了还没发布的 `cohesive_deepseek`」。

## 2. 部署两个 TypeScript 脚本

源码：

- [scripts/collect_market.ts](./scripts/collect_market.ts) → 部署为 `u/你的用户名/collect_market`
- [scripts/cross_validate.ts](./scripts/cross_validate.ts) → 部署为 `u/你的用户名/cross_validate`

部署前只改采集脚本顶部的两个常量：

```ts
const SIF = "u/你的用户名/sif_mcp";
const SS = "u/你的用户名/sellersprite_mcp";
```

`cross_validate.ts` 没有资源路径，不用改。

这两个文件与 v186181 逐字一致。月末月份溢出、分桶被当成点、未抽样 coupon 被写成「无优惠」、`top_n` 按变体行截断，都写在 [01-windmill-architecture-and-design.md](./01-windmill-architecture-and-design.md) 第 9 节。要改这些行为，改你部署的副本，不要改本仓库里的导出。MCP Resource 的 `url` 用 `https`。

两个脚本都依赖 `windmill-client` 的运行时（采集脚本的 `import * as wmill from "windmill-client"`）。在 Windmill 脚本编辑器里新建 TypeScript，把源码贴进去再部署即可。用 CLI 时，按速查表的 `wmill script push`，路径写成你的 `u/你的用户名/...`。

先单独跑 `collect_market`：`keyword` 用一个你有额度的词，`marketplace` 用 `US`，`top_n` 先用 `3`，`with_coupon` 可以先 `false`，少打 5 次 coupon。返回里应有 `listings`、`diagnostics`、`source_policy`，且没有 `token` 字段。再把这份返回喂给 `cross_validate` 的 `market` 参数，确认有 `adopted`、`verification`、`market_summary`。

## 3. 导入 OpenFlow，并替换路径

文件：[flow/amazon_product_development.v186181.flow.json](./flow/amazon_product_development.v186181.flow.json)。

在**副本**上把路径前缀换掉，不要改仓库里的这份导出：

```bash
sed 's#u/tianjikuajingyayun/#u/你的用户名/#g' \
  amazon_product_development.v186181.flow.json \
  > /tmp/amazon_product_development.flow.json
```

这一条会同时改掉：

- 脚本路径 `collect_market`、`cross_validate`
- MCP `resource_path`
- `$res:u/tianjikuajingyayun/ecstatic_deepseek` 里的用户段

换完用搜索确认文件里不再出现 `tianjikuajingyayun`。然后抽查三处仍在：

- `provider.kind` 仍是 `deepseek`，`model` 仍是 `deepseek-v4-pro`
- `s05`～`s12` 的 `reasoning_effort` 仍是 `none`，`s01` 仍是 `high`
- 12 个 AI 节点的 `output_schema` 仍是 `null`

`schema.prompt_for_ai` 里残留着一次 DeepSeek 400 的报错文本（`response_format` 那次）。它不是运行输入。导入后可以在 Flow 的 schema 里清空这段文字，不清空也不影响 14 个模块。

导入方式二选一：

1. Cloud 编辑器里新建 Flow，使用导入 OpenFlow / 粘贴 JSON（按钮名以当前 UI 为准），路径设为 `u/你的用户名/amazon_product_development`，然后 Deploy。
2. CLI：`wmill flow push /tmp/amazon_product_development.flow.json u/你的用户名/amazon_product_development`。

部署之后，打开 Flow，确认两个 script 步骤能解析到你刚部署的脚本，12 个 AI 步骤的 provider 能解析到 `ecstatic_deepseek`。解析不到就回到第 1 步，看 Resource 是否已经发布、路径是否一致。

## 4. 用 dog mats 的参数试跑

和这次实证相同的输入：

| 字段 | 值 |
| --- | --- |
| `keyword` | `dog mats` |
| `marketplace` | `US` |
| `moq` | `1000` |
| `target_margin_pct` | `30` |
| `target_price` | `15` |
| `top_n` | `10` |
| `with_coupon` | `true` |

`keyword` 是 schema 里唯一必填项。`target_price` 没有默认值，要显式填。

第一次建议在测试目录跑，并看 `collect` 的 `diagnostics`。类目打分、SIF 额度、coupon 失败都会写在那里，不一定让 Flow 失败。`validate` 把销量偏差绝对值超过 40% 的行打成「低」，`dog mats` 那次 10 行全是低置信度，Flow 仍然继续走到了 `s12`。低置信度不是脚本抛错。

成功时，Flow 的结果就是 `s12_review` 的文本。可对照 [examples/dog-mats-us-s12-review.md](./examples/dog-mats-us-s12-review.md)。市场数据会随月份变化（采集脚本取的是 UTC 上一个月），数字不必和那次复盘逐字相同。

## 5. 失败了怎么续跑

运行页有 **Re-start from**。选择失败步骤（或你改完提示词的那一步），并选定**产生上游结果的那个部署版本**。上游会显示为 reused，不会重新执行。

这次跑通用的就是这个机制：续跑段 `s05`～`s12`，版本 `v186181`，墙钟 5 分 58 秒，状态 100%。截图里控件当时停在 `s11_test_plan`，那只是页面上的当前选项。

续跑前核对两件事：

1. 版本。`v186181` 传的是 `results.*.output` 原文。如果你又加回了 `JSON.parse`，复用 `s02` 的中文 Markdown 会再次 `Unexpected token`。
2. `reasoning_effort`。`s01` 仍是 `high`，`s02`～`s04` 仍未设置。从头重跑时，这四步只要开启 thinking 并发生多轮工具调用，仍可能 400：`The reasoning_content in the thinking mode must be passed back to the API`。在 worker 修复之前，把这四步也设成 `none` 再全量跑。说明见 [03-troubleshooting-and-evolution.md](./03-troubleshooting-and-evolution.md)。

额度不够时，先续跑后半段，不要从 `collect` 重跑。`s02` 一步就是 6 分 19 秒。
