# 01 · Flow 快速入门：从新建到跑通

本篇按官方 quickstart 的路径重写，但把每一步拆成「要做什么 / 为什么 / 常见坑」，并补上排错时最常用的检查点。

官方原文：<https://www.windmill.dev/docs/getting_started/flows_quickstart>

## 0. 开始前的准备

你需要：

- 一个 Windmill workspace（Cloud 上是 `app.windmill.dev`）。
- 至少能创建一个 Script 的权限；如果要部署和设定时，还需要对应的 folder / schedule 权限。
- 一个明确的小目标，例如「拉取一个 API → 取前 5 条 → 发一条 Slack 消息」。

为什么先定目标：Flow 的输入和步骤设计都围绕目标来，否则很容易做成一条「什么都能跑、但没人敢改」的流程。

常见坑：直接在默认目录里建实验 Flow，跑通后忘了命名和归档，几个月后没人知道它是干什么的。

## 1. 新建 Flow

**做什么**：在 Windmill 首页点 **New**，选择 **Flow**。

**为什么**：Flow 有独立的编辑器、输入 schema、部署版本和 Webhook；从 Script 页面是变不出一条正式 Flow 的。

**常见坑**：

- 名字先随便填，后面再改路径，导致 Webhook / schedule / 外部引用全部要跟着改。建议一开始就用可读的路径，例如 `f/team/flow_name`。
- 以为「保存」=「上线」。保存的是 draft，必须 Deploy 才是生产版本。

## 2. 配置 Settings

新建后先看 Settings。官方把它拆成四块：Metadata、Schedule、Shared directory、Worker group。

### 2.1 Metadata：名称、描述、权限

**做什么**：

- 填 Summary（列表里显示的名字）、Description（支持 Markdown，写清楚输入含义和运行前提）。
- 设置 Path 和权限：个人（User）或 Folder（读写组）。

**为什么**：Flow 会被同事直接打开运行，描述就是你的「使用说明书」；Path 决定谁能读写、Webhook 长什么样。

**常见坑**：

- 只写「测试用」，不写输入格式。别人运行失败时根本不知道 `date` 要传 `2026-01-01` 还是时间戳。
- 把 Flow 放在个人目录，结果同事无法维护。团队流程建议放 Folder。

### 2.2 Schedule：定时入口

**做什么**：在 Schedule 标签页设置主调度（primary schedule），用 CRON 表达式；默认是 none。

**为什么**：一个 Flow 只能有一个 primary schedule，并且它和 Flow 共享同一个 path；其他调度要到 workspace 的 Schedules 菜单里建。

**常见坑**：

- Windmill 的 cron 是 **6 段**，第一段是秒：`sec min hour day month weekday`。直接粘贴 Unix 的 5 段 cron 会被拒绝。官方示例：`0 2 * * *` 要写成 `0 0 2 * * *`。
- 改完 schedule 忘记 Deploy，定时不生效。
- 以为「一个 Flow 只能有一个定时」。实际上是一个 primary + 多个 other schedules（在 Schedules 页面建）。

官方调度文档：<https://www.windmill.dev/docs/core_concepts/scheduling>

### 2.3 Shared directory：给大对象留通道

**做什么**：需要传大文件、非 JSON 数据时，开启 Shared Directory。步骤之间共享 `./shared` 目录。

**为什么**：Flow 默认按 result 传递数据，适合轻量 JSON；大对象塞进 result 会变慢、也可能超出限制。

**常见坑**：

- 小数据也开 Shared Directory，增加清理和并发读写的负担。
- 以为 shared 目录会永久保存。官方明确它是**单次 Flow 执行内**的临时目录，不会跨 run 保留，也**不会跨 suspend / sleep 保留**；长期存储用对象存储 / 数据库。
- 忽略「所有步骤会跑在同一个 worker 上」这一约束。开启 Shared Directory 后，官方说明所有步骤在同一 worker 执行，和「Flow 级 worker group」的用法要一起考虑。

### 2.4 Worker group：整条 Flow 跑在哪

**做什么**：可以在 Flow 级别指定 worker group。

