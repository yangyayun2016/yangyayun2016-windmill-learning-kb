# 03 · 从报错到跑通：6 次版本演进

当前导出是 **v186181**。下面 6 段是这条 Flow 从跑不起来到 100% Success 的真实顺序。每一段只写已经核对到的报错、根因和改动，不把「可能还有别的问题」补成事实。

最终行为以 [flow/amazon_product_development.v186181.flow.json](./flow/amazon_product_development.v186181.flow.json) 为准。更早的版本没有放进本仓库。

## 1. v180115 → v180116：provider 资源是空字符串

报错：

```text
ExecutionErr: SerdeJson: invalid type: string "", expected struct ProviderResource @ ai_executor.rs:916:20
```

出在 `s01_overview`。`provider.resource` 被存成了空字符串 `""`，worker 反序列化时期待的是一个 ProviderResource 结构。

修复：把 `s01_overview` 的 provider 显式绑到已经发布的 Resource `$res:u/你的用户名/ecstatic_deepseek`。v186181 里这一步的值是 `$res:u/tianjikuajingyayun/ecstatic_deepseek`，`kind` 为 `deepseek`，`model` 为 `deepseek-v4-pro`。

这一步只改了 `s01`。`s02`～`s12` 当时还没改，所以后面还有第 3 段。

## 2. v180116 → v180117：DeepSeek 不接受 json_schema

报错：DeepSeek API 400，`This response_format type is unavailable now`。

导出文件的 `schema.prompt_for_ai` 里还留着同一次 400 的中文正文（这是 Flow schema 上的 AI 提示残留，不是 14 个模块的输入）：

```text
此 response_format 类型目前不可用
```

调用的 URL 是 `https://api.deepseek.com/v1/chat/completions`。残留文本里的 `type` 为 `invalid_request_error`。

根因：Windmill AI Agent 在 `output_schema.properties` 非空时，会下发 `response_format.type = json_schema`。Windmill 的 `should_use_structured_output_tool` 只对 Claude 和 AWS Bedrock 生效，不包括 DeepSeek。DeepSeek 的 `response_format` 只支持 `text` 和 `json_object`。

修复：清空 12 个 AI 节点的 `output_schema`，结构改由 System Prompt 约束。v186181 里 12 步的 `output_schema` 都是 `null`，`output_type` 都是 `text`。

清空 schema 的副作用在第 5 段才爆出来：模型开始返回「中文说明 + Markdown JSON」，而不是一个纯 JSON 值。

## 3. v180117 → v180118：其余节点还指向不存在的资源

报错：

```text
Not found: Resource u/.../cohesive_deepseek
```

第 1 段只改了 `s01_overview`。`s02`～`s12` 仍指向一个没有发布的资源路径 `cohesive_deepseek`。

修复：把 `s02`～`s12` 统一改绑到已发布的 `ecstatic_deepseek`。v186181 里 12 个 AI 节点的 `provider.resource` 都是 `$res:u/tianjikuajingyayun/ecstatic_deepseek`。

## 4. 执行额度：免费 1000 被打满，之后是 10,000 / 月

这不是 Flow JSON 的版本差，它卡在配额上，和前后几次部署穿插发生。

早期免费额度触发：

```text
exceeded the free usage limit of 1000
```

升级、月度配额恢复之后，workspace 的 exec 额度是 **10,000 / 月**。这次完整跑通后，界面显示 **2,398 / 10,000**（见 [assets/20-flow-success.png](./assets/20-flow-success.png)）。

这次 Cloud 上核对到的口径：1 exec = 1 秒 compute，1 seat = 10,000 execs / 月，按自然月重置。`s02` 单步 6 分 19 秒，就已经是数百 exec。免费 1000 不够把 12 个 Agent 从头跑完。续跑复用上游结果，是额度恢复之后还能迭代后半段的原因。

## 5. v180118 → v186041：对中文 Markdown 做 JSON.parse

报错出在 `s03_benchmark`。QuickJS 表达式执行：

```js
JSON.parse(results.s02_segments.output)
```

异常是 `Unexpected token 基`。

根因接在第 2 段之后：`output_schema` 清空后，`s02_segments` 的 `output` 不再是纯 JSON，而是「中文说明 + Markdown JSON 代码块」。解析器读到中文（「基」）就停了。

