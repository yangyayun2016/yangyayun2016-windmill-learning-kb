# 00 · Flow 是什么，什么时候用

## 一句话定义

Windmill 的 **Flow** 是把多个 Script 按依赖关系串起来的工作流：每个步骤是一次独立的 job，由 worker 执行；步骤之间通过输入表达式传递数据，整体是一张有向无环图（DAG）。

官方快速入门里的原话是「workflows are state machines represented as DAGs to compose scripts together」。可以把 Flow 理解成「编排层」，真正干活的仍然是 Script。

- 官方入口：<https://www.windmill.dev/docs/getting_started/flows_quickstart>

## 五个核心心智模型

### 1. Flow 是 DAG，不是一段顺序代码

步骤可以有分支、并行、循环，也可以嵌套子 Flow。只要依赖允许，下游步骤可以引用任意上游步骤的结果，而不只是「上一步」。

官方架构页：<https://www.windmill.dev/docs/flows/architecture>

### 2. 每个步骤是一次独立 job

顺序步骤一个接一个执行；并行的分支会同时入队，可以被不同 worker 处理。官方给出的步骤间开销与冷启动大约 **20ms**（见 quickstart），这是 Windmill 编排性能的卖点之一。

### 3. 数据默认按「结果」传递

步骤的输入是一个 **input transform**：用受限的 JavaScript 表达式，把 Flow 输入、任意已完成步骤的 `results.<id>`、Resource / Variable 映射成该步骤的参数。

- `flow_input`：Flow 自身的输入对象
- `results.<step_id>`：某个已完成步骤的结果
- `resource(path)` / `variable(path)`：按路径取资源或变量

详见 [03-expressions-and-results.md](./03-expressions-and-results.md)。

### 4. Flow 的返回值是「最后执行的步骤结果」

除非中途返回了错误，或者配置了 **Early return**。这是排查「为什么 Flow 成功了但结果不对」时最先要想起的一条。

- 错误处理：<https://www.windmill.dev/docs/flows/error_handling>
- Early return：<https://www.windmill.dev/docs/flows/early_return>

### 5. 草稿与部署是两回事

Flow 有 draft（用户级、自动保存、只能从编辑器测试）和 deployed（生产版本）两种状态。定时、Webhook、API 调用的都是 deployed 版本。

- 官方页：<https://www.windmill.dev/docs/core_concepts/draft_and_deploy>

## 什么时候该用 Flow

适合：

- 需要把多个已有 Script 串起来，并保留每一步的日志、结果和重跑能力。
- 需要定时轮询、Webhook、审批、人工介入、失败重试。
- 需要并行处理一批数据（for loop + 并行），或按条件走不同分支。
- 需要给非技术同事一个可点击运行的界面（Flow 自带 auto-generated UI）。

不太适合：

- 只有一个步骤、没有编排需求：直接写 Script 更简单。
- 纯前端交互、多页面表单：用 App（或 full-code app），Flow 只作为后端 runnable。
- 编排逻辑高度动态、需要复杂语言特性：考虑 Workflows as Code，而不是在可视化编辑器里堆表达式。

## 四者对照：Script / Flow / Workflows as Code / App

| 维度 | Script | Flow（可视化） | Workflows as Code | App |
| --- | --- | --- | --- | --- |
| 本质 | 一段可执行代码（TS、Python、SQL、Bash 等） | 用 DAG 编排多个步骤 | 在 TS/Python 脚本里用 `workflow()` / `task()` 写编排 | 前端界面，调用 Script / Flow 作为后端 |
| 适合谁 | 开发者 | 开发者 + 运营 | 偏开发的团队 | 面向业务用户的工具 |
| 编排方式 | 无（自己写代码） | 拖拽节点、连线、表达式 | 代码里的函数调用、条件、循环 | 拖拽组件或写 React/Svelte |
| 可观测性 | 单次 job 的日志/结果 | 每个步骤独立 job、独立日志/时间线 | 每个 task 是子 job，父 workflow 可挂起 | 取决于调用的后端 |
| 审批/挂起 | 自己做 | 内置 Approval 步骤 | `waitForApproval()` | 可调用带审批的 Flow |
| 版本与部署 | 每次部署生成不可变 hash | 每个路径一个 deployed 版本 | 同 Script，按 hash 固定版本 | 有 draft/deploy |
| 典型场景 | 单个 API 调用、SQL 查询、脚本任务 | 定时 ETL、审批流、批处理 | 复杂编排、需要 code review 的流程 | 内部工具、运营后台 |

### 关系图

```text
Script（最小执行单元）
   │  被引用 / 内联
   ▼
Flow（可视化 DAG 编排） ── 也可被 App 调用
   │
   ├── 定时 / Webhook / API / 其他 Flow 触发
   │
   └── 另一种编排方式：Workflows as Code（在 Script 内用 workflow()/task()）

App（UI 层）── 调用 Script 或 Flow
```

## 和 Workflows as Code 的关系

两者都是「编排」，区别在表达方式：

- **可视化 Flow**：编排逻辑存在 Flow 定义里（JSON/YAML，OpenFlow 格式），适合review 流程、让非开发同学看懂、快速接审批和分支。
- **Workflows as Code**：编排逻辑就是 TS/Python 代码，适合复杂逻辑、复用函数、走 Git review；底层仍然是每个 task 一个 job，支持 checkpoint、并行、持久化 sleep 和审批。

详细对照与写法见 [05-workflows-as-code.md](./05-workflows-as-code.md)。

## 和 Script / App / Resource 的边界（点到为止）

- **Script**：Flow 的基石。Flow 的每个 action 步骤最终都指向一个 Script（workspace 里的、Hub 里的，或内联写的）。
- **App**：展示层。App 可以调用 Flow；Flow 的 auto-generated UI 也能直接当轻量工具用。App 不负责编排。
- **Resource / Variable**：配置与凭据。Flow 表达式里用 `resource(path)` / `variable(path)`，或通过 flow env variables 引用；不要把密钥硬编码进步骤输入。
- **Schedule / Trigger**：Flow 的入口，不是 Flow 本身。一个 Flow 有一个 primary schedule，也可以有多个 other schedules。

## 关键限制（先知道，少踩坑）

1. 只有 **deployed** 的 Flow 才有稳定的 Webhook、schedule 和对外 API；编辑器里测试的是 draft。
2. Flow 的结果默认是最后一步的结果；需要提前返回要显式配置 Early return。
3. `results.<id>` 只能引用**已经执行完成**的步骤；没跑过的步骤在表达式里取不到。
4. 大对象、非 JSON 数据不要硬塞进 `results`，用 Shared Directory 或对象存储。
5. 审批步骤不占 worker，但会占住这次 run；要给审批设置 timeout，避免永久挂起。

## 下一步

从 [01-flows-quickstart.md](./01-flows-quickstart.md) 开始，按「新建 → 配输入 → 加步骤 → 测试 → 部署 → 触发」走一遍。