**为什么**：Flow 级别一旦指定，里面所有步骤都在这个 group 上跑，**无视步骤自己的 worker group**。这适合「整条流程都必须访问某个内网/GPU 环境」的场景。

**常见坑**：

- 只想让某一步跑在 GPU 上，却在 Flow 级别设了 GPU group，结果所有步骤都占 GPU worker。
- 如果 Flow 级别不设，flow 控制逻辑由默认的 `flow` group 执行，步骤各按自己的 worker group 执行。

## 3. 加第一个步骤（Action）

**做什么**：在画布上添加 Action，三选一：

1. 直接在 Flow 里写内联脚本（TS / Python / Go / Bash / SQL / REST / GraphQL 等）。
2. 从 workspace 引用已有 Script。
3. 从 Windmill Hub 引用，或 fork 成内联脚本再改。

**为什么**：Flow 的步骤本质上都是 Script。复用已有 Script 能保证逻辑只有一份；内联适合一次性的胶水逻辑。

**常见坑**：

- 从 Hub 引用后直接改参数，却不知道 Hub 版本更新会影响运行结果。需要稳定行为时，fork 成内联或复制到 workspace。
- 内联脚本里硬编码 token。应该用 Resource / Variable，或 flow env variable 引用。
- 步骤 id 用默认的 `a`、`b`、`c` 一路加下去，后面表达式里完全看不懂。建议改成 `fetch_orders`、`format_message` 这样的语义 id（官方支持在 YAML / 编辑器里改 id）。

## 4. 配置输入并连接数据

**做什么**：在步骤下方的输入区，为每个参数选择三种输入模式之一，或用插头按钮连接数据：

- **Static**：写死一个值。
- **Templatable string**：字符串里用 `${...}` 拼变量。
- **Dynamic**：写 JavaScript 表达式，运行时求值。
- **Connect（插头图标）**：从 flow input、前序步骤结果、Resource 里选，自动生成绑定。

**为什么**：Flow 的通用性来自 input transform——同一条 Flow 用不同输入可以跑不同数据。

**常见坑**：

- 在 Dynamic 表达式里引用还没有执行过的步骤。`results.<id>` 只有在步骤完成后才有值；测试时也要先跑过那一步。
- 把整个大 result 传给下一步，而不是只取需要的字段。表达式可以写 `results.fetch_orders.slice(0, 5)`。
- 字符串模板和 JS 表达式混用：`${...}` 是模板语法，Dynamic 模式则是直接写 JS。两种模式别写串。
- 输入类型和脚本参数类型不匹配（比如把字符串 `"5"` 传给 number 参数）。用编辑器的参数提示和 Test this step 检查。

## 5. 先测单步：Test this step

**做什么**：选中步骤，在底部 **Test this step** 里填参数并运行，看结果和日志。

**为什么**：单步测试能把「脚本逻辑错」和「编排/传参错」分开，排错效率最高。测试后，前序步骤的结果还会被建议为后续步骤的输入。

**常见坑**：

- 只测最后一步，前面步骤的输入全是猜的。
- 测试成功就以为生产没问题：draft 测试用的是你当前草稿，部署后才是另一份版本。
- 测试时用了真实生产 token，产生副作用。练习时用测试资源。

## 6. 测整条 Flow

**做什么**：

- 点 **Test flow**，填 Flow 输入，运行整条流程。
- 或者点某个步骤上的 (x)，选 **Test up to x**，只跑到这个步骤。
- 循环和分支支持 **Test an iteration** / 指定分支测试。
- 部署后的 Flow 在 Cloud 计划下还支持 **Restart from step / iteration / branch**。

**为什么**：整条测试能发现步骤之间的数据形状不一致、分支条件不命中、循环没有正确迭代等问题。

**常见坑**：

- 只看「绿色成功」，不看每一步的实际输出。Flow 成功不代表数据对。
- 有副作用的步骤（发消息、写数据库）反复测试，造成重复数据。用 Step mocking / Pin result 固定上游结果，或把副作用步骤放最后。
- 测试时 Pin 了某一步，部署后忘了它可能仍然生效。注意 mock 的 `Applies to`：默认第一次 pin 只作用于 test runs，但可以改成 every run，改过就要检查。

