# personaX 业务 Agent 架构收敛纪要

本文记录本轮讨论从“多 agent / skill / 记忆”逐步收敛到“分层上下文边界 Agent”的过程，供后续找其他人审计。

## 1. 初始问题

当前已有一个多 agent 编排平台，用在量化研究中。但如果迁移到大厂服务端工作场景，会遇到两个核心问题：

1. 真实后端工作里，很多任务不天然需要多 agent。单 agent 加工具调用已经能做不少事情。
2. 如果只做单 agent 或工具封装，容易被 Claude Code、Codex 等通用 coding agent 的模型和产品迭代吃掉。

因此，不能把产品定位在“多 agent 编排平台”本身。agent 数量不是价值来源。

## 2. 被否定的方向

### 2.1 不是一堆独立 AI 员工

曾讨论过把系统包装成多个 AI 工程员工，例如 CI 工程师、排障工程师、发布工程师等。

这个方向被否定的原因是：真实后端开发不是一个个孤立岗位任务。一个后端通常同时承担需求开发、问题排查、配置理解、上线、治理、迁移、沟通等工作。把它机械拆成多个“岗位 agent”，会丢掉真实业务连续性。

### 2.2 不是 MCP 接入加 skill 流程

公司内部很多场景已经有 MCP 或类似工具能力，问题不是“能不能接工具”。

skill 也不是核心价值。排障 skill、发布 skill、代码修改 skill 只是流程骨架。如果没有业务背景、代码背景、历史经验和系统约束，skill 只是外行拿着工具按流程乱查。

### 2.3 不是把所有记忆塞给一个超级 Agent

如果设计成一个长期在线、什么都知道、所有业务和技术上下文都塞进去的主 agent，也不可行。

原因：

- 上下文窗口有限。
- cache 过期后重新拉起成本高。
- 长期记忆过多会污染召回。
- 一个 agent 同时承载所有业务域和技术域会变得不稳定。
- 历史任务、当前任务、长期知识混在一起，难以追溯和更新。

## 3. 第一轮收敛：业务主 Agent

真实后端工作的核心不是“多个流程”，而是“一个长期负责业务的人”。

因此第一轮收敛到：

```text
业务主 Agent
  - 持有长期业务逻辑记忆
  - 理解业务链路、代码结构、系统约束、团队经验
  - 负责当前任务判断、串联和最终交付

临时子 Agent / Worker
  - 不持有完整长期记忆
  - 只做局部调查或执行
  - 例如查日志、读某段代码、查配置、跑测试
  - 返回结构化证据
```

多 agent 的价值不是“多个专家角色”，而是主 Agent 上下文有限时，临时派出局部执行线程。

子 Agent 不应该替主 Agent 做业务结论。最终判断仍由主 Agent 结合业务逻辑和证据完成。

## 4. 第二轮收敛：记忆外置，任务装载工作集

业务主 Agent 不能真的拥有无限记忆。

因此进一步收敛到：

```text
主 Agent = 当前任务目标 + 小型业务上下文 + 外部记忆查询能力 + 调度能力
```

长期业务记忆需要外置。主 Agent 每次任务只装载相关工作集，而不是加载所有历史。

分层如下：

```text
L0 当前任务上下文
  - 用户问题
  - 当前 run state
  - 已确认事实
  - 当前假设

L1 任务业务 capsule
  - 当前任务相关的短业务摘要
  - 由长期记忆动态编译

L2 结构化长期业务记忆
  - 业务概念
  - 核心链路
  - 服务关系
  - 状态机
  - 配置规则
  - 历史问题
  - 团队决策

L3 原始证据
  - 代码
  - 日志
  - 配置
  - 文档
  - PR
  - 事故复盘
  - MCP 查询结果
```

结论：主 Agent 不记住一切，而是按任务装载正确的小上下文。

## 5. 第三轮收敛：版本化业务 Base 与任务 Fork

为降低每次重新理解业务的成本，提出预先准备多个 base，也就是已经注入并消化过的业务上下文。

最终收敛为：

```text
Versioned Business Base
  - 稳定业务知识快照
  - 可复用
  - 版本化
  - 不原地修改

Forked Task Session
  - 从某个 base fork
  - 叠加当前任务 delta
  - 保存当前 run state
```

任务实际上下文是：

```text
Base Context
+ Delta Overlay
+ Run State
```

Base 放稳定地图，不放临时脚印。

适合进入 base 的内容：

- 业务概念
- 核心链路
- 服务边界
- 状态机
- 关键字段语义
- 代码模块地图
- 重要配置含义
- 历史高频问题
- 团队确认约束

不适合进入 base 的内容：

- 当前日志
- 当前告警
- 一次性排查猜测
- 未验证结论
- 临时 patch 过程

Base 必须版本化：

```text
payment-base@v12
payment-base@v13
payment-base@v14
```

每个任务记录：

```text
base_id
base_version
base_fingerprint
forked_at
```

Base 更新不应原地修改，而应通过：

```text
任务结束
  -> 提炼可沉淀信息
  -> 生成 base patch proposal
  -> 验证 / 人工确认
  -> 创建新 base version
```

这样可以避免错误结论污染长期业务底座，也可以让历史任务可追溯。

## 6. 第四轮收敛：按上下文边界拆 Agent

进一步讨论发现，agent 拆分不应该按流程步骤拆，而应该按 context boundary 拆。

错误拆法：

```text
查日志 Agent
  -> 把大量日志丢给代码 Agent
  -> 代码 Agent 再把大量代码丢给总结 Agent
  -> 最后再丢给主 Agent
```

