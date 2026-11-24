# 03 · 表达式、flow_input 与 results

官方依据：

- 架构与 input transform：<https://www.windmill.dev/docs/flows/architecture>
- 编辑器输入模式：<https://www.windmill.dev/docs/flows/editor_components>
- Flow Inputs / 自动 UI：<https://www.windmill.dev/docs/core_concepts/auto_generated_uis>

## 1. 表达式在 Flow 里出现在哪

Flow 的表达式不是「一段可以随便写代码的地方」，而是嵌在几个固定位置：

| 位置 | 求值结果用来做什么 |
| --- | --- |
| 步骤的输入参数 | 生成该步骤的实际入参（input transform） |
| For loop 的 iterator | 决定遍历哪个列表 |
| Branch one 的 predicate | 决定走哪个分支 |
| While loop 的 break 条件 | 决定是否停止循环 |
| Early stop 的条件 | 决定是否在步骤后停止 Flow |
| 步骤的 sleep / retry 等配置 | 部分字段支持表达式 |

这些表达式都由 Windmill 的 JavaScript 引擎求值。官方把它们统称为 input transform / flow expressions。

## 2. 表达式里能拿到什么

官方架构页明确列出的四个来源：

| 变量 | 含义 | 例子 |
| --- | --- | --- |
| `flow_input` | Flow 的输入对象 | `flow_input.customer_id` |
| `results` | 已完成步骤的结果集合，按步骤 id 取 | `results.fetch_orders.items` |
| `resource(path)` | 按路径取 Resource | `resource("u/me/slack")` |
| `variable(path)` | 按路径取 Variable | `variable("u/me/api_base")` |

另外，编辑器文档还定义了：

| 变量 | 含义 | 例子 |
| --- | --- | --- |
| `flow_env` | Flow 级常量 | `flow_env.REGION`、`flow_env["REGION"]` |
| `result` | **仅在某些单步条件表达式里**指当前步骤的结果，例如 Early stop | `result.status === "ok"` |

> 注意 `result` 和 `results` 不是一个东西：前者是当前步骤的返回值（在 Early stop 等场景），后者是所有已完成步骤的结果 map。

## 3. 输入模式：Static / Templatable / Dynamic

官方编辑器把步骤输入分成三种模式：

### Static

直接写值，运行时原样使用。

```text
42
"hello"
{"key": "value"}
```

### Templatable string

用 `${...}` 做字符串插值，可以和普通文本混写：

```text
order-${flow_input.order_id}-${results.fetch_customer.id}
```

### Dynamic

整个字段是一个 JS 表达式，返回值可以是对象、数组、数字、布尔值：

```js
results.fetch_orders.items
  .filter((o) => o.amount > 100)
  .map((o) => ({ id: o.id, amount: o.amount }))
```

常见坑：

- 在 Dynamic 模式里写 `"${flow_input.x}"`，结果得到一个字符串而不是原始类型。需要保持类型时直接写 `flow_input.x`。
- 在 Templatable 字符串里写复杂 JS（例如 `.map()`），不会被求值成数组，只会被拼进字符串。

## 4. `results.<id>` 的语义

### 4.1 它取的是「步骤的完整返回值」

假设步骤 `fetch_orders` 的脚本返回：

```json
{
  "items": [
    { "id": "A1", "amount": 120 },
    { "id": "A2", "amount": 30 }
  ],
  "count": 2
}
```

那么：

```js
results.fetch_orders.count          // 2
results.fetch_orders.items[0].id    // "A1"
results.fetch_orders.items.map((x) => x.id) // ["A1", "A2"]
```

### 4.2 只有执行完成的步骤才有结果

`results.<id>` 不是「提前声明」的，而是运行时逐步填充的。因此：

- 下游步骤引用上游步骤之前，上游必须已经跑过。
- 在编辑器里，只有测试过上游步骤，插头选择器才会给出它的字段建议。
- 分支没走到、循环没执行到、步骤被跳过时，对应的 result 可能不存在。

### 4.3 步骤 id 就是 key

步骤 id 默认是 `a`、`b`、`c`。改 id 后，所有 `results.old_id` 都要跟着改；Flow YAML 里改 id 时尤其容易漏。

### 4.4 循环和分支的结果结构

官方 Flow 文档没有为「for loop / branch 的 result 固定包含哪些字段」给出通用 schema；实际结构以运行结果面板为准。可以确定的是：

- 循环失败且达到上限时，错误名是 `LoopExhausted`，可以用 `results.<loop_id>.error?.name === 'LoopExhausted'` 判断（见 while loops 文档）。
- 失败步骤的 result 里有 `error` 字段，error handler 就是拿这个结果作为输入。

需要稳定消费循环结果时，建议在循环后面加一个普通 Script 步骤，把结果整理成你定义的 JSON 结构，而不是让下游依赖编辑器的内部结构。

## 5. `flow_input` 与输入 schema

Flow Inputs 决定两件事：