官方测试文档：<https://www.windmill.dev/docs/flows/test_flows>
Step mocking：<https://www.windmill.dev/docs/flows/step_mocking>

## 7. 部署

**做什么**：点右上角 **Deploy**，可填写 deployment message。需要留版本时，用 Deploy 下拉里的 Fork；历史版本可从 History 恢复。

**为什么**：部署后 Flow 才对外可用：Webhook、schedule、API、其他 Flow 引用、App 调用都指向 deployed 版本。draft 只属于你个人。

**常见坑**：

- 部署前没看 Diff。工具栏有 Diff，可以对比当前 draft 和上一个部署版本。
- 多人同时改同一条 Flow，各自 draft 不冲突，但 deploy 会覆盖。部署前确认没有别人的改动。
- 部署后发现结果不对，想回滚：用 History 里的旧版本 Redeploy，或 Restore as fork。Flow 在同一路径只保留一个 deployed 版本，旧版本在 History 里。

官方页：<https://www.windmill.dev/docs/core_concepts/draft_and_deploy>

## 8. 配一个触发方式

Flow 可以通过这些方式触发：

| 方式 | 适用 | 注意 |
| --- | --- | --- |
| 自动生成 UI | 手动运行、给同事用 | 来自 Flow Inputs 的 schema |
| Schedule | 定时任务 | 6 段 cron；主调度在 Flow Settings |
| Webhook | 外部系统回调 | 部署后在 Flow 页面获取地址 |
| CLI | 本地/CI 触发 | `wmill flow run <path> -d '{...}'` |
| 另一个 Flow | 编排复用 | 子 Flow 步骤，或 trigger from flows |
| Trigger script | 轮询外部数据源 | 常配合 schedule + state，没新数据就早退 |
| App | 自定义界面 | App 调 Flow |

**常见坑**：

- 用 Webhook 触发却只保存没部署。外部调用要打 deployed 版本。
- 定时任务没确认触发时间。保存后用 Schedule 的 upcoming 预览确认下一次运行时间，不要假设它和你的本地时区一致。
- Trigger script 没有维护 state，导致每次重复处理同一批数据。官方明确：trigger script 的职责就是记录「哪些已处理」。

官方 Trigger script：<https://www.windmill.dev/docs/flows/flow_trigger>

## 一条最小可用 Flow 的检查清单

- [ ] 路径、Summary、Description 写清楚，放在正确的 Folder。
- [ ] Flow Inputs 有类型、有说明、有合理默认值。
- [ ] 每个步骤 id 可读，输入来源明确（static / flow_input / results / resource）。
- [ ] 单步测试通过，整条 Test flow 通过。
- [ ] 失败路径有重试或 error handler；没有「静默失败」。
- [ ] 需要人工确认的地方有 Approval，并设置了 timeout。
- [ ] 部署前看过 Diff，写了 deployment message。
- [ ] 触发方式（schedule / webhook / 手动）已验证一次。
- [ ] 结果符合预期：记住 Flow 默认返回最后一步的结果。

## 常见坑速查表

| 现象 | 优先检查 |
| --- | --- |
| 定时没跑 | 是否 Deploy、schedule 是否 enabled、cron 是否 6 段、upcoming 预览 |
| Webhook 404 / 不触发 | 是否部署、路径是否改过、是否用了 deployed 版本的 URL |
| 表达式报 `undefined` | 引用的步骤是否已执行、id 是否写错、字段名是否对 |
| 结果不是想要的 | Flow 默认返回最后一步；是否需要 Early return |
| 分支总走 default | 谓词表达式、`results` 字段、类型比较（字符串 vs 数字） |
| 循环只跑一次 / 不退出 | iterator 表达式、break 条件、是否开了 skip failure、while 的 limit |
| 所有步骤都跑在奇怪的环境 | Flow 级别 worker group 覆盖了步骤设置 |
| 部署后行为变了 | 检查别人的 deploy、draft 覆盖、Pin/mock 是否作用于 every run |