修复：`s03` 以及它后面的步骤改为直接传递上游 `results.*.output` 原文，删掉 `JSON.parse`。v186181 的写法是把原文放进对象再 `JSON.stringify`，例如 `主攻细分: results.s02_segments.output`。脚本步骤 `validate` 仍读 `results.collect`，因为那是 TypeScript 返回的对象。

各步表达式见 [02-14-step-pipeline-reference.md](./02-14-step-pipeline-reference.md) 和 [04-prompts-catalog.md](./04-prompts-catalog.md)。

## 6. v186041 → v186181：thinking 模式的 reasoning_content 没有回传

报错出在 `s05_death_modes`。DeepSeek 返回 400：

```text
The reasoning_content in the thinking mode must be passed back to the API
```

根因在 Windmill Cloud 的后端 worker，不在提示词。`backend/windmill-worker/src/ai_executor.rs` 和 `windmill-ai` 的 `OpenAIMessage` 在 DeepSeek 多轮工具调用循环里，只把 `role` 和 `tool_calls` 推回去，没有把上一轮的 `reasoning_content` 序列化回传。

公开问题与修复对得上「前端修了、worker 没修」：

- Issue [#9192](https://github.com/windmill-labs/windmill/issues/9192)：DeepSeek V4 在 Chat 面板里，上一轮触发了工具调用之后，下一轮 400，原文就是 `The reasoning_content in the thinking mode must be passed back to the API`。issue 描述的是 Chat / Custom AI，复现步骤在 Chat 侧边栏。
- PR [#9208](https://github.com/windmill-labs/windmill/pull/9208) `fix: preserve ai reasoning content` 已合并。PR 说明写的是保留 copilot / chat 历史里的 `reasoning_content`，测试命令是 `npm run test:unit -- --run src/lib/components/copilot/lib.test.ts`。它没有覆盖 Flow AI Agent 的 worker 循环。

所以 `s05` 这种「AI Agent 模块 + MCP 工具 + thinking」仍会打到未修复的 worker 路径。

临时绕过：把 `s05`～`s12` 的 `reasoning_effort` 设为 `none`。这个值映射为 DeepSeek 的 `thinking: {type: "disabled"}`，请求不再进入必须回传 `reasoning_content` 的 thinking 模式。改完之后全流程跑通：续跑段 `s05`～`s12` 为 5 分 58 秒，状态 100% Success。

v186181 里实际留下的 `reasoning_effort` 是：

| 步骤 | 值 |
| --- | --- |
| `s01_overview` | `high` |
| `s02_segments`、`s03_benchmark`、`s04_attr_matrix` | 未设置 |
| `s05_death_modes`～`s12_review` | `none` |

## 风险提示与后续建议

这次跑通不等于 thinking 模式已经可用。

- `s01_overview` 仍是 `reasoning_effort: "high"`。它挂了卖家精灵和 SIF 两组工具，`max_iterations` 为 6。那次续跑复用了它的结果，没有在 `v186181` 上重跑这一步。
- `s02`～`s04` 仍是模型默认（导出 JSON 的 provider 上没有 `reasoning_effort` 字段）。它们在进入 `v186181` 之前的那次执行里碰巧通过了。
- **全量重跑时，只要模型开启 thinking，并且 `s01`～`s04` 里任意一个带工具的节点走进多轮工具调用，同一个 400 仍可能出现。** `s02` 单步就要 6 分 19 秒，失败点若落在它后面，前面的 exec 已经扣掉。
- `s06`、`s07`、`s09`、`s12` 没有工具，不存在「工具调用的下一轮」。它们被设成 `none`，是因为绕过按 `s05`～`s12` 整段施加，不是因为这四步自己复现过该 400。
- 彻底方案是等 Windmill 后端在 worker 的 DeepSeek 工具循环里补上 `reasoning_content` 回传。在那之前，所有会触发多轮工具调用的 DeepSeek 节点都应设为 `reasoning_effort: "none"`，包括现在仍是 `high` 或未设置的 `s01`～`s04`。

不要用「把 `output_schema` 填回去」来绕过这个 400。那会回到第 2 段的 `response_format` 400。这两件事是不同的接口约束。
