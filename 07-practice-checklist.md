# 07 · 动手练习清单（app.windmill.dev）

目标：在不碰生产 Flow 的前提下，把 Flow 和 Workflows as Code 的核心能力各跑一遍。

## 安全规则（先读）

1. **只在自己的实验目录里建东西**，例如 `u/<你的用户名>/learning/`。不要改团队已有的 Flow、Schedule、Resource。
2. 需要凭据时，用测试用的 Resource / Variable；不要用生产 token，也不要把密钥写进步骤输入。
3. 需要发消息时，发到自己的测试频道或自己的邮箱。
4. 定时练习完成后**立刻 disable schedule**，避免持续产生 run。
5. 练习结束后归档或删除实验 Flow；至少把 Summary 改成「练习-可删除」。
6. 不要为了练习去改别人的 Flow 权限、计费设置或 workspace 设置。

建议准备一个 `learning` 目录，后面所有练习都放在里面。

---

## 练习 1：最小单步 Flow

**目标**：理解「Flow = 输入 + 步骤 + 结果」。

**做什么**：

1. New → Flow，路径 `u/<you>/learning/hello_flow`。
2. 在 Settings 里写 Summary 和 Description。
3. 加一个 Action，内联一段最简单的脚本：接收 `name`，返回 `{ "message": "hello " + name }`。
4. 在 Flow Inputs 里加 `name`（String），给默认值。
5. Test this step → Test flow → Deploy。

**验收**：

- Test flow 返回 `{ message: "hello ..." }`。
- 部署后，Flow 页面能直接运行，结果与测试一致。

**常见坑**：

- 只保存没部署，以为已经上线。
- 输入名和脚本参数名不一致，运行时报缺少参数。

**参考**：<https://www.windmill.dev/docs/getting_started/flows_quickstart>

---

## 练习 2：两步串联，理解 `results`

**目标**：让第二步读取第一步的结果。

**做什么**：

1. 在练习 1 的 Flow 里加第二步 Action。
2. 第一步返回 `{ "items": [1, 2, 3], "count": 3 }`。
3. 第二步参数 `total` 用 Dynamic 表达式：`results.<第一步id>.items.reduce((a, b) => a + b, 0)`。
4. 先 Test 第一步，再 Test 第二步，最后 Test flow。

**验收**：

- 第二步收到 `6`。
- 在运行结果面板里能点开两步各自的输入/输出/日志。

**常见坑**：

- 没先跑第一步，第二步表达式里的 `results` 是空的。
- 把 `results.a` 当成第一步返回的某个字段；它其实是整个返回对象。
- 步骤 id 用了默认 `a`，后面又改 id，表达式没跟着改。

**参考**：<https://www.windmill.dev/docs/flows/architecture>

---

## 练习 3：三种输入模式

**目标**：分清 Static、Templatable、Dynamic。

**做什么**：

1. 新建一个 Flow，输入 `order_id`（String）和 `count`（Integer）。
2. 加一个步骤，参数分别用：
   - `prefix`：Static，值 `"ORDER"`
   - `label`：Templatable，值 `"${flow_input.order_id}-done"`
   - `limit`：Dynamic，值 `Number(flow_input.count) + 1`
3. 测试并观察每个参数实际收到的值和类型。

**验收**：

- `label` 是拼接后的字符串。
- `limit` 是数字，不是字符串。
- 把 `count` 改成字符串再测试，观察类型不匹配时的行为。

**常见坑**：

- 在 Dynamic 里写 `"${flow_input.count}"`，得到字符串。
- 在 Templatable 里写 `.map()`，以为会得到数组。

**参考**：<https://www.windmill.dev/docs/flows/editor_components>

---

## 练习 4：Branch one 两条路径

**目标**：按条件走不同分支，并理解 default。

**做什么**：

1. 输入 `score`（Integer）。
2. 加 Branch one，分支 1 的 predicate：`flow_input.score >= 60`，分支里放一个返回 `"pass"` 的步骤。
3. default 分支返回 `"fail"`。
4. 分别用 80、59 测试。

**验收**：

- 两次运行走了不同分支，运行图上看得到实际路径。
- default 分支在条件不满足时执行。

**常见坑**：

