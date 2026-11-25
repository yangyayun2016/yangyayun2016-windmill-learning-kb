# Windmill 学习知识库

面向已经在使用 Windmill Cloud（[app.windmill.dev](https://app.windmill.dev)）的运营与开发者，整理 **Flow（可视化工作流）** 和 **Workflows as Code（用代码编排工作流）** 两套能力的学习笔记。

- 建议 GitHub 仓库名：`windmill-learning-kb`
- 中文名：Windmill 学习知识库
- 笔记基于 2026-11-20 抓取的官方文档整理；自托管架构一篇于 2026-11-24 核对。官方更新后请以原文为准。

## 这个知识库解决什么问题

1. 第一次创建 Flow 时，知道每一步在做什么、为什么做、容易踩什么坑。
2. 看得懂 Flow 编辑器里的步骤、输入、表达式和运行结果。
3. 能排错：分清是输入没传对、分支没命中、循环没退出，还是重试/超时/权限的问题。
4. 知道什么时候该用可视化 Flow，什么时候该用 Workflows as Code。
5. 能照着练习清单在 Cloud 上安全地动手，不碰生产 Flow。

## 怎么读

建议按顺序读前四篇，再按需跳转：

| 顺序 | 文件 | 内容 |
| --- | --- | --- |
| 1 | [00-overview.md](./00-overview.md) | Flow 是什么、和 Script / App / Workflows as Code 的边界 |
| 2 | [01-flows-quickstart.md](./01-flows-quickstart.md) | 从新建到跑通一条 Flow 的完整路径 |
| 3 | [02-flow-editor-and-steps.md](./02-flow-editor-and-steps.md) | 编辑器、步骤类型、步骤之间如何传数据 |
| 4 | [03-expressions-and-results.md](./03-expressions-and-results.md) | `flow_input`、`results`、表达式求值与易错点 |
| 5 | [04-control-error-schedule.md](./04-control-error-schedule.md) | 分支、循环、错误处理、重试、调度 |
| 6 | [05-workflows-as-code.md](./05-workflows-as-code.md) | 用 TypeScript / Python 写工作流，以及与可视化 Flow 的对照 |
| 7 | [06-cheatsheet.md](./06-cheatsheet.md) | 一页速查：概念、命令、路径、链接 |
| 8 | [07-practice-checklist.md](./07-practice-checklist.md) | 由浅入深的动手练习清单 |
| 9 | [08-self-host-architecture.md](./08-self-host-architecture.md) | 自托管实例的必需组件与可选组件 |
| — | [BOT.md](./BOT.md) | 「Windmill Flow 快速学习 Bot」的人设与使用说明 |
| — | [SOURCE_MAP.md](./SOURCE_MAP.md) | 每篇笔记对应的官方文档 URL |
| — | [tianji-ai-amazon-product-dev/README.md](./tianji-ai-amazon-product-dev/README.md) | 实战：天机 AI 亚马逊产品开发 Flow（v186181）的架构、14 步、排错与可导入资产 |

## 官方入口

- Flow 快速入门：<https://www.windmill.dev/docs/getting_started/flows_quickstart>
- Workflows as Code：<https://www.windmill.dev/docs/core_concepts/workflows_as_code>
- Flow 编辑器：<https://www.windmill.dev/docs/flows/flow_editor>
- 调度：<https://www.windmill.dev/docs/core_concepts/scheduling>
- OpenFlow 规范：<https://www.windmill.dev/docs/openflow>
- 自托管架构：<https://www.windmill.dev/docs/advanced/self_host#architecture>
- Windmill Hub（可 fork 的 Flow / Script 示例）：<https://hub.windmill.dev>

## 阅读约定

- 中文为主，保留 Flow、Script、Workflows as Code、`flow_input`、`results` 等英文专有名词。
- 官方明确写到的内容，正文给出对应链接；官方没写清的地方会标注「官方此处未写明」，不做推断式补全。
- 示例中的路径（如 `u/your_name/...`、`f/team/...`）都是占位符，请换成你自己的 workspace 路径。
- 本仓库不包含任何 API key、token、账号密码，也不要求你修改已有的生产 Flow。
- 与本仓库同级的 `sources/` 只放抓取到的官方原文，供核对使用；知识库正文为原创整理。官方文档版权归 Windmill Labs。

## 实战专题：天机 AI 亚马逊产品开发

[tianji-ai-amazon-product-dev/](./tianji-ai-amazon-product-dev/README.md) 记录一条已经在 Windmill Cloud（workspace `tianjikuajing-yayun`）跑通的 Flow：`u/tianjikuajingyayun/amazon_product_development`，部署版本 `v186181`。

它用两个 TypeScript 步骤采集并对齐 SIF 销量、卖家精灵销售额和 Keepa 口径 coupon，再用 12 个 DeepSeek AI Agent 走完从市场概览到试销复盘。实证输入是 `dog mats` / `US` / `moq=1000` / `target_margin_pct=30` / `target_price=15` / `top_n=10` / `with_coupon=true`。目录里有 OpenFlow、脚本、提示词、排错记录（`v180115` 到 `v186181`）和跑通截图。

这是工作室的实战笔记，不是官方文档的改写。导入前阅读复现指南，把 `u/tianjikuajingyayun/...` 换成你自己的路径；密钥只放在 Resource 里。

## 适合谁

- 已经能用 Windmill 跑单个 Script，想把多个步骤串起来的开发者。
- 需要做定时任务、审批流、批处理、ETL 的运营/数据同学。
- 想从可视化 Flow 过渡到 Workflows as Code，或反过来做技术选型的团队。
