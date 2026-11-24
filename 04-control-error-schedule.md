# 04 · 分支、循环、错误处理、重试与调度

本篇把 Flow 的「控制面」集中讲清楚。官方对应页面较多，先给一张选择表，再逐项展开。

| 你想做的事 | 用什么 | 官方页 |
| --- | --- | --- |
| 按条件走不同路径 | Branch one | [flow_branches](https://www.windmill.dev/docs/flows/flow_branches) |
| 多个分支都要跑 | Branch all | [flow_branches](https://www.windmill.dev/docs/flows/flow_branches) |
| 遍历列表 | For loop | [flow_loops](https://www.windmill.dev/docs/flows/flow_loops) |
| 反复执行直到满足条件 | While loop + Early stop | [while_loops](https://www.windmill.dev/docs/flows/while_loops) |
| 步骤失败后自动重试 | Retries | [retries](https://www.windmill.dev/docs/flows/retries) |
| 失败后统一处理/告警 | Error handler | [flow_error_handler](https://www.windmill.dev/docs/flows/flow_error_handler) |
| 限制单步或整条 Flow 的耗时 | Custom timeout | [custom_timeout](https://www.windmill.dev/docs/flows/custom_timeout) |
| 在某步后停止 | Early stop / Break | [early_stop](https://www.windmill.dev/docs/flows/early_stop) |
| 提前把结果返回给同步调用方 | Early return | [early_return](https://www.windmill.dev/docs/flows/early_return) |
| 等人批准 | Approval / Suspend | [flow_approval](https://www.windmill.dev/docs/flows/flow_approval) |
| 延迟一段时间再继续 | Sleep | [sleep](https://www.windmill.dev/docs/flows/sleep) |
| 定时运行 | Schedule | [scheduling](https://www.windmill.dev/docs/core_concepts/scheduling) |

---

## 1. 分支

### Branch one

按顺序求值每个分支的 predicate，**第一个为 true 的分支执行**；如果都不为 true，执行 default 分支。

典型谓词：

```js
results.classify.command === "email"
flow_input.number >= 2
```

要点：

- predicate 是 JavaScript 表达式，可以使用 `flow_input`、`results` 等。
- 分支本身也是一个子 Flow，里面可以继续放步骤、循环、嵌套分支。
- 每个分支可以改 Summary，方便在图上辨认。
- 如果接了 AI decision 步骤，编辑器可以根据分类结果自动生成分支。

常见坑：

- 条件顺序很重要：多个条件同时为真时，只有第一个生效。
- 用 `==` 而不是 `===`，导致 `"1"` 和 `1` 被当成相等；或者反过来，类型不一致导致 `===` 永远 false。
- 以为 default 是「条件为 false 时执行的分支」——它确实兜底，但如果你把业务默认逻辑写在第一个分支里，顺序一变行为就变。

### Branch all

所有分支都执行，默认并行；每个分支也是一个子 Flow。

可配置：

- 每个分支的 **Skip failure**：该分支失败时是否跳过。
- 是否 **All branches run in parallel**。
- 开启并行后，**Limit concurrent branches** 限制同时运行的分支数（可以是数字或表达式，小于 1 会让步骤失败）。

常见坑：

- 多个分支写同一个数据库/同一个文件，产生竞争。并行前先确认副作用互不冲突。
- 以为 Branch all 会等所有分支结束后才继续——是的，join 步骤会等依赖的分支完成；但分支内部的失败是否传播，取决于 Skip failure。

---

## 2. 循环

### For loop

For loop 遍历一个列表，对每个元素执行一段子 Flow。核心配置有五个：

| 配置 | 作用 | 注意 |
| --- | --- | --- |
| Iterator expression | 返回要遍历的列表 | 必须是数组；返回 `null` 会出问题 |
| Skip failure | 当前元素失败时是否继续下一个 | 只影响单个迭代的失败，不等于忽略整条循环的失败 |
| Run in parallel | 所有迭代并行 | 受 worker 数量限制 |
| Limit concurrent iterations | 并行时的最大并发数 | 数字或表达式；< 1 会让步骤失败 |
| Squash | 所有迭代在同一 worker 上跑 | 不能和并行同时用 |

**Squash 的价值**：官方说明，对 TypeScript / Python，整个循环共用一个 runner，消除迭代之间的冷启动。适合「迭代很多、每次计算很短」的场景。

**测试**：可以用 `Test an iteration` 单独测某一次迭代。运行后，图上可以查看每个迭代的参数、日志、结果；for loop 的详情页会列出所有迭代状态。

**迭代下标和值**：循环内的步骤可以使用当前迭代的下标和值。官方文档没有给出跨语言的统一变量名，实际以编辑器的字段选择器为准。

常见坑：

- iterator 返回对象而不是数组。用 `Object.values(obj)` 或 `Array.from(...)` 明确转换。
- 开了并行又开 squash。官方明确两者不能组合。
- 迭代里有副作用，并行后顺序不可控。需要顺序时不要开并行。
- 列表很大且每个元素都很重，一次性并行把 worker 打满。用 `Limit concurrent iterations`。

### While loop

While loop 会一直执行，直到：

1. 手动取消；
2. 循环级 **Early stop / Break** 的谓词命中；
3. 某一步的 **Early stop for step** 命中；
4. 达到 **Limit iterations** 或 **Limit duration**。

关键细节（官方明确）：

- `max_iterations` 和 `max_duration_secs` 都是至少为 1 的整数。
- duration 是**墙钟时间**，从第一次迭代开始算，等 worker 的时间也算进去。
- 两个上限都在**每次迭代结束后**检查；正在跑的迭代不会被中断，所以实际可能超出上限最多一个迭代。
- 想限制单次迭代，给循环内的步骤设 timeout。
- 达到上限时，循环以 `LoopExhausted` 错误失败；如果同一迭代正好命中 break 条件，则按 break 处理。
- `LoopExhausted` 可以像普通步骤失败一样被重试、error handler 或 Continue on error 处理；后面可以接 Branch one 判断 `results.<loop_id>.error?.name === 'LoopExhausted'`。
- Skip failure 对「达到上限」不生效，达到上限仍然失败。

常见坑：

- 只写 break 条件，不设上限，条件永远不满足 → 无限循环。
- 以为 `max_duration` 会精确截止。它只在迭代结束后检查。
- 在循环里等外部审批/长 sleep，duration 会把等待时间算进去。

---

## 3. 错误处理

Flow 的错误处理是分层的，先理解顺序：

```text
步骤失败
  → 该步骤配置了 retries？按策略重试
  → 重试耗尽后：
      ├─ Continue on error 开启 → 把 error 放进 result，继续下一步
      ├─ Error handler 存在 → 执行 error handler
      └─ 都没有 → Flow 失败，错误向上传播
```

### 3.1 错误长什么样

失败步骤的 result 里有 `error` 字段。官方 retries 文档提示错误有「specific shape」；error handler 的输入就是失败步骤的结果，因此可以从 `error` 里取信息。

对 TypeScript / Python / PHP 步骤和 DuckDB 的 data test，错误里还可能带：

- `job_id`：失败 job 的 id，便于跳转运行页；
- `flow_path`：失败步骤所在的 Flow / 子 Flow / 循环分支路径。

但 dedicated worker 上的 TS/Python 步骤不带这两个字段。编辑器默认只填 `message`、`name`、`step_id`；要拿 `job_id` / `flow_path`，需要在 error handler 参数里显式接 `error.job_id` / `error.flow_path`。

### 3.2 Retries（步骤级）

在步骤的 **Advanced → Retries** 里配置。有两种：

**Constant retry**：固定最大尝试次数 + 固定 delay。

**Exponential backoff**：配置 base（秒）、multiplier、attempts。官方公式：

```text
delay = multiplier * base ^ (number of attempt)
```

官方例子：base=3、multiplier=2、attempts=5 时，延迟依次是 6s、18s、54s、162s、486s。

要点：

- 如果同时配置了 static 和 exponential，先试 static，再试 exponential。
- 每次重试都是一次新的 job，日志会保留。
- 重试会增加副作用重复执行的概率，写库要幂等。

### 3.3 Continue on error

开启后，步骤在耗尽重试后仍然失败，但 Flow 继续执行下一步，错误作为该步骤 result 的一部分返回。这样可以在后面接 Branch one，根据 `results.<id>.error` 走补偿逻辑。

适合：失败可容忍、需要走降级路径的步骤。

不适合：失败后继续会产生脏数据的步骤。

### 3.4 Error handler（Flow 级）

Error handler 是特殊的 Flow 步骤，Flow 里任何步骤出错（且重试耗尽）时执行。它接收失败步骤的结果作为输入。

**默认行为**：即使 error handler 成功，Flow 最终仍标记为失败。

**要标记为成功**：让 error handler 返回 `{ recover: true }`。官方说明 `recover` 只改变最终状态，不改变实际执行了哪些步骤。

例外：

- 并行循环内部更深层的失败，仍会让该并行循环失败。
- Python / TS 的 error handler 模板默认返回 `recover: false`，需要自己改成 true 或按条件计算。

常见坑：

- error handler 里又抛错，导致原始错误被覆盖。建议 error handler 自己做好 try/catch，至少把原始错误记下来。
- 以为 error handler 会「重跑失败步骤」。它不会；它只是处理错误。
- Flow timeout 触发时，error handler 会执行，但 run 仍以 `timeout` 取消结束，即使返回 `recover: true`。

官方页：<https://www.windmill.dev/docs/flows/flow_error_handler>

### 3.5 Custom timeout

**步骤 timeout**：限制单个步骤的执行时间。不能超过实例的 `TIMEOUT` 上限（自托管由环境变量控制）。对脚本步骤，只计算该脚本 job 的运行时间。

**Flow timeout**：限制整条 run 的墙钟时间，从开始运行算起，**sleep 和审批等待都算**。在 Flow Settings → Runtime → Execution policy → Timeout 设置。它不受实例 `TIMEOUT` 限制。

Flow timeout 到达时：

- 取消正在运行的步骤；
- 执行 error handler（如果有）；
- run 以 `cancelled by timeout` 结束，即使 error handler 返回 `recover: true`；
- 正在等待的审批会被放弃，即使开了 continue on disapproval/timeout；
- 实际结束时间可能比 deadline 晚约十秒。

子 Flow 也受 timeout 影响；调用步骤上设置的 timeout 会替换子 Flow 自己的 timeout。

### 3.6 Early stop / Break

在步骤的 **Advanced → Early stop/Break** 里配置谓词。步骤执行完后求值，命中则停止 Flow。

- 表达式里可以用 `result`（当前步骤结果）、`flow_input`、`results`。
- 可以勾选「Label flow as skipped」，让这次 run 在 Runs 页面里标为 skipped（只是标签，不是失败）。
- 如果 Early stop 在 for loop 内命中，只会 break 当前循环，不会停整条 Flow。
- Flow 级别也可以根据输入设置 Early stop：输入满足条件时，Flow 根本不运行。

### 3.7 Early return

用于**同步 Webhook**：在某个节点提前把结果返回给调用方，Flow 剩余部分继续异步执行。

- 可以选顶层步骤，或 branch one / branch all 里的步骤（可嵌套）。
- 不能选 for loop / while loop 里的步骤。
- 如果该步骤所在分支没走到，同步端点会等整条 Flow 完成，返回最终结果。
- 如果该步骤失败，端点返回该步骤的错误，或 error handler 的结果。
- 配了 Early return 后，streaming 也从该步骤取输出，而不是最后一步。

常见坑：把 Early return 当成「提前结束 Flow」。它只影响同步返回，后面的步骤仍会继续跑。

---

## 4. 挂起、审批与延迟

### 4.1 Approval / Suspend

审批步骤本质上是普通脚本步骤，开启了 **Suspend until approval/resume**。

- 通过 `wmill.getResumeUrls()`（TS）或 `wmill.get_resume_urls()`（Python）生成秘密 URL。
- 只有拿到 URL 的人能批准/拒绝；每个审批事件就是一次 HTTP 请求。
- 可以设置 **required_events**：必须收到精确数量的审批事件才继续；少于要求会一直挂起（除非设了 timeout）。
- 可以设置审批步骤自己的 timeout；Flow timeout 也会把审批等待算进去。
- 审批等待不占 worker。

**Continue on disapproval/timeout**：开启后，拒绝或超时不会让 Flow 失败，而是继续下一步，并给出一个带 `error` 的 result。错误名是 `SuspendedDisapproved` 或 `SuspendedTimedOut`；拒绝原因可以从 `resume.error.reason` 读。

**表单**：审批页可以附带 schema form，让审批人填参数；这是 Cloud / Enterprise Self-Hosted 功能。

**页面样式**：`Detailed`（默认，展示 Flow 详情）或 `Minimal`（只展示请求、描述、表单和按钮），适合非开发审批人。

常见坑：

- 不设 timeout：审批人离职/链接丢失，run 永久挂起。
- required_events 设成 2，但只通知了一个人。
- 审批 URL 泄露到公共频道。它是秘密 URL，等同于批准权限。

官方页：<https://www.windmill.dev/docs/flows/flow_approval>

### 4.2 Sleep

在步骤的 **Advanced → Sleep** 里设置：该步骤结束后暂停 N 秒，再调度下一步。

- 单位是秒，可以表达小时/天级别。
- 被动等待，不消耗资源。
- 如果该步骤是最后一步，sleep 没有效果。
- 适合「注册后隔一天发欢迎邮件」「提交工单后等 30 分钟再升级」这类场景。

常见坑：

- 用 sleep 代替 schedule。长时间、固定时刻的任务更适合 cron。
- 用 sleep 等外部事件。等审批用 Approval，等条件用轮询 + Early stop。

---

## 5. 调度（Schedule）

官方页：<https://www.windmill.dev/docs/core_concepts/scheduling>

### 5.1 CRON 语法

Windmill 使用 croner 解析器，**6 个字段，第一段是秒**：

```text
sec min hour day-of-month month day-of-week
```

- Unix 的 5 段写法会被拒绝：`0 2 * * *` 要写成 `0 0 2 * * *`。
- 支持 `?`、`L`、`W`、`#` 等扩展。
- 例：`0 0 12 * * MON-FRI` 表示工作日中午 12 点。
- 例：`0 0 12 ? * 5#3` 表示每月第三个周五中午 12 点。

### 5.2 Primary vs Other schedules

- 每个 Script / Flow 最多一个 **primary schedule**，在 Flow Settings 里配置，和 Flow 共享 path。
- 可以有多个 **other schedules**，在 workspace 的 Schedules 菜单里建。
- 新建 schedule 时要选 runnable、填参数、可加 error handler / recovery handler。

### 5.3 调度层面的错误处理

- **Schedule error handler**：调度执行失败时运行，可以选 Slack / Teams 预设。官方标注为 Enterprise Edition 功能。
- **Schedule recovery handler**：从错误恢复时运行。
- handler 以 schedule 的权限运行，只能访问 schedule owner 能访问的变量和资源。
- **Dynamic skip**：用一个 validation script 在运行前判断是否跳过（例如周末、节假日）。返回 true 才执行；返回其他值则标记为 success + skipped；抛异常则按失败处理。

### 5.4 错过与延迟

官方明确：一个 schedule 同时只保留一个 queued occurrence。

- 如果一次 run 超过了下一个触发时间，中间错过的 occurrence 会被跳过，schedule 从下一个未来时间继续。
- Flow（以及带 dynamic skip 的 Script）在**开始运行时**就排队下一次 occurrence，所以只有在「开始时间晚于下一次应触发时间」时才算 late。
- 连续 3 次 late 会触发 workspace 的 critical alert（EE 功能；列表里的标记所有版本都有）。

这解释了「为什么我的每分钟任务看起来少跑了几次」：不是 cron 丢了，而是上一次还没跑完。

### 5.5 Trigger script：定时轮询的正确姿势

Trigger script 是定时 Flow 的第一步：拉取外部数据，返回自上次运行以来的新条目；没有新数据就 early exit。它依赖 **state** 记录「上次处理到哪里」。

官方比喻：每天开信箱，有新信就处理，没有就不做；关键是**看过的信不要放回信箱**。

常见坑：

- 没更新 state → 每次重复处理同一批数据。
- state 更新放在处理之前 → 处理失败会丢数据；放在处理之后 → 可能重复处理。需要根据业务选择至少一次/至多一次，并做幂等。
- 用 trigger script 代替真正的 Webhook。能推则推，轮询是退路。

---

## 6. 权限与所有权

Flow 的权限有两层：**workspace 角色**和**具体 item 的 path 权限**。排错时经常发现「代码没问题，是人没权限」。

### Path 与 owner

- 每个 Flow 的 Path 由 owner 和名字组成；owner 可以是 user，也可以是 folder（一组人）。
- 放在个人目录（`u/...`）下，别人通常只能按分享/权限设置访问；放在 folder（`f/...`）下，适合团队共同维护。
- Folder 的读写组决定谁能看、谁能改；Flow Settings 的 Metadata 里可以改。

### Workspace 角色

- **Developer**：默认可写代码、建 Flow / App。
- **Operator**：运行和查看别人做的东西，不写代码；默认仍可管理 schedule 和 trigger。
- 自定义角色可以细调 **Write code**、**Can run**、**Flows and AI agents**（None / Compose / Full）、**Manage schedules**、**Manage triggers** 等能力。
- **Full** 流程编辑需要 Write code；**Compose** 只能用已部署的 Script / Flow 组装，不能写内联代码，也不能引 Hub runnable。

### 运行权限

- Schedule、HTTP route 等触发器以 **owner 的权限**运行，只能访问 owner 能访问的 Variable / Resource。
- 所以 owner 离职、权限被收回、Resource 被移走，都可能导致「昨天还能跑，今天失败」。
- 交接 Flow 时，除了改代码，还要检查 owner、folder 权限、schedule 的 owner。

官方页：<https://www.windmill.dev/docs/core_concepts/roles_and_permissions>

## 7. 排错顺序（控制面）

1. 先看 run 的步骤状态：是失败、跳过、还是压根没入队？
2. 失败 → 看 retries 是否耗尽、error handler 是否执行、timeout 是否触发。
3. 没入队 → 看分支 predicate 是否命中、循环 iterator 是否为空、上游是否失败。
4. 循环异常 → 看 iterator 类型、break 条件、max_iterations / max_duration。
5. 定时异常 → 看 schedule enabled、cron 段数、是否 late、是否被 dynamic skip。
6. 审批卡住 → 看 required_events、timeout、URL 是否发对人。
7. 最后才怀疑表达式和脚本逻辑，用 Test this step 复现。

## 8. 组合建议

- **失败可恢复**：步骤 retry + error handler 告警；需要继续走补偿逻辑时用 Continue on error + Branch one。
- **批量处理**：For loop + `Limit concurrent iterations`，每个迭代内部步骤设 timeout；不要盲目全并行。
- **需要人确认**：Approval + timeout + Continue on disapproval，后面接 Branch one 处理拒绝。
- **长流程**：Flow timeout 兜底，关键步骤单独 timeout；不要用 sleep 做长期等待。
- **定时 ETL**：Schedule + Trigger script/state + For loop；给 schedule 配 error handler。
