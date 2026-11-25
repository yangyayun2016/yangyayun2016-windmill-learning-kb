# SOURCE_MAP · 笔记与官方文档对应表

除另行注明外，链接均在 2026-11-20 抓取，HTTP 状态见与 `repo/` 同级的 `STATUS.txt`。与本仓库同级的 `sources/` 下保留了抓取到的 `.md` / `.html` 原文，仅用于核对，不是知识库正文。

## 总览

| 笔记 | 对应官方文档 | 用途 |
| --- | --- | --- |
| [README.md](./README.md) | [Flows quickstart](https://www.windmill.dev/docs/getting_started/flows_quickstart)、[Workflows as code](https://www.windmill.dev/docs/core_concepts/workflows_as_code)、[Flow editor](https://www.windmill.dev/docs/flows/flow_editor)、[Scheduling](https://www.windmill.dev/docs/core_concepts/scheduling) | 仓库范围与阅读路径 |
| [00-overview.md](./00-overview.md) | [Flows quickstart](https://www.windmill.dev/docs/getting_started/flows_quickstart)、[Flow editor](https://www.windmill.dev/docs/flows/flow_editor)、[Architecture](https://www.windmill.dev/docs/flows/architecture)、[Workflows as code](https://www.windmill.dev/docs/core_concepts/workflows_as_code)、[Draft and deploy](https://www.windmill.dev/docs/core_concepts/draft_and_deploy) | Flow 定义、边界、四者对照 |
| [01-flows-quickstart.md](./01-flows-quickstart.md) | [Flows quickstart](https://www.windmill.dev/docs/getting_started/flows_quickstart)、[Scheduling](https://www.windmill.dev/docs/core_concepts/scheduling)、[Draft and deploy](https://www.windmill.dev/docs/core_concepts/draft_and_deploy)、[Testing flows](https://www.windmill.dev/docs/flows/test_flows)、[Step mocking](https://www.windmill.dev/docs/flows/step_mocking)、[Trigger scripts](https://www.windmill.dev/docs/flows/flow_trigger)、[Persistent storage](https://www.windmill.dev/docs/core_concepts/persistent_storage) | 新建到跑通的步骤与坑 |
| [02-flow-editor-and-steps.md](./02-flow-editor-and-steps.md) | [Flow editor](https://www.windmill.dev/docs/flows/flow_editor)、[Editor components](https://www.windmill.dev/docs/flows/editor_components)、[Architecture](https://www.windmill.dev/docs/flows/architecture)、[For loops](https://www.windmill.dev/docs/flows/flow_loops)、[While loops](https://www.windmill.dev/docs/flows/while_loops)、[Branches](https://www.windmill.dev/docs/flows/flow_branches)、[Approval](https://www.windmill.dev/docs/flows/flow_approval)、[Error handler](https://www.windmill.dev/docs/flows/flow_error_handler)、[Trigger scripts](https://www.windmill.dev/docs/flows/flow_trigger)、[AI decision](https://www.windmill.dev/docs/flows/ai_decision)、[Preprocessors](https://www.windmill.dev/docs/core_concepts/preprocessors)、[Shared directory](https://www.windmill.dev/docs/core_concepts/persistent_storage/states_resources_shared_directory) | 编辑器、步骤类型、数据传递 |
| [03-expressions-and-results.md](./03-expressions-and-results.md) | [Architecture / input transform](https://www.windmill.dev/docs/flows/architecture)、[Editor components](https://www.windmill.dev/docs/flows/editor_components)、[Auto-generated UIs](https://www.windmill.dev/docs/core_concepts/auto_generated_uis)、[JSON schema](https://www.windmill.dev/docs/core_concepts/json_schema_and_parsing)、[While loops / LoopExhausted](https://www.windmill.dev/docs/flows/while_loops) | `flow_input`、`results`、表达式求值 |
| [04-control-error-schedule.md](./04-control-error-schedule.md) | [Branches](https://www.windmill.dev/docs/flows/flow_branches)、[For loops](https://www.windmill.dev/docs/flows/flow_loops)、[While loops](https://www.windmill.dev/docs/flows/while_loops)、[Retries](https://www.windmill.dev/docs/flows/retries)、[Error handling](https://www.windmill.dev/docs/flows/error_handling)、[Error handler](https://www.windmill.dev/docs/flows/flow_error_handler)、[Early stop](https://www.windmill.dev/docs/flows/early_stop)、[Early return](https://www.windmill.dev/docs/flows/early_return)、[Custom timeout](https://www.windmill.dev/docs/flows/custom_timeout)、[Approval](https://www.windmill.dev/docs/flows/flow_approval)、[Sleep](https://www.windmill.dev/docs/flows/sleep)、[Scheduling](https://www.windmill.dev/docs/core_concepts/scheduling)、[Trigger scripts](https://www.windmill.dev/docs/flows/flow_trigger) | 控制流、错误处理、调度 |
| [05-workflows-as-code.md](./05-workflows-as-code.md) | [Workflows as code](https://www.windmill.dev/docs/core_concepts/workflows_as_code)、[Git sync](https://www.windmill.dev/docs/advanced/git_sync)、[CLI flow](https://www.windmill.dev/docs/advanced/cli/flow)、[Approval](https://www.windmill.dev/docs/flows/flow_approval)、[Retries](https://www.windmill.dev/docs/flows/retries) | WAC 写法、同步、选型 |
| [06-cheatsheet.md](./06-cheatsheet.md) | 以上所有页面；命令部分另见 [CLI flow](https://www.windmill.dev/docs/advanced/cli/flow)、[Scheduling](https://www.windmill.dev/docs/core_concepts/scheduling)、[Roles and permissions](https://www.windmill.dev/docs/core_concepts/roles_and_permissions) | 一页速查 |
| [07-practice-checklist.md](./07-practice-checklist.md) | [Flows quickstart](https://www.windmill.dev/docs/getting_started/flows_quickstart)、[Architecture](https://www.windmill.dev/docs/flows/architecture)、[Editor components](https://www.windmill.dev/docs/flows/editor_components)、[Branches](https://www.windmill.dev/docs/flows/flow_branches)、[For loops](https://www.windmill.dev/docs/flows/flow_loops)、[Retries](https://www.windmill.dev/docs/flows/retries)、[Error handler](https://www.windmill.dev/docs/flows/flow_error_handler)、[Approval](https://www.windmill.dev/docs/flows/flow_approval)、[Scheduling](https://www.windmill.dev/docs/core_concepts/scheduling)、[Webhooks](https://www.windmill.dev/docs/core_concepts/webhooks)、[Workflows as code](https://www.windmill.dev/docs/core_concepts/workflows_as_code) | 动手练习 |
| [08-self-host-architecture.md](./08-self-host-architecture.md) | [Self-host / Architecture](https://www.windmill.dev/docs/advanced/self_host#architecture)（2026-11-24 核对）、[Worker groups](https://www.windmill.dev/docs/core_concepts/worker_groups)、[Code editor](https://www.windmill.dev/docs/code_editor)、[Multiplayer](https://www.windmill.dev/docs/core_concepts/multiplayer) | 自托管的三个必需组件和三个可选组件 |
| [BOT.md](./BOT.md) | 以上所有页面 | Bot 人设、边界、引用规范 |
| [tianji-ai-amazon-product-dev/](./tianji-ai-amazon-product-dev/README.md) | 无单一官方页。Flow 概念仍对照本表前面的官方文档；步骤、提示词、耗时和报错对照该目录里的 OpenFlow、脚本和运行结果 | 天机 AI 亚马逊产品开发 v186181 实战 |

## 按主题

### Flow 基础

- 快速入门：<https://www.windmill.dev/docs/getting_started/flows_quickstart>
- Flow 编辑器：<https://www.windmill.dev/docs/flows/flow_editor>
- 编辑器组件：<https://www.windmill.dev/docs/flows/editor_components>
- 架构与数据交换：<https://www.windmill.dev/docs/flows/architecture>
- OpenFlow 规范：<https://www.windmill.dev/docs/openflow>

### 控制流

- 分支：<https://www.windmill.dev/docs/flows/flow_branches>
- For 循环：<https://www.windmill.dev/docs/flows/flow_loops>
- While 循环：<https://www.windmill.dev/docs/flows/while_loops>
- 重试：<https://www.windmill.dev/docs/flows/retries>
- 错误处理总览：<https://www.windmill.dev/docs/flows/error_handling>
- Error handler：<https://www.windmill.dev/docs/flows/flow_error_handler>
- Early stop：<https://www.windmill.dev/docs/flows/early_stop>
- Early return：<https://www.windmill.dev/docs/flows/early_return>
- Timeout：<https://www.windmill.dev/docs/flows/custom_timeout>
- 审批/挂起：<https://www.windmill.dev/docs/flows/flow_approval>
- Sleep：<https://www.windmill.dev/docs/flows/sleep>

### 运行与运维

- 测试 Flow：<https://www.windmill.dev/docs/flows/test_flows>
- Step mocking：<https://www.windmill.dev/docs/flows/step_mocking>
- 缓存：<https://www.windmill.dev/docs/flows/cache>
- 并发限制：<https://www.windmill.dev/docs/flows/concurrency_limit>
- 优先级：<https://www.windmill.dev/docs/flows/priority>
- Lifetime：<https://www.windmill.dev/docs/flows/lifetime>
- 调度：<https://www.windmill.dev/docs/core_concepts/scheduling>
- Draft & Deploy：<https://www.windmill.dev/docs/core_concepts/draft_and_deploy>
- 版本：<https://www.windmill.dev/docs/core_concepts/versioning>
- 权限：<https://www.windmill.dev/docs/core_concepts/roles_and_permissions>
- Webhooks：<https://www.windmill.dev/docs/core_concepts/webhooks>

### Workflows as Code

- 主文档：<https://www.windmill.dev/docs/core_concepts/workflows_as_code>
- Git sync：<https://www.windmill.dev/docs/advanced/git_sync>
- CLI Flow：<https://www.windmill.dev/docs/advanced/cli/flow>
- CLI sync：<https://www.windmill.dev/docs/advanced/cli/sync>

### 数据与边界

- Resource / Variable / State：<https://www.windmill.dev/docs/core_concepts/resources_and_types>
- Variables & secrets：<https://www.windmill.dev/docs/core_concepts/variables_and_secrets>
- Persistent storage：<https://www.windmill.dev/docs/core_concepts/persistent_storage>
- Shared directory：<https://www.windmill.dev/docs/core_concepts/persistent_storage/states_resources_shared_directory>
- 自动生成 UI：<https://www.windmill.dev/docs/core_concepts/auto_generated_uis>
- JSON schema：<https://www.windmill.dev/docs/core_concepts/json_schema_and_parsing>
- Preprocessors：<https://www.windmill.dev/docs/core_concepts/preprocessors>

### 自托管

- 架构（本篇只整理这一节）：<https://www.windmill.dev/docs/advanced/self_host#architecture>
- Worker groups：<https://www.windmill.dev/docs/core_concepts/worker_groups>

### 其他

- Trigger scripts：<https://www.windmill.dev/docs/flows/flow_trigger>
- AI flows（编辑器内 AI 搭 Flow）：<https://www.windmill.dev/docs/flows/ai_flows>
- AI decision：<https://www.windmill.dev/docs/flows/ai_decision>
- Flow as chat：<https://www.windmill.dev/docs/flows/flow_as_chat>
- Sticky notes：<https://www.windmill.dev/docs/flows/sticky_notes>
- Hub：<https://hub.windmill.dev>

## 实战专题（不是官方文档快照）

`tianji-ai-amazon-product-dev/` 的事实来源是工作室自己的导出和运行结果，不是 `sources/` 里的官方页面。引用 Windmill 的一般行为（Flow、`results`、Resource、CLI）时，仍回到上表的官方 URL。

| 文件 | 来源 |
| --- | --- |
| `tianji-ai-amazon-product-dev/flow/amazon_product_development.v186181.flow.json` | Windmill Cloud workspace `tianjikuajing-yayun` 上 `u/tianjikuajingyayun/amazon_product_development` 的部署版本 `v186181` |
| `tianji-ai-amazon-product-dev/scripts/collect_market.ts` | 脚本 `u/tianjikuajingyayun/collect_market` |
| `tianji-ai-amazon-product-dev/scripts/cross_validate.ts` | 脚本 `u/tianjikuajingyayun/cross_validate` |
| `tianji-ai-amazon-product-dev/examples/run-01a1f7d5-result.json` | `dog mats` / 美国站这次运行的最终结果，即 `s12_review` 的 Result |
| `tianji-ai-amazon-product-dev/assets/20-flow-success.png` | 续跑段 5 分 58 秒、状态 100% 的运行页截图 |
| `01`～`05` 与专题 `README.md` | 根据以上文件整理。版本演进（`v180115` 至 `v186181`）写在 `03-troubleshooting-and-evolution.md`，那些中间版本没有单独导出 |

DeepSeek thinking 回传问题的公开记录（与第 6 次排错对照，不是本仓库的运行日志）：

- <https://github.com/windmill-labs/windmill/issues/9192>
- <https://github.com/windmill-labs/windmill/pull/9208>

## sources 目录说明（与 repo/ 同级）

| 文件/目录 | 内容 |
| --- | --- |
| `sources/flows_quickstart.md` / `.html` | Flow 快速入门快照 |
| `sources/workflows_as_code.md` / `.html` | WAC 快照 |
| `sources/flows/*.md` | Flow 板块各页面快照 |
| `sources/flow_editor.md` / `.html` | Flow 编辑器快照 |
| `sources/scheduling.md`、`draft_and_deploy.md`、`versioning.md`、`roles_and_permissions.md`、`auto_generated_uis.md`、`preprocessors.md`、`openflow.md`、`cli_flow.md`、`git_sync.md`、`states_resources_shared_directory.md` | 相关核心概念快照 |
| `sources/fetch_log.tsv`、`sources/fetch_status.tsv` | 抓取状态记录 |
| `sources/llms.txt`、`sources/sitemap.xml` | 官方文档索引，用于发现 Flow 板块页面 |

> 注意：`sources/` 是参考资料，可能包含官方英文原文、图片链接和站内相对链接；知识库正文为中文原创整理，不直接复制原文。
