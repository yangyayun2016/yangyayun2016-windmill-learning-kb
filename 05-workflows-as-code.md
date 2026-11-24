# 05 · Workflows as Code（WAC）

官方页：<https://www.windmill.dev/docs/core_concepts/workflows_as_code>

## 1. 它是什么

Workflows as Code 是在 **TypeScript 或 Python 脚本里直接写编排逻辑**：用普通函数、条件、循环表达流程，由 Windmill 负责 checkpoint、并行和容错。

它和可视化 Flow 解决的是同一类问题——把多个任务编排起来——但表达方式不同：

- 可视化 Flow：流程定义是 OpenFlow（JSON/YAML），在画布上编辑。
- WAC：流程定义就是脚本代码，`workflow()` 包住入口，`task()` 包住每个要独立执行的函数。

WAC 不是「另一种 Flow 节点」，而是一个 Script。它可以像普通 Script 一样被 Git 同步、被 CLI 推送、部署和触发。

## 2. 执行模型：checkpoint / replay

这是理解 WAC 的关键。官方描述的过程：

1. 工作流脚本开始执行，直到遇到一个尚未缓存的 `task()`、`step()`、`sleep()` 或 `waitForApproval()`。
2. 脚本退出，Windmill 把已完成步骤的结果作为 checkpoint 写入数据库。
3. **父工作流完全挂起，释放 worker 槽位**。
4. `task()` 创建子 job 并派发；所有子 job 完成后，父工作流重新入队。
5. 重放时，已完成的步骤直接返回缓存结果，从断点继续。

由此得到几个重要结论：

- 父工作流在子任务运行、sleep、等审批期间**不占 worker**。
- 一个 sleep 24 小时的工作流，等待期间 worker 占用为 0。
- 一个 100 并发 task 的工作流，编排本身占 0 个槽位，100 个槽位都给子任务。
- 子任务可以跑在任何可用 worker 上。

官方称之为 **zero worker waste**。

## 3. 最小示例

### TypeScript

官方 API 来自 `windmill-client`。注意：抓取到的官方 `.md` 镜像里，TS 示例的 `import` 行被去掉了，实际写代码时以编辑器模板/官方页面为准。

```ts
async function fetchData(url: string) {
  const resp = await fetch(url);
  return resp.json();
}

async function transform(data: any) {
  return { count: data.length, summary: data.slice(0, 5) };
}

export const main = workflow(async (url: string) => {
  const data = await task(fetchData)(url);
  const result = await task(transform)(data);
  await sleep(5);
  return result;
});
```

### Python

```python
from datetime import datetime
from wmill import task, step, workflow, sleep

@task
async def fetch_data(url: str):
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        return resp.json()

@task
async def transform(data: list):
    return {"count": len(data), "summary": data[:5]}

@workflow
async def main(url: str):
    started_at = await step("started_at", lambda: datetime.now().isoformat())
    data = await fetch_data(url)
    result = await transform(data)
    await sleep(5)
    return result
```

## 4. 核心原语

| 原语 | TypeScript | Python | 作用 |
| --- | --- | --- | --- |
| 工作流入口 | `workflow(fn)` | `@workflow` | 标记入口；其他原语必须在它内部使用 |
| 子任务 | `task(fn)` / `task(path, fn, opts)` | `@task` / `@task(...)` | 每次调用是一个独立子 job |
| 内联步骤 | `step(name, fn)` | `step(name, fn)` | 在父进程内执行并持久化结果 |
| 持久 sleep | `sleep(seconds)` | `sleep(seconds)` | 服务端挂起，释放 worker，最小 1 秒 |
| 审批 | `waitForApproval(opts)` | `wait_for_approval(...)` | 挂起等人批准/拒绝，释放 worker |
| 并行 | `parallel(items, fn, opts)` | `parallel(items, fn, concurrency=...)` | 批量并行，可限并发，结果按输入顺序返回 |
| 调已有脚本 | `taskScript(path, opts)` | `task_script(path, **opts)` | 按路径派发已有 Script |
| 调已有 Flow | `taskFlow(path, opts)` | `task_flow(path, **opts)` | 按路径派发已有 Flow |
| 恢复 URL | `getResumeUrls(approver?)` | `get_resume_urls(approver=None)` | 拿到 approvalPage / resume / cancel 三个 URL |
| 任务错误 | — | `TaskError` | 含 `step_key`、`child_job_id`、`result` |

### `task()` 和 `step()` 的区别

