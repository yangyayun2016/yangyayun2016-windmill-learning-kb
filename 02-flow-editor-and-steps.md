# 02 · 编辑器、步骤类型与数据传递

官方编辑器文档：<https://www.windmill.dev/docs/flows/flow_editor>
编辑器组件：<https://www.windmill.dev/docs/flows/editor_components>
架构与数据交换：<https://www.windmill.dev/docs/flows/architecture>

## 1. 编辑器界面速览

Flow 编辑器大致分四块：

```text
┌──────────────────────────── Toolbar（测试 / 部署 / Diff / YAML）────────────────────────────┐
│                                                                                              │
│  Settings        │           画布（DAG）                    │        步骤面板              │
│  （Flow 级配置）  │   Action / Loop / Branch / Approval ...  │  代码 / 输入 / 测试 / 高级    │
│                  │                                          │                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Toolbar 上值得记住的按钮

| 按钮 | 用途 | 什么时候用 |
| --- | --- | --- |
| Summary | 快速改摘要 | 新建后立刻写清楚 |
| Path | 改路径与权限 | 放到团队 Folder |
| `⋮` → Deployment History | 看部署历史 | 回滚、对比 |
| `⋮` → Export | 导出 JSON / YAML | 备份、代码审查 |
| `⋮` → Edit in YAML | 直接编辑 Flow 定义 | 批量改 id、改 settings |
| Diff | 对比 draft 和最近部署版本 | 部署前 |
| Test flow | 用完整输入跑整条 Flow | 联调 |
| Test up to | 只跑到选中步骤 | 分段排错 |
| Deploy | 发布生产版本 | 上线 |
| Autosave indicator | 草稿自动保存状态 | 确认改动已落库 |

官方说明：draft 是用户级、自动保存的；只有 Deploy 后的版本才会对外提供 Webhook、schedule 和 API。

## 2. Settings 里都有什么

| 区域 | 关键项 | 说明 |
| --- | --- | --- |
| Metadata | Summary / Description / Path / 权限 | Path 由 owner（user 或 folder）和名字组成；Description 支持 Markdown |
| Advanced | Restrict the job token | 限制 Flow 内 job 通过 API 能做什么 |
| Schedule | Primary schedule | 一个 Flow 只有一个主调度，与 Flow 同路径 |
| Shared directory | 步骤共享 `./shared` | 大对象、非 JSON 数据的通道 |
| Worker group | Flow 级 worker group | 一旦设置，覆盖所有步骤自己的 worker group |
| Flow env variables | `flow_env.NAME` | Flow 级常量，支持 String / JSON / Resource |
| Flow Inputs | 输入 schema | 决定自动生成 UI 和外部调用参数 |

### Flow env variables 和 Flow Inputs 的区别

| | Flow Inputs | Flow env variables |
| --- | --- | --- |
| 谁会看到 | 运行 Flow 的人，在表单里填 | 只有编辑 Flow 的人看到 |
| 典型内容 | 业务参数：日期、渠道、数量 | 配置常量、共享凭据、固定资源引用 |
| 引用方式 | `flow_input.xxx` | `flow_env.XXX` 或 `flow_env["XXX"]` |
| 是否进自动 UI | 是 | 否 |

常见坑：把 token 放进 Flow Inputs，结果所有能运行的人都看得到。凭据应该放 Variable / Resource，再用 flow env variable 引用。

## 3. 五类「脚本角色」

官方 quickstart 把 Flow 里的脚本分成五类：

1. **Action**：普通步骤，默认类型，绝大多数逻辑都在这里。
2. **Trigger**：Trigger script，通常作为定时 Flow 的第一步，轮询外部数据源；没有新数据就提前结束（early exit）。
3. **Approval**：审批 / 挂起步骤，等人批准或拒绝后继续。
4. **Error handler**：Flow 级错误处理器，出错时执行。
5. **Preprocessor**：预处理脚本，只在通过 Webhook、HTTP route、邮件、Kafka 等外部触发时运行，用来把外部 payload 转成 Flow 参数。

### Preprocessor 补充

Preprocessor 不是画布上的普通步骤，而是 Flow 定义里的 `preprocessor_module`。它接收一个 `event` 参数，其中总有 `kind` 字段表示触发类型。它适合「同一个 Flow，UI 调用和 Webhook 调用需要不同参数结构」的场景。

官方页：<https://www.windmill.dev/docs/core_concepts/preprocessors>

常见坑：以为 Preprocessor 会在手动 Test flow 时也执行。官方明确它只在外部 trigger 调用时执行。

## 4. 步骤类型全表

| 步骤类型 | 作用 | 关键配置 | 官方页 |
| --- | --- | --- | --- |
| Action / Script | 执行一段脚本 | 内联 / workspace / Hub；输入映射 | [editor components](https://www.windmill.dev/docs/flows/editor_components) |
| Subflow | 调用 workspace 里另一条 Flow | 选 `Flow` 作为步骤类型；可展开查看内部步骤 | [flow editor](https://www.windmill.dev/docs/flows/flow_editor) |
| For loop | 遍历一个列表，每个元素跑一遍子流程 | iterator expression、skip failure、parallel、limit、squash | [flow loops](https://www.windmill.dev/docs/flows/flow_loops) |
| While loop | 条件/停止信号满足前反复执行 | early stop/break、max iterations、max duration | [while loops](https://www.windmill.dev/docs/flows/while_loops) |
| Branch one | 多个条件分支，走第一个为真的；否则走 default | predicate expression，按顺序求值 | [branches](https://www.windmill.dev/docs/flows/flow_branches) |
| Branch all | 所有分支都执行，默认并行 | skip failure、是否并行、并发上限 | [branches](https://www.windmill.dev/docs/flows/flow_branches) |
| Approval / Suspend | 挂起等待人工批准/拒绝 | required events、timeout、form、skin | [approval](https://www.windmill.dev/docs/flows/flow_approval) |
| Error handler | 捕获 Flow 错误并处理 | 入参是失败步骤的结果（含 `error`） | [error handler](https://www.windmill.dev/docs/flows/flow_error_handler) |
| Trigger script | 轮询外部数据，返回新条目 | 配合 schedule + state | [trigger scripts](https://www.windmill.dev/docs/flows/flow_trigger) |
| AI decision | 让决策模型做分类/打分/是判断 | provider、state、questions | [AI decision](https://www.windmill.dev/docs/flows/ai_decision) |

> 说明：AI Flow Chat 是「用自然语言让 AI 帮你搭 Flow」的编辑器功能；Flow as chat 是把已完成的 Flow 变成聊天运行时。两者都不是步骤类型，别混用。

## 5. 数据如何在步骤间传递

### 5.1 默认：input transform

每个步骤的每个参数都可以是一个 JavaScript 表达式，输入来源包括：

- `flow_input`：Flow 的输入对象。
- `results.<step_id>`：任意已完成步骤的结果（不只是上一步）。
- `resource(path)`、`variable(path)`：按路径取 Resource / Variable。
- `flow_env.<NAME>`：Flow 级常量。

官方把这套机制叫 input transform，它让 Flow 成为 DAG 而不是简单线性序列。

### 5.2 编辑器里的三种输入模式

| 模式 | 写法 | 例子 | 适合 |
| --- | --- | --- | --- |
| Static | 直接写值 | `42`、`"hello"` | 固定常量 |
| Templatable string | 用 `${...}` 插值 | `"order-${flow_input.id}"` | 拼字符串 |
| Dynamic | 直接写 JS 表达式 | `results.fetch.items.slice(0, 5)` | 取对象、过滤、计算 |

编辑器还支持 Append / Connect 两种插入方式：Append 在光标处追加，Connect 替换当前值。

### 5.3 结果对象长什么样

步骤的结果就是脚本 `main()` 的返回值，会被序列化成 JSON。例如脚本返回：

```json
{ "items": [{ "id": 1 }, { "id": 2 }], "count": 2 }
```

后续步骤可以写：

```js
results.fetch_orders.items.map((x) => x.id)
```

注意：

- `results.<id>` 是「该步骤的完整返回对象」，不是只返回最后一个字段。
- 如果步骤返回 `null` 或没有返回值，表达式里就是 `null` / `undefined`，需要自己兜底。
- 失败步骤的 result 里会有 `error` 字段；error handler 就是靠这个字段拿到错误。

### 5.4 Shared Directory

当数据不适合 JSON（大文件、二进制、DataFrame 落盘）时，让步骤把文件写到 `./shared`，下一步从同一路径读。

官方明确的三条限制：

- 所有步骤都在**同一个 worker** 上执行；
- 数据严格来说只在**单次 Flow 执行内**有效，不是持久存储；
- 内容**不会跨 suspend / sleep 保留**。

所以它适合「一次 ETL 内传大文件」，不适合「跨天传状态」；跨步骤的小状态用 custom flow state，长期数据用对象存储 / 数据库。

官方页：<https://www.windmill.dev/docs/core_concepts/persistent_storage>

### 5.5 Custom flow state（逃生通道）

如果既不想走 result，也不想污染 workspace 的 Resource，可以用 Flow 级状态：

```ts
import * as wmill from "windmill-client"

