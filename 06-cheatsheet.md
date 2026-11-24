# 06 · 一页速查

## 概念

| 名词 | 一句话 |
| --- | --- |
| Flow | 用 DAG 编排多个 Script 的工作流 |
| Step | Flow 里的一个节点，执行时是一个独立 job |
| Action | 普通脚本步骤，默认类型 |
| Subflow | 调用 workspace 里另一条 Flow 的步骤 |
| Trigger script | 定时轮询外部数据、无新数据就早退的第一步 |
| Approval / Suspend | 挂起等待人工批准/拒绝，不占 worker |
| Error handler | Flow 级错误处理器，输入是失败步骤的结果 |
| Preprocessor | 外部触发时预处理 payload，不是普通步骤 |
| flow_input | Flow 的输入对象 |
| results.<id> | 某个已完成步骤的返回结果 |
| flow_env | Flow 级常量，`flow_env.NAME` |
| Primary schedule | 每个 Flow 唯一的主调度，和 Flow 同 path |
| Draft / Deploy | 用户级草稿 / 生产版本 |
| OpenFlow | Flow 的开放定义格式（JSON/YAML） |
| WAC | Workflows as Code，用 TS/Python 写编排 |

## 步骤类型

| 类型 | 关键点 |
| --- | --- |
| Action | 内联 / workspace / Hub；输入用表达式映射 |
| Subflow | 选 `Flow`；可展开查看内部步骤 |
| For loop | iterator、skip failure、parallel、limit、squash |
| While loop | break、max_iterations、max_duration |
| Branch one | 按顺序求值，第一个 true 生效，否则 default |
| Branch all | 所有分支执行，可并行、可限并发、可 skip failure |
| Approval | required_events、timeout、form、skin |
| Error handler | 接收失败结果；`recover: true` 可把最终状态改为成功 |
| AI decision | choice / score / noul，可自动生成分支 |

## 表达式

```js
flow_input.xxx
results.step_id.field
results.step_id?.items ?? []
resource("u/team/slack").token
variable("u/team/api_base_url")
flow_env.REGION
```

- Static：直接写值。
- Templatable：`"order-${flow_input.id}"`。
- Dynamic：整个字段是 JS 表达式。
- 只有已完成的步骤才有 `results`。
- 官方只说表达式是受限 JS 子集；不要依赖 `fetch`、文件系统、`async/await`。

## 错误与重试

| 机制 | 要点 |
| --- | --- |
| Retries（步骤） | Constant 或 Exponential；static 先于 exponential |
| Exponential 公式 | `delay = multiplier * base ^ (number of attempt)` |
| Continue on error | 失败后继续，error 放进 result |
| Error handler | 默认仍失败；返回 `{ recover: true }` 才成功 |
| Flow timeout | 算上 sleep 和审批；到达后取消，error handler 仍执行 |
| Early stop | 步骤后按谓词停止；循环内只 break 循环 |
| Early return | 只影响同步 Webhook 的返回，后续步骤继续跑 |

## WAC 原语

| TS | Python | 说明 |
| --- | --- | --- |
| `workflow(fn)` | `@workflow` | 入口 |
| `task(fn)` | `@task` | 独立子 job |
| `step(name, fn)` | `step(name, fn)` | 内联 + 持久化结果 |
| `sleep(s)` | `sleep(s)` | 持久 sleep，最小 1 秒 |
| `waitForApproval(opts)` | `wait_for_approval(...)` | 审批，默认 timeout 1800s |
| `parallel(items, fn, opts)` | `parallel(items, fn, concurrency=...)` | 并行，结果按输入顺序 |
| `taskScript(path)` | `task_script(path)` | 调已有 Script |
| `taskFlow(path)` | `task_flow(path)` | 调已有 Flow |
| `getResumeUrls()` | `get_resume_urls()` | approvalPage / resume / cancel |

WAC retry 公式：`delay * multiplier ^ (n - 1)`，上限 `max_delay`；`attempts` 为 0–100。

## CRON

6 段，第一段是秒：

```text
sec min hour day-of-month month day-of-week
```

| 表达式 | 含义 |
| --- | --- |
| `0 0 2 * * *` | 每天 02:00 |
| `0 */15 * * * *` | 每 15 分钟 |
| `0 0 12 * * MON-FRI` | 工作日 12:00 |
| `0 0 12 ? * 5#3` | 每月第三个周五 12:00 |
| `0 0 12 ? * 5L` | 每月最后一个周五 12:00 |