| | `task()` | `step()` |
| --- | --- | --- |
| 执行位置 | 独立子 job（独立进程/worker） | 父进程内联 |
| 开销 | 完整 job 生命周期 | 一次函数调用 + 一次数据库写入 |
| 并行 | 可以（`Promise.all` / `asyncio.gather`） | 只能顺序 |
| 日志 | 独立日志流 | 混在父日志里 |
| 时间线 | 独立条目 | 不单独显示 |
| 适合 | 重计算、外部 API、需要独立观测 | 时间戳、随机 ID、配置读取、需要跨重放稳定的轻量计算 |

**选择原则**：需要独立执行、独立日志、并行 → `task()`；只是需要一个「重放时不变的值」→ `step()`。

## 5. 确定性要求（最容易踩的坑）

WAC 依赖重放：工作流会从头执行，已完成的步骤返回缓存结果。因此编排逻辑必须**确定性**——同样的输入，每次重放必须以相同顺序调用相同的 task。

### 安全模式

- 根据 task 的结果做分支（结果从 checkpoint 重放）。
- 遍历静态列表或 task 返回的列表。
- 只依赖输入和之前 task 结果的逻辑。

### 破坏确定性的模式

| 写法 | 问题 | 正确做法 |
| --- | --- | --- |
| `Date.now()` / `datetime.now()` | 每次重放值不同 | `await step('ts', () => Date.now())` |
| `Math.random()` / `random.random()` | 每次重放值不同 | `await step('id', () => randomUUID())` |
| 读取可能变化的环境变量/配置 | 重放时值可能变 | 用 `step()` 固化 |
| 结果会影响控制流的外部 API 调用 | 重放时可能返回不同结果 | 用 `task()` 或 `step()` 包住 |

### 版本固定

- 运行中的工作流固定在它启动时的 **script hash**；运行期间部署新版本，不影响已经在跑的 run。
- 如果 checkpoint 是另一个版本的脚本写的，Windmill 会拒绝恢复，并让 job 失败，要求重启。
- Preview 没有 script hash，不做这个检查。

这条非常重要：**不要在工作流运行到一半时部署不兼容的新版本**，否则重放会失败。

## 6. 并行

### 标准写法

TypeScript 用 `Promise.all`：

```ts
const [a, b, c] = await Promise.all([
  task(fetchUser)(1),
  task(fetchUser)(2),
  task(fetchUser)(3),
]);
```

Python 用 `asyncio.gather`：

```python
u1, u2, u3 = await asyncio.gather(
    fetch_user(1),
    fetch_user(2),
    fetch_user(3),
)
```

### `parallel()` 工具

```ts
const results = await parallel(items, (item) => task(processItem)(item));
const batched = await parallel(items, (item) => task(processItem)(item), {
  concurrency: 3,
});
```

```python
results = await parallel(items, lambda item: process_item(item))
batched = await parallel(items, lambda item: process_item(item), concurrency=3)
```

特点：

- 默认全部同时发起。
- `concurrency` 限制同时进行的数量。
- 返回结果顺序与输入顺序一致。

常见坑：`parallel()` 里如果直接调用普通函数而不是 `task()`，它不会变成子 job。要并行执行，传进去的应该是 `task(...)` 包装后的调用。

## 7. 重试

在 task 上配置 `retry`，而不是在流程里写循环：

```ts
const callApi = task(fetchOrders, {
  retry: { attempts: 3, delay: 30, multiplier: 2 },
});
```

```python
@task(retry={"attempts": 3, "delay": 30, "multiplier": 2})
async def call_api(since: str):
    ...
```

### 参数

| 字段 | 说明 |
| --- | --- |
| `attempts` | 必填，首次失败后的重试次数；`2` 表示最多跑 3 次；必须是 0–100 的整数 |
| `delay` | 第一次重试前等待秒数，默认 0；小于 1 秒会被丢弃（立即重试） |
| `multiplier` | 每次尝试后对 delay 的乘数，默认 1（固定间隔），2 表示翻倍 |
| `max_delay` | delay 的上限（秒） |

等待公式（官方）：

```text
第 n 次重试前等待 = delay * multiplier ^ (n - 1)，且不超过 max_delay
```

注意：这**不是**可视化 Flow 步骤重试的公式（后者是 `multiplier * base ^ n`）。

### 几个容易忽略的细节