await wmill.setFlowUserState("FOO", 42)
const v = await wmill.getFlowUserState("FOO")
```

```python
import wmill

wmill.set_flow_user_state("foobar", 43)
v = wmill.get_flow_user_state("foobar")
```

它的生命周期和这次 Flow job 一样，适合在步骤间传「不好走 JSON」的小状态。官方把它定位为 escape hatch，不要拿它当数据库。

## 6. 执行模型：谁先跑、谁等谁

- 每个步骤是独立 job，由 worker 领取执行。
- 顺序步骤一个接一个。
- Branch all 的多个分支会同时入队，可以被不同 worker 并行处理。
- 下游的 join 步骤会等所有依赖分支完成才入队。
- 所以并行分支的总耗时接近「最慢的那条分支」，而不是所有分支之和——前提是 worker 足够。

常见坑：以为 Branch all 一定并行。它默认并行，但可以配置成不并行；开了并行也可以用 `Limit concurrent branches` 限制并发数。

## 7. 组织复杂 Flow 的工具

| 工具 | 用途 |
| --- | --- |
| Flow groups | 把相关节点框成一组，带颜色、可折叠、可写 Markdown 描述 |
| Subflow | 把一段流程抽成独立 Flow，主 Flow 里只留一个步骤 |
| Sticky notes | 画布上的自由注释、TODO |
| Node context menu | 右键复制、删除、移动、加 note |
| Multi-select | 框选/Shift 点选，批量移动、复制、删除 |

官方提示：如果手写 Flow YAML 里的 group / note，`wmill lint` 会报告编辑器画不出来或会渲染错误的节点。

## 8. 设计步骤的实用建议

1. **一个步骤只做一件事**：日志更好读，失败更容易重试。
2. **步骤 id 用语义名**：`fetch_orders` 比 `b` 好一百倍；改名后记得全局搜索表达式里的 `results.old_id`。
3. **输入只取需要的字段**：不要把整个上游 result 透传，减小 payload，也避免下游耦合。
4. **副作用步骤尽量靠后**：发消息、写库、扣款之前先完成校验和审批。
5. **给步骤设 timeout**：尤其是调外部 API 的步骤，避免一个挂起拖死整条 Flow。
6. **对可重入性有意识**：重试可能让同一步执行多次，写库要用幂等键或 upsert。

## 下一步

表达式和 `results` 的具体写法、引擎差异和排错，见 [03-expressions-and-results.md](./03-expressions-and-results.md)。