Unix 5 段会被拒绝；保存前用预览确认下一次运行时间。

## CLI

```bash
# Flow
wmill flow                              # 列出 Flow
wmill flow bootstrap f/team/my_flow     # 本地新建 Flow
wmill flow push flow.yaml f/team/my_flow
wmill flow run f/team/my_flow -d '{"x":1}'
wmill flow run f/team/my_flow -d '{"slack":"$res:u/me/slack"}' -s

# Job
wmill job get <job_id>
wmill job logs <job_id>

# 同步 / 脚本
wmill sync pull
wmill script push f/team/my_workflow
wmill script preview f/team/my_workflow
wmill generate-metadata
```

路径格式：

```text
<u|g|f>/<username|group|folder>/...
```

CLI 里 Resource / Variable 用 `$res:...` / `$var:...` 传。

## 权限速记

- **Developer**：默认可写代码、建 Flow/App。
- **Operator**：运行和查看，不写代码；可管理 schedule/trigger。
- **Flows and AI agents** 能力：`None` / `Compose`（只能用已部署的脚本和 Flow 组装，不能写内联代码）/ `Full`。
- 完整 Flow 编辑需要 **Write code**。
- Schedule、HTTP route 等以 owner 权限运行。

官方页：<https://www.windmill.dev/docs/core_concepts/roles_and_permissions>

## 官方链接

| 主题 | URL |
| --- | --- |
| Flow 快速入门 | <https://www.windmill.dev/docs/getting_started/flows_quickstart> |
| Flow 编辑器 | <https://www.windmill.dev/docs/flows/flow_editor> |
| 编辑器组件 | <https://www.windmill.dev/docs/flows/editor_components> |
| 架构与数据交换 | <https://www.windmill.dev/docs/flows/architecture> |
| For loops | <https://www.windmill.dev/docs/flows/flow_loops> |
| While loops | <https://www.windmill.dev/docs/flows/while_loops> |
| Branches | <https://www.windmill.dev/docs/flows/flow_branches> |
| Retries | <https://www.windmill.dev/docs/flows/retries> |
| Error handler | <https://www.windmill.dev/docs/flows/flow_error_handler> |
| 错误处理总览 | <https://www.windmill.dev/docs/flows/error_handling> |
| Early stop | <https://www.windmill.dev/docs/flows/early_stop> |
| Early return | <https://www.windmill.dev/docs/flows/early_return> |
| Approval | <https://www.windmill.dev/docs/flows/flow_approval> |
| Sleep | <https://www.windmill.dev/docs/flows/sleep> |
| 测试 Flow | <https://www.windmill.dev/docs/flows/test_flows> |
| Step mocking | <https://www.windmill.dev/docs/flows/step_mocking> |
| 缓存 | <https://www.windmill.dev/docs/flows/cache> |
| 并发限制 | <https://www.windmill.dev/docs/flows/concurrency_limit> |
| Timeout | <https://www.windmill.dev/docs/flows/custom_timeout> |
| Trigger script | <https://www.windmill.dev/docs/flows/flow_trigger> |
| Workflows as Code | <https://www.windmill.dev/docs/core_concepts/workflows_as_code> |
| 调度 | <https://www.windmill.dev/docs/core_concepts/scheduling> |
| Draft & Deploy | <https://www.windmill.dev/docs/core_concepts/draft_and_deploy> |
| 版本 | <https://www.windmill.dev/docs/core_concepts/versioning> |
| CLI Flow | <https://www.windmill.dev/docs/advanced/cli/flow> |
| OpenFlow | <https://www.windmill.dev/docs/openflow> |
| Hub | <https://hub.windmill.dev> |

## 排错一句话

| 现象 | 先查 |
| --- | --- |
| 定时没跑 | Deploy、enabled、6 段 cron、是否 late |
| Webhook 不通 | 是否部署、路径是否改过 |
| `undefined` | 步骤是否执行、id/字段名 |
| 结果不对 | Flow 默认返回最后一步；是否要 Early return |
| 分支不中 | predicate 类型和顺序 |
| 循环不退出 | iterator / break / limit |
| 审批卡住 | required_events / timeout / URL |
| 全部跑错环境 | Flow 级 worker group 覆盖 |
| WAC 恢复失败 | 是否运行中部署了不兼容版本 |
