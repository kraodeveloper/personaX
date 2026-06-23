# personaX

**分层上下文边界 Agent 系统** —— 面向多业务域的企业级 AI Agent 管理与编排平台。

[![TypeScript](https://img.shields.io/badge/TypeScript-全栈-3178c6)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-f69220)](https://pnpm.io/)

---

## 简介

personaX 将 AI Agent 组织为多层结构：**Global Lead → Business/Technical Domain Agent → Worker**。跨层边界只传结构化 Claim（含 agentId / confidence / evidence_refs），不共享原始上下文。系统自研两项核心能力：

- **版本化知识库 Base**：不可变版本 + 内容寻址，LLM 只 propose 修改，通过 patch → governance 闭环才能切版本；
- **治理闭环**：Run 结束后沉淀 BasePatch，确定性状态机流转（pending → reviewing → accepted/rejected），接受后自动切换 activeVersion。

---

## 接入方式

| 方式 | 状态 | 说明 |
|---|---|---|
| **CC 官方（订阅 OAuth）** | ✅ 已实现 | `claude setup-token` 生成 `CLAUDE_CODE_OAUTH_TOKEN`，成本为名义值不计费 |
| **CC API（API Key + 自定义中转 base URL）** | ✅ 已实现 | `ANTHROPIC_API_KEY` + 可选 `ANTHROPIC_BASE_URL`，per-connection 注入 |
| **ACP 协议** | 🔲 规划中 | — |
| **纯 API 无 Agent 壳子** | 🔲 规划中 | — |
| **Codex SDK** | 🔲 规划中 | — |

连接以 **Connection** 对象管理，支持 per-agent 绑定或全局默认，API Key 只存变量名引用，不回传明文。

---

## 已实现能力

### Agent 管理
- **Agent 注册表 CRUD**：支持分组、选模型（per-agent 优先于全局默认）、选连接；角色类型 `lead / business_domain / technical_domain / worker`
- **连接管理**：订阅与 API 中转两种 Connection 类型，per-agent 或默认，按调用注入环境变量

### 知识库（Base）
- **版本化 Base**：不可变版本 + 内容寻址（fingerprint）+ activeVersion 指针；base 不原地修改
- **Skill / MCP 管理**：技能与 MCP 工具注册，绑定 Agent

### 运行时
- **RunManager + runAgent**：多 Agent 编排，in-process MCP（orchestration / claim-sink）
- **canUseTool 闸门**：基于 `options.canUseTool` 回调强制能力边界，`disallowedTools` + `strictMcpConfig` 双重约束
- **预算与防环保护**：最大轮次 / 花费上限，防止递归循环
- **SSE 流式输出**：增量消息实时推送至前端
- **Mock 模式**：无任何 Key 时走脚本化多 Agent 轨迹演示，秒回

### 治理闭环
- **Run → BasePatch → PatchReview**：Run 收尾沉淀 patch，确定性 policy 流转，接受后切版本

### 对话与记忆
- **1V1 对话**：每轮全历史重发 + 实时持久化 + SSE 流式；per-agent 独立会话
- **per-agent Memory**：可编辑笔记 + 自动注入系统提示；可提升为 Knowledge Patch（规划中）

### 可观测性
- **用量与 Context 占比显示**：实时 token 消耗
- **Settings 成本曲线**：手写 SVG，分 Agent 展示历史费用趋势

### 集成
- **飞书壳子**：webhook 接收 + challenge 回显 + 事件 → Agent Run → stub 回帖；鉴权与真实消息发送规划中

### 其他
- **Team 侧边栏**：占位（功能规划中）
- **模型目录**：实时拉取 `/v1/models`

---

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript（全栈） |
| 包管理 | pnpm monorepo（`packages/*`） |
| 前端 | React 18 + Vite + Tailwind CSS 3 + zustand + framer-motion |
| 后端 | Fastify 5 + better-sqlite3 + @anthropic-ai/claude-agent-sdk |
| 契约 | zod 4 共享 schema（`packages/contracts`） |
| 通信 | REST + SSE 流式 |
| UI 风格 | agentX 浅色风（金色 `#c9a227` 主色调，Inter 字体） |

---

## 目录结构

```
personaX/
├── packages/
│   ├── contracts/          # zod 共享契约（agent / run / chat / base / claim / patch 等 12+ schema）
│   ├── server/             # Fastify 后端
│   │   ├── src/api/        # REST 路由（agents / bases / runs / chats / memory / feishu / connections 等）
│   │   ├── src/runtime/    # RunManager / RunContext / mock / chat
│   │   └── src/sdk/        # runAgent / canUseTool / mcp / env 注入
│   └── web/                # React + Vite 前端
│       └── src/pages/      # AgentsPage / KnowledgePage / SkillsPage / McpPage / RunPage / SettingsPage
└── docs/                   # 设计文档（见下方）
```

---

## 快速开始

### 前置条件

- Node.js ≥ 20
- pnpm（推荐 `corepack enable && corepack prepare pnpm@latest --activate`，或 `npm i -g pnpm`）

### 安装依赖

```bash
pnpm install
```

### 认证配置（二选一）

在 `packages/server/.env` 中配置（参考 `packages/server/.env.example`）：

**方式一：Claude 订阅 OAuth**
```env
CLAUDE_CODE_OAUTH_TOKEN=<claude setup-token 生成的 token>
```
> 成本显示为名义值，不实际计费。

**方式二：Anthropic API Key**
```env
ANTHROPIC_API_KEY=<你的 API Key>
# 可选：自定义中转地址
# ANTHROPIC_BASE_URL=https://your-relay.example.com
```

> **两者都不配置时，系统自动进入 Mock 演示模式**，运行脚本化多 Agent 轨迹，无需任何 Key。

**强制指定模式（可选）**
```env
PERSONAX_RUNTIME=real   # 强制真实模式
# PERSONAX_RUNTIME=mock # 强制 mock 模式
```

### 启动服务

```bash
# 后端（监听 :8787）
pnpm dev:server

# 前端（监听 :5173，/api 自动代理到 :8787）
pnpm dev:web
```

浏览器访问 `http://localhost:5173`。

### 运行说明

| 模式 | 行为 |
|---|---|
| **真实模式**（订阅或 API Key） | 调用 Claude LLM，有网络延迟；订阅模式下成本为名义值 |
| **Mock 模式** | 无 LLM 调用，秒回脚本化多 Agent 演示轨迹 |

---

## 截图

> 截图见 `docs/screenshots/`

![Agent 管理界面](docs/screenshots/agents.png)

![运行轨迹界面](docs/screenshots/run.png)

![Settings 与成本曲线](docs/screenshots/settings.png)

---

## 路线图 / 开放项

以下能力尚在规划或开发中：

- [ ] **动态 capsule 编译**：Base 知识注入策略（FTS 检索 / 标签过滤 / 预算感知）
- [ ] **patch 自动接受 policy**：基于 confidence 阈值的自动化治理
- [ ] **多域 Claim 冲突仲裁**：Business Domain Agent 之间的 Claim 合并策略
- [ ] **Base 过期检测**：检测 base 版本是否与当前证据偏差过大
- [ ] **Run 历史与断点重连**：历史 Run 列表、中断恢复
- [ ] **真实业务 Base 与 MCP 接入**：对接实际企业知识源与工具
- [ ] **ACP 协议接入**
- [ ] **Codex SDK 接入**
- [ ] **纯 API 无 Agent 壳子**
- [ ] **飞书鉴权与真实消息发送**
- [ ] **Memory 提升为 Knowledge Patch**
- [ ] **Team 协作功能**

---

## 设计文档

| 文档 | 内容 |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | 分层上下文边界 Agent 架构设计 |
| [`docs/tech-spec.md`](docs/tech-spec.md) | 技术设计规范 v2（模块、接口、约束） |
| [`docs/business-agent-convergence.md`](docs/business-agent-convergence.md) | 业务 Agent 架构收敛纪要 |
| [`docs/next-tasks.md`](docs/next-tasks.md) | 已建功能清单与近期路线图 |
| [`docs/agent-sdk-api.md`](docs/agent-sdk-api.md) | Claude Agent SDK 接口参考 |
| [`docs/api-relay-research.md`](docs/api-relay-research.md) | API 中转与连接管理设计 |
| [`docs/agentx-design.md`](docs/agentx-design.md) | UI 设计规范（色彩、组件、动效） |