- 谓词用了 `=` 而不是 `===` / `>=`。
- 多个分支条件重叠，实际走了第一个，不是你以为的那个。
- 分支里引用了分支外未执行的步骤结果。

**参考**：<https://www.windmill.dev/docs/flows/flow_branches>

---

## 练习 5：For loop 与并行

**目标**：遍历列表、限制并发、观察每次迭代。

**做什么**：

1. 输入 `items`（Array，默认 `[1,2,3,4,5]`）。
2. 加 For loop，iterator 用 `flow_input.items`。
3. 循环体里放一个步骤：`await sleep(1)` 后返回 `item * 2`（或返回 item 和下标）。
4. 先不并行跑一次；再打开 Run in parallel，设 `Limit concurrent iterations` 为 2，再跑一次。
5. 对比两次运行的耗时和迭代顺序。

**验收**：

- 循环体收到每个元素。
- 并行 + limit 后，同时在跑的迭代不超过 2。
- 能在循环详情页看到每次迭代的状态、输入、输出。

**常见坑**：

- iterator 返回对象而不是数组。
- 同时开了 parallel 和 squash（官方明确不能组合）。
- 循环体内有写库等副作用，并行后顺序不可控。

**参考**：<https://www.windmill.dev/docs/flows/flow_loops>

---

## 练习 6：失败、重试、Error handler

**目标**：把「失败」当成正常路径来设计。

**做什么**：

1. 加一个步骤，当输入 `should_fail = true` 时抛错，否则返回成功。
2. 在 Advanced → Retries 里配置 2 次重试、固定延迟 5 秒。
3. 加一个 Error handler，返回 `{ "recover": true, "message": "handled" }`。
4. 分别用 `should_fail=false` 和 `true` 测试。
5. 观察：重试了几次、error handler 是否执行、最终 run 状态是什么。

**验收**：

- 失败时能看到多次尝试的日志。
- error handler 执行后，run 最终是成功（因为 `recover: true`）。
- 把 `recover` 改成 false，再跑一次，run 应该是失败。

**常见坑**：

- 以为 error handler 会自动重跑失败步骤。
- error handler 自己抛错，覆盖了原始错误。
- 重试的副作用重复执行（写库要幂等）。

**参考**：

- <https://www.windmill.dev/docs/flows/retries>
- <https://www.windmill.dev/docs/flows/flow_error_handler>

---

## 练习 7：Approval + timeout + 拒绝分支

**目标**：走一遍人工审批，包括拒绝路径。

**做什么**：

1. 加一个 Approval 步骤，设置 `required_events = 1`、timeout = 600 秒。
2. 开启 **Continue on disapproval/timeout**。
3. 审批步骤后面加 Branch one：
   - 条件 `results.<approval_id>.error?.name === "SuspendedDisapproved"` → 返回 `"rejected"`。
   - 条件 `results.<approval_id>.error?.name === "SuspendedTimedOut"` → 返回 `"timeout"`。
   - default → 返回 `"approved"`。
4. 运行一次并批准；再运行一次并拒绝。

**验收**：

- 等待期间 run 显示 suspended。
- 批准后继续走 default。
- 拒绝后走 rejected 分支，且 Flow 不一定失败（取决于 Continue on disapproval 配置）。

**常见坑**：

- 不设 timeout，run 一直挂着。
- required_events 设成 2 但只通知一个人。
- 拒绝后没写分支处理，结果直接失败。

**参考**：<https://www.windmill.dev/docs/flows/flow_approval>

---

## 练习 8：Schedule + Webhook

**目标**：让 Flow 被自动触发，并知道去哪看。

**做什么**：

1. 给练习 Flow 配 primary schedule：每 5 分钟一次（`0 */5 * * * *`），保存并 Deploy。
2. 在 Runs / Schedules 页面确认下一次运行时间。
3. 从 Flow 页面复制 Webhook URL，用 curl POST 一次（注意页面上的认证要求）。
4. 观察两种触发方式产生的 run。
5. **练习结束立即 disable schedule**。

**验收**：

- Schedule 到点产生 run。
- Webhook 能触发 deployed 版本。
- 能在 Runs 页面区分触发来源。

**常见坑**：

- 用 5 段 cron，保存被拒绝。
- 没 Deploy，schedule/webhook 不生效。
- 改过路径后用旧 Webhook URL。
- 练习 schedule 忘了关，持续产生 run。