1. 运行时自动生成的表单（auto-generated UI）。
2. 外部调用（Webhook / API / CLI）期望的 JSON 结构。

字段可以配置类型（Integer / Number / String / Boolean / Array / Object / Any）、描述、默认值、占位符，以及每种类型的高级设置（min/max、枚举、格式、密码、资源类型等）。

常见坑：

- 输入名改了，表达式里还写旧名字，运行时就是 `undefined`。
- 输入类型是 String，但调用方传了数字，表达式里做 `===` 比较会失败。
- 把复杂对象塞进一个 String 字段，然后在表达式里 `JSON.parse`。更好的做法是直接用 Object 类型，或让上游步骤返回结构化结果。

## 6. `resource()` 与 `variable()`

官方架构页把它们列为 input transform 的合法来源。典型用法：

```js
resource("u/team/slack").token
variable("u/team/api_base_url")
```

注意：

- 路径要写完整（`u/...`、`g/...`、`f/...`），不要只写名字。
- 不要把 `resource()` / `variable()` 的结果整段打印到日志，尤其是含密钥的 Resource。
- 需要隐藏的常量也可以放到 flow env variable（类型选 Resource 或 String 并关联 workspace variable），避免暴露在 Flow Inputs 里。

## 7. 求值引擎：QuickJS 还是 Deno

官方架构页写明有两个引擎：

| 引擎 | 默认环境 | 特点 |
| --- | --- | --- |
| QuickJS | Community Edition 默认 | 启动快（官方称简单表达式 8–16x），`resource()` / `variable()` 懒加载 |
| Deno（V8） | Enterprise Edition 默认 | 兼容性更广的完整 V8 |

切换方式（自托管）：

- CE 想用 Deno：设置 `USE_DENO_FOR_FLOW_EVAL`。
- EE 想用 QuickJS：设置 `USE_QUICKJS_FOR_FLOW_EVAL`。

### 这对写表达式意味着什么

官方只说表达式使用「标准库的受限子集」加上 `flow_input`、`results`、`resource()`、`variable()` 等函数。**没有承诺**支持完整的 Node API、`fetch`、文件系统或 `async/await`。

实践建议：

- 表达式只做「取值、过滤、映射、比较、拼字符串」这类纯计算。
- 需要网络请求、读写文件、复杂依赖时，写成一个 Script 步骤，把结果传给下一步。
- 如果表达式在 CE 能跑、在 EE 报错（或反过来），先怀疑引擎差异；用最朴素的 JS 写法通常最稳。

## 8. 常见报错与排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `Cannot read properties of undefined (reading 'x')` | 上游 result 是 `undefined`，或字段名错 | 先跑上游；用可选链 `results.a?.x`；在结果面板确认字段 |
| `results.xxx is undefined` | 步骤 id 写错；步骤还没执行；分支没走到 | 检查 id；用 Test up to 跑到该步骤；给默认值 |
| 分支总是走 default | 谓词类型不匹配；字段路径错；大小写/空格 | 在 Test 结果里看实际值；用 `String(x) === "..."` 或 `Number(x) === 1` 明确类型 |
| 循环不执行 | iterator 不是数组；表达式返回 `null` | 用 `Array.isArray(x) ? x : []` 兜底 |
| 循环不退出 | break 条件永远为 false；while 没有 limit | 设 `Limit iterations` / `Limit duration`；检查 break 表达式 |
| 模板字符串拼出了 `[object Object]` | 把对象插进字符串 | 用 `JSON.stringify(obj)`，或只取需要的字段 |
| 大对象导致运行很慢 | 把整个 result 透传 | 只取字段；大文件走 Shared Directory |

### 调试顺序

1. 在 Flow 运行结果面板点开上游步骤，确认它到底返回了什么。
2. 用 **Test this step** 单独测当前步骤，手动填入和上游一致的值。
3. 把表达式拆短：先 `results.a`，再 `results.a.items`，最后 `results.a.items[0]`。
4. 用 `Test up to` 排除下游干扰。
5. 确认 draft 和 deployed 的差异（Diff）。

## 9. 表达式速查

```js
// 取 Flow 输入
flow_input.date

// 取上游结果
results.fetch_orders.items

// 可选链 + 默认值
results.fetch_orders?.items ?? []

// 过滤 + 映射
results.fetch_orders.items
  .filter((o) => o.status === "paid")
  .map((o) => o.id)

// 数字/字符串转换
Number(flow_input.limit)
String(results.a.id)

// 条件
results.check.ok ? "yes" : "no"

// 资源与变量
resource("u/team/slack").token
variable("u/team/api_base_url")

// Flow 级常量
flow_env.REGION
```

> 说明：以上是通用 JavaScript 写法，不是 Windmill 专有 API。Windmill 专有的是 `flow_input`、`results`、`resource()`、`variable()`、`flow_env` 这几个注入变量。

## 10. 一条原则

**能在 Script 里清楚表达的，不要硬塞进表达式。** 表达式适合「接线」，不适合承载业务逻辑。接线越短，排错越快。