1. **每次尝试是独立步骤**：命名为 `call_api`、`call_api#2`、`call_api#3`，各有独立日志和时间线。
2. **重试等待是持久 sleep**：不占 worker，等一小时也不花钱。
3. **同一 fan-out 里的重试是串行的**：官方明确，一轮只等一个 backoff；三个 task 同时以 `delay: 30` 重试，整个 fan-out 大约 90 秒后才一起重试，而不是 30 秒。
4. **`retry` 只在 `workflow()` 内生效**：在 workflow 外调用 task，函数体会直接执行，选项被忽略。
5. **非法配置在声明处就报错**：非整数、超出 0–100、Python dict 里有未知 key，都会立即失败。

### 自定义重试

当重试策略依赖错误类型、剩余次数、每次不同参数时，自己写 `try/catch` + `sleep()`，不要配 `retry`：

```python
for attempt in range(1, 4):
    try:
        return await call_api(endpoint)
    except TaskError as e:
        if attempt == 3 or "429" not in str(e):
            raise
        await sleep(60)
```

每次循环调用仍是一个独立步骤，重放时同样能恢复；代价是命名由步骤计数器决定（`call_api`、`call_api_2`、`call_api_3`），不像内置重试那样分组为 `call_api#2`。

## 8. 错误处理

子任务失败、重试耗尽后，错误传播到父工作流，可以用标准 `try/catch` / `try/except` 捕获：

```python
from wmill.client import TaskError

try:
    return await risky_operation(data)
except TaskError as e:
    print(e.step_key, e.child_job_id, e.result)
    return await fallback(str(e))
```

`TaskError` 的可用属性：`step_key`、`child_job_id`、`result`。

即使不是你的代码抛的错，也可能以 task error 形式出现：

- 执行任务的 worker 挂了，任务会在另一个 worker 重启；
- 重启次数耗尽，或任务被取消，失败会传到工作流。

重启行为由 `RESTART_ZOMBIE_JOBS` 和 `ZOMBIE_JOB_TIMEOUT` 控制（自托管环境变量）。

## 9. 审批 / 人工介入

```ts
const approval = await waitForApproval({ timeout: 3600 });
if (!approval.approved) {
  return `rejected by ${approval.approver}`;
}
```

```python
approval = await wait_for_approval(timeout=3600)
if not approval["approved"]:
    return f"rejected by {approval['approver']}"
```

返回值：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `value` | any | 审批人填的表单数据（如果配置了 form） |
| `approver` | string | 批准/拒绝的人 |
| `approved` | boolean | true=批准；false=拒绝或超时 |

参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `timeout` | 1800 秒 | 超时后工作流被取消 |
| `form` | 无 | 表单字段；直接传字段 key，或传完整 JSON Schema；EE 功能 |
| `selfApproval` / `self_approval` | true | 是否允许触发者自己批准；false 需要其他人（EE） |
| `skin` | detailed | `detailed` 或 `minimal` |
| `description` | 无 | 审批页上展示的说明，支持字符串或 rich display（如 `{ markdown: "..." }`） |

等待期间工作流显示为 suspended，不占 worker。时间线在等待时不显示内容，恢复后才展示完整执行。

### 发审批链接

`getResumeUrls()` 返回 `{ approvalPage, resume, cancel }`。官方建议用 `step()` 包住它，保证重放安全：

```ts
const urls = await step("urls", () => getResumeUrls());
await step("notify", () => sendSlackMessage(urls.approvalPage));
```

## 10. 脚本模块（`__mod/`）

WAC 支持把 task 函数拆到伴随模块目录 `__mod/`，仍属于同一个 Script。

**Flat layout：**

```text
f/my_folder/
├── my_workflow.ts
└── my_workflow__mod/
    ├── extract.ts
    └── transform.ts
```

**Folder layout：**

```text
f/my_folder/
└── my_workflow__mod/
    ├── script.ts        # 入口
    ├── extract.ts
    └── transform.ts
```

用相对路径引用：

```ts
const result = await taskScript("./transform.ts")({ data });
```

```python
data = await task_script("./extract.py")(url=url)
```

模块会被 CLI 同步，并计入 script hash；每个模块可以有自己的依赖，lock 按模块跟踪。

## 11. 同步、部署与版本

### CLI

```bash
# 推送 WAC 脚本（含模块）
wmill script push f/my_folder/my_workflow

# 拉取（模块写到 __mod/ 目录）
wmill sync pull

# 本地预览（自动包含模块）
wmill script preview f/my_folder/my_workflow
```

CLI 在 `wmill-lock.yaml` 里记录每个模块的 hash，只重新生成有变化的模块。

### Git