**参考**：

- <https://www.windmill.dev/docs/core_concepts/scheduling>
- <https://www.windmill.dev/docs/core_concepts/webhooks>

---

## 练习 9：Workflows as Code 入门

**目标**：跑通 `workflow()` + `task()` + `step()`。

**做什么**：

1. New → Script，语言选 Python，路径 `u/<you>/learning/wac_hello`。
2. 按下面结构写（基于官方 Python 示例）：

```python
from datetime import datetime
from wmill import task, step, workflow

@task
async def double(n: int):
    return n * 2

@task
async def add(a: int, b: int):
    return a + b

@workflow
async def main(n: int):
    started_at = await step("started_at", lambda: datetime.now().isoformat())
    a = await double(n)
    b = await double(n + 1)
    return {"started_at": started_at, "sum": await add(a, b)}
```

3. 在编辑器里 Test，输入 `n = 3`。
4. 打开 job 详情，确认 `double`、`add` 是独立子 job，`started_at` 没有独立 job。
5. 再 Test 一次，理解这是**新的一次 run**，`started_at` 会重新生成；`step()` 的缓存在同一次 run 的重放中才复用。

**验收**：

- 返回 `sum = 14`（3*2 + 4*2）。
- 子任务有独立日志/时间线。
- `step()` 的结果跨重放稳定。

**常见坑**：

- `task()` 在 `workflow()` 外调用，选项无效。
- 在编排里直接用 `datetime.now()`，重放值漂移。
- 以为 `step()` 会并行。

**参考**：<https://www.windmill.dev/docs/core_concepts/workflows_as_code>

---

## 练习 10：WAC 并行、重试与审批

**目标**：把 WAC 的三个高频能力组合起来。

**做什么**：

1. 写一个 WAC 脚本，输入 `items`（list）和 `should_fail`（bool）。
2. 用 `parallel()` 处理 items，`concurrency=2`。
3. 给其中一个 task 配 `retry={"attempts": 2, "delay": 5, "multiplier": 2}`；当 `should_fail=true` 时抛错。
4. 在处理完后调用 `wait_for_approval(timeout=600)`。
5. 分别测试批准和拒绝路径。
6. 观察：并行子 job、重试的 `#2` 步骤、审批等待期间 worker 是否被占用。

**验收**：

- 同时最多 2 个子任务。
- 失败任务出现 `task_name`、`task_name#2` 等独立步骤。
- 审批等待时 run 处于 suspended，不长期占 worker。

**常见坑**：

- `parallel()` 里传了普通函数而不是 task 调用，结果没有并行子 job。
- 以为 fan-out 的重试是同时等待；官方明确是串行等待，总延迟会累加。
- 审批 timeout 设得过大或没处理拒绝。

**参考**：<https://www.windmill.dev/docs/core_concepts/workflows_as_code#retries>

---

## 练习 11：复盘与选型

**目标**：把「什么时候用哪种」变成自己的判断。

**做什么**：

1. 选一个你熟悉的真实场景（例如「每天拉订单 → 过滤 → 发 Slack」）。
2. 分别画出可视化 Flow 和 WAC 的实现草图。
3. 从下面维度打分（1–5）：可读性、可维护性、调试难度、审批/分支需求、团队技能、Git review 需求。
4. 写一段 5–10 行的结论：选哪个，为什么，哪些部分可以混用。

**验收**：

- 结论能解释「为什么不选另一个」，而不只是「哪个更熟」。
- 至少指出一个 WAC 的确定性风险，和一个可视化 Flow 的复杂度风险。

**参考**：[05-workflows-as-code.md](./05-workflows-as-code.md)

---

## 完成记录模板

```text
练习编号：
完成日期：
使用的路径：
遇到的错误：
怎么定位的：
官方链接：
结论（一句话）：
是否已清理实验 Flow / 关闭 schedule：
```

## 清理清单

- [ ] 关闭练习用 schedule
- [ ] 删除或归档实验 Flow / Script
- [ ] 删除测试用 Resource / Variable（如果没有被其他地方引用）
- [ ] 确认没有把测试消息发到生产频道
- [ ] 确认没有修改团队已有 Flow
