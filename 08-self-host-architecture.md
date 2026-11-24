# 08 · 自托管架构

官方页（Architecture 一节）：<https://www.windmill.dev/docs/advanced/self_host#architecture>

本篇只整理这一节写明的组件，以及同一页开头对部署形态的那一句选择。Docker Compose 命令、Helm、云厂商配置都在该页后续章节，这里不展开。页末有一张标题为 “Windmill architecture” 的图，以页面原文为准。

## 一句话

自托管的 Windmill 本身只要三样东西：一台装着全部状态（含任务队列）的 Postgres，一组 server 模式的容器，一组 worker 模式的容器。Server 和 worker 不互相直连，两边都只连数据库。

## 三个必需组件

| 组件 | 官方写明的职责 |
| --- | --- |
| Postgres | 保存 Windmill 的全部状态，包括 job queue |
| Server 模式的 Windmill 容器 | 同时提供前端和 API。必须能连上数据库，并且是对外暴露、用来打开前端的那一层。可以复制多份做高可用。不需要直接和 worker 通信 |
| Worker 模式的 Windmill 容器 | 跑 job。必须能连上数据库，不和 server 通信。复制更多份是为了提高 job 吞吐 |

任务具体分给哪一个 worker，这一节没有展开，只指向 Worker groups：<https://www.windmill.dev/docs/core_concepts/worker_groups>。

## 三个可选组件

没有下面三项，上面三个必需组件仍然构成一套 Windmill。

| 组件 | 官方写明的职责 |
| --- | --- |
| Windmill LSP | 给 Monaco 网页编辑器提供智能提示。编辑器页：<https://www.windmill.dev/docs/code_editor> |
| Windmill Multiplayer | 实时协作。官方标明只在 Cloud 和 Enterprise 自托管提供。说明页：<https://www.windmill.dev/docs/core_concepts/multiplayer>，版本范围：<https://www.windmill.dev/pricing> |
| 反向代理 | 把 Windmill server、LSP、Multiplayer 收成一个对外端口。官方 Docker Compose 里用的是 Caddy |

## 六个组件一起用的时候

官方 Docker Compose 会把上面六个组件都拉起来。同一节建议：TLS 终结不要做在自带的 Caddy 里，放到它外面。

## 同一页开头的部署选择

Architecture 小节之前，这一页还写了三种摆法：

- 小规模：单机 Docker / Docker Compose。
- 更大、要上生产：用 Helm chart 部署到 Kubernetes。
- Worker 也可以不靠 Docker，直接跑在 Windows 上。

安装步骤以该页后续章节为准，本篇不抄命令。

## 读这一节时容易混的地方

- Server 多副本的目的是高可用；worker 多副本的目的是提高 job 吞吐。官方把这两件事分开写了。
- 「Server 和 worker 不直接通信」不等于它们各干各的。队列和全部状态都在 Postgres 里，协作发生在数据库上。
- LSP、Multiplayer、反向代理是可选的。反代解决的是「对外只开一个端口」，不是跑 job 的前提。
- Multiplayer 不是所有自托管都有，官方限定为 Cloud 和 Enterprise 自托管。