这种方式会重复占用上下文，并且跨 agent 传递大量无结构信息。

正确原则：

```text
谁拥有某类长期上下文，谁就在本地展开它。
跨 Agent 只传结构化结论和证据引用，不传大块上下文。
```

因此可以有领域 Agent：

```text
Log Domain Agent
  - 日志平台知识
  - 查询语法
  - trace 关联方法
  - 常见日志模式

Config Domain Agent
  - 配置中心知识
  - 灰度规则
  - 生效机制
  - 历史配置坑

Codebase Domain Agent
  - 某代码库结构
  - 模块边界
  - 状态机
  - 关键约束
```

跨 agent 通信应该是窄接口：

```json
{
  "claim": "payment-callback-service 在 14:03 收到渠道成功回调",
  "confidence": 0.93,
  "evidence_refs": [
    "log://trace_id=abc/span=callback/ts=14:03:21"
  ],
  "relevant_excerpt": "短摘录",
  "open_questions": [
    "未确认 order-core 是否消费该事件"
  ]
}
```

不要把原始日志、完整代码、大段上下文复制给下一个 agent。

## 7. 第五轮收敛：业务域也需要多个主业务 Agent

进一步发现，“一个业务主 Agent”仍然可能过大。大厂后端业务往往有多个业务域，例如订单、支付、风控、履约、用户、营销。

不同业务域本身就是上下文边界。

因此最终收敛为分层结构：

```text
Global Lead Agent
  - 当前任务总负责人
  - 路由、拆解、冲突协调、最终交付
  - 不持有所有业务细节

Business Domain Agents
  - 各自持有一个业务域 base
  - 例如订单、支付、风控、履约、用户、营销
  - 负责本业务域内的语义判断

Technical Domain Agents
  - 持有技术域 base
  - 例如日志、配置、发布、CI、监控、代码库
  - 负责技术证据获取和解释

Worker Agents
  - 短生命周期
  - 无长期记忆
  - 执行一次性工具调用、检索、命令
```

Global Lead 不是超级业务专家，而是任务协调器、领域路由器、结论合成器。

重上下文留在各领域 Agent 内部。

## 8. 最终模型

最终收敛到：

```text
Hierarchical Context-Bounded Agents
分层上下文边界 Agent
```

核心结构：

```text
Global Lead Agent
  -> Business Domain Agent(s)
      -> Technical Domain Agent(s)
          -> Worker Agent(s)
```

核心原则：

1. 外层 Global Lead 负责当前任务最终交付，但不持有所有业务和技术细节。
2. 业务域 Agent 持有各自业务 base，例如支付、订单、风控。
3. 技术域 Agent 持有各自技术 base，例如日志、配置、发布、代码库。
4. Worker 只做一次性执行，不持有长期记忆。
5. Agent 拆分基于上下文边界，而不是流程步骤。
6. 跨 Agent 不传大块上下文，只传 claim、evidence ref、confidence、open question。
7. Base 版本化、可 fork、可追溯，不原地修改。
8. 当前任务上下文由 Base Context + Delta Overlay + Run State 组成。
9. 当前证据优先于 base。base 是业务地图，不是事实最终来源。

## 9. 一个典型任务流

以“支付成功但订单未完成”为例：

```text
1. Global Lead 接收问题。

2. Global Lead 判断可能涉及 payment + order，也可能涉及 fulfillment。

3. Global Lead fork 当前任务 run state。

4. Payment Domain Agent fork payment-base@v12。
   回答：支付域是否认为该 payment_id 已业务成功？

5. Order Domain Agent fork order-base@v8。
   回答：订单完成需要哪些条件？当前为什么没完成？

6. Log Domain Agent fork log-base@v5。
   查证：回调是否收到、事件是否发出、trace 是否完整。

7. Config Domain Agent fork config-base@v3。
   查证：是否有灰度、开关、配置变更影响链路。

8. 各 Agent 返回结构化 claim 和 evidence refs。

9. Global Lead 综合：
   - 支付域确认支付成功。
   - 订单域确认未收到或未消费支付成功事件。
   - 日志证据显示回调收到但订单消费失败。
   - 配置证据显示某灰度开关影响消费链路。

10. Global Lead 输出最终结论、证据链、风险和下一步动作。
```

## 10. 仍需审计的问题

后续需要重点审计以下问题：

1. Global Lead 的上下文应该有多小，最小必需信息是什么？
2. Business Domain Agent 的 base 应如何划分，按业务域、服务、代码库还是链路？
3. Technical Domain Agent 和 Business Domain Agent 的边界如何定义？
4. Base 如何自动判断过期？
5. Base patch proposal 如何验证，哪些更新必须人工确认？
6. 跨 Agent 的 claim schema 是否足够表达不确定性和证据链？
7. 多个业务域 Agent 给出冲突结论时，Global Lead 如何仲裁？
8. 哪些信息可以进入长期 base，哪些只能留在 run state？
9. 如何避免 base 变成过期但权威的错误上下文？
10. 如何评估这个架构相对单 agent、普通 RAG、普通 skill 编排的真实收益？

## 11. 当前一句话定位

personaX 不是一个多 agent 编排平台，也不是简单的记忆加 skill。

它更接近：

> 一个以 Global Lead 为任务入口、以版本化业务/技术 Base 为长期上下文底座、以领域 Agent 持有上下文边界、以 Worker Agent 做局部执行的后端 AI 协作系统。

更短：

> 分层上下文边界 Agent：业务和技术上下文留在各自领域内，任务由外层 Lead 协调，跨边界只传结构化结论和证据引用。