WAC 脚本可以像普通 Script 一样接 Git sync。工作区里的每一次部署可以自动提交；反过来也能从 Git 自动部署。团队协作时，建议把 WAC 放进 Git，用 PR review 编排逻辑。

Git sync 官方页：<https://www.windmill.dev/docs/advanced/git_sync>

### 版本行为

- 运行中的 WAC job 固定在其创建时的 script hash。
- 部署新版本不会改变已经在跑的 run。
- checkpoint 与脚本版本不匹配时，恢复会失败，需要重启 job。
- Preview 不带 hash，不受这条限制。

## 12. 可视化 Flow vs Workflows as Code

| 维度 | 可视化 Flow | Workflows as Code |
| --- | --- | --- |
| 编排表达 | 画布 + OpenFlow JSON/YAML | TypeScript / Python 代码 |
| 上手成本 | 低，所见即所得 | 需要熟悉 API 和异步写法 |
| 复杂逻辑 | 表达式 + 分支/循环组合，复杂后难读 | 函数、循环、条件、抽象都自然 |
| 业务可读性 | 非开发也能看懂图 | 需要读代码 |
| 审批/分支/循环 | 内置步骤，配置即可 | 用 API 实现，灵活性更高 |
| 确定性 | 由引擎管理，用户不需要考虑重放 | 用户必须保证编排逻辑确定性 |
| 版本/Review | YAML diff | 代码 diff，天然适合 Git PR |
| 调试 | 图上单步测试、Test up to、Restart from step | 脚本 preview、子 job 日志、workflow diagram |
| 动态 fan-out | for loop + 表达式 | `Promise.all` / `asyncio.gather` / `parallel()` |
| 适用 | 流程固定、需要审批和可视化、多人维护 | 逻辑复杂、需要复用/测试/代码审查、动态并行 |

### 选择建议

**优先可视化 Flow，如果：**

- 流程步骤相对固定，主要是「A → B → C」加少量分支。
- 需要非开发同事理解、审批、维护。
- 需要现成的 Approval、Early return、Test up to、Restart from step。
- 团队不想为「重放确定性」负责。

**优先 WAC，如果：**

- 编排逻辑本身很复杂（多层条件、动态生成任务、复杂聚合）。
- 你希望编排逻辑走 Git PR、code review、复用函数。
- 需要精细控制并行度、重试策略、错误处理。
- 团队本来就是 TS/Python 开发者，能接受异步编程和确定性约束。

**可以混用：**

- 用 WAC 写复杂的数据处理，内部用 `taskFlow()` 调用一条带审批的可视化 Flow。
- 用可视化 Flow 做入口和审批，把重计算交给 `taskScript()` 调用的 WAC 脚本。
- 两者都通过 Git 管理，按团队习惯分层。

## 13. 常见坑清单

1. 在 `workflow()` 外调用 `task()`，以为会创建子 job；实际直接执行函数，选项被忽略。
2. 在编排逻辑里直接用 `Date.now()` / `random()`，重放后结果漂移。
3. 运行中部署不兼容的新版本，导致 checkpoint 恢复失败。
4. 以为 `step()` 会并行；它只能顺序执行。
5. 用 `parallel()` 包普通函数而不是 `task()`，结果没有并行子 job。
6. 以为 fan-out 的重试是同时等待；官方明确是串行等待，总延迟可能比预期长。
7. 用 WAC 的内置 `retry` 公式去套可视化 Flow 的公式，两者不同。
8. 审批 timeout 设得过长，或没处理拒绝/超时分支，导致 run 长期挂起或直接失败。
9. 模块路径写错，或忘了 `__mod/` 的布局，CLI 同步后运行找不到文件。
10. 把 WAC 当成「可视化 Flow 的另一种导出格式」；它是独立 Script，调试和部署路径都按 Script 走。

## 14. 从可视化 Flow 迁移到 WAC 的思路

1. 先把每个步骤抽成独立函数，确认输入输出形状。
2. 用 `task()` 包住有副作用/重计算的步骤，用 `step()` 包住时间戳、ID 等。
3. 把分支改成 `if/else`，把 for loop 改成 `for` 或 `parallel()`。
4. 把审批改成 `waitForApproval()`，把 sleep 改成 `sleep()`。
5. 把 error handler 改成 `try/catch` + fallback task。
6. 检查确定性：所有随机/时间/外部配置是否都经过 `step()`。
7. 先在 preview 里跑通，再部署；部署后用同一组输入对比旧 Flow 的结果。
8. 保留旧 Flow 一段时间，确认新 WAC 稳定后再下线。
