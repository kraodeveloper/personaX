# personaX 技术设计

本篇是 personaX 的**技术实现文档**,落地 [architecture.md](architecture.md) 定义的分层上下文边界 agent 系统。规定技术栈、仓库结构、数据模型、存储、SDK 集成、skill/MCP 管理、服务与前端。

> v2:整合实现级评审修正(权限边界语义、Claim 协议强化、动态注入默认、递归预算保护、版本状态一致性)。SDK API 依据 [code.claude.com/docs/en/agent-sdk](https://code.claude.com/docs/en/agent-sdk/typescript) 核对;少数标 ⚠️ 处随版本核对。

---

## 0. 关键技术约束

1. **全栈 TypeScript,pnpm monorepo。** 前后端共享 zod schema/类型(Claim、agent 定义、base)。
2. **所有 agent(Lead / Domain / Worker)均由 server 用 Claude Agent SDK 显式实例化为独立 `query()` 会话;不使用 SDK 原生 subagent。** agent 间调用由 server 的 router 编排。
3. **agent 能力 = 知识库 base + skills + MCP servers**,三者皆受管(导入 / 编辑 / 绑定)。
4. **能力边界靠 `canUseTool` + `disallowedTools` + `strictMcpConfig` 强制,不靠 `allowedTools`。** `allowedTools` 只是 auto-approve 列表,不限制 Claude 只能用这些(见 §4.5)。
5. **跨 agent 只传 Claim,且 Claim 由 zod 强校验**(见 §2.3 / §4.4)。
6. **知识注入默认动态 capsule**,静态整库仅限小、稳定、低风险 base(见 §5.3)。

---

## 1. 技术栈与仓库结构

| 层 | 选型 |
|---|---|
| Monorepo | pnpm workspaces |
| 前端 | React + TS + Vite + Tailwind(gold/dark token)+ lucide-react + framer-motion + zustand |
| 后端 | Node + TS + Fastify + Claude Agent SDK(`@anthropic-ai/claude-agent-sdk`) |
| 存储 | SQLite(`better-sqlite3`)+ 内容文件(base 快照,按 fingerprint 寻址) |
| 通信 | HTTP(REST)+ SSE(流式) |
| 校验 | zod(共享 schema,运行时校验 + 类型推导) |

```
personaX/
  pnpm-workspace.yaml
  packages/
    shared/                   # 共享 zod schema 与类型(Claim / agent def / base ...)
    server/                   # 后端(其根目录即 SDK 会话的受管 cwd)
      .claude/
        skills/<id>/SKILL.md  # ★ 受管 skill 的唯一事实源(SDK 经 settingSources 发现)
      src/
        api/                  # Fastify 路由
        runtime/              # RunManager · RunContext · router · 预算/审计
        sdk/                  # query 组装 + 消息流转 + canUseTool 策略
        knowledge/            # base 存储 / 版本化 / fingerprint / capsule 编译 / patch
        governance/           # 治理 policy(propose/critique → 确定性状态转移)
        store/                # SQLite 访问层
      data/
        personax.db
        bases/                # base 内容文件(content-addressed)
    web/                      # 前端(见 §7)
  docs/
```

> skill 只有**一个事实源**:`packages/server/.claude/skills/<id>/`(server 的 cwd 下)。导入/编辑直接读写这里,SDK 经 `settingSources` 在此 cwd 发现。不再有 `data/skills` 与 `.claude/skills` 两套(评审 #5)。

---

## 2. 数据模型

zod 定义于 `packages/shared`,以下为 TS 形态。

### 2.1 Agent 定义(注册表条目)

```ts
type AgentKind = 'lead' | 'business_domain' | 'technical_domain' | 'worker';

interface AgentDefinition {
  id: string;                 // "agent.payment"
  name: string;
  kind: AgentKind;
  domain?: string;            // "payment"
  baseId?: string;            // 绑定知识库(worker 通常无)
  basePin?: string;           // 固定到某版本;空 = 用 activeVersion
  skills: string[];           // 绑定 skill 名(→ query 的 skills 选项)
  mcpServers: string[];       // 绑定 MCP id(→ query 的 mcpServers)
  toolPolicy: {               // 能力边界(供 canUseTool 强制,见 §4.5)
    allow: string[];          // 白名单(支持 mcp__server__* 通配)
    confirm?: string[];       // 危险工具:需治理确认
  };
  systemPromptExtra?: string;
  status: 'active' | 'disabled';
  version: number;
  updatedAt: string;
}
```

agent 的"知识"= `baseId`(领域知识)+ `skills`(流程)+ `mcpServers`(工具)。

### 2.2 知识库与版本(单一 active 指针)

```ts
interface KnowledgeBase {
  id: string;                 // "base.payment"
  domain: string;
  kind: 'business' | 'technical';
  latestVersion: number;
  activeVersion: number;      // ★ 唯一生效指针(评审 #7)
}

interface BaseVersion {
  baseId: string;
  version: number;            // 单调递增,不可变
  fingerprint: string;        // sha256(content)
  contentPath: string;        // data/bases/<fingerprint>.md
  status: 'draft' | 'published' | 'superseded';   // ★ 不再有 active
  createdAt: string;
  reason?: string;
  sourcePatchId?: string;
}
```

"当前生效版本"只由 `KnowledgeBase.activeVersion` 决定;`BaseVersion.status` 只描述生命周期(草稿/已发布/被取代),不再是第二个 active 源。

### 2.3 Claim(跨 agent 唯一传递物,强 schema)

```ts
const ClaimSchema = z.object({
  // 出处(仲裁与审计必需)
  agentId: z.string(),
  agentKind: z.enum(['lead','business_domain','technical_domain','worker']),
  baseId: z.string().optional(),
  baseVersion: z.number().optional(),
  baseFingerprint: z.string().optional(),     // 基于哪份地图
  // 内容
  claimType: z.enum(['observed_fact','inference','hypothesis','recommendation','failed_observation']),
  claim: z.string(),
  scope: z.string(),                          // 调查范围:服务/模块/链路
  timeWindow: z.string().optional(),          // 证据时间窗
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().optional(),
  // 证据
  evidenceRefs: z.array(z.string()),          // "log://..."、"code://path#L1-20"
  negativeEvidenceRefs: z.array(z.string()).optional(),  // 负证据 / 已排除
  relevantExcerpt: z.string().optional(),
  openQuestions: z.array(z.string()).optional(),
});
type Claim = z.infer<typeof ClaimSchema>;
```

`claimType` 区分事实/推断/假设/建议,是 Lead 仲裁的关键(observed_fact 高于 inference 高于 hypothesis);`failed_observation` 表示该 agent 没拿到有效证据。

### 2.4 Run、RunContext 与沉淀

```ts
interface Run {
  id: string;
  task: string;
  status: 'running' | 'done' | 'failed';
  forks: Array<{ agentId: string; baseId?: string; baseVersion?: number;
                 baseFingerprint?: string; forkedAt: string }>;
  claims: Claim[];
  finalDelivery?: string;
  createdAt: string;
}

// 运行时上下文:随 agent 间调用向下传递,承载预算与防环(评审 #6)
interface RunContext {
  run: Run;
  depth: number;
  visitedAgents: string[];           // 防环
  budget: {
    maxDepth: number; maxChildAgents: number; maxToolCalls: number;
    maxCostUsd: number; maxWallMs: number;
    spentChildAgents: number; spentToolCalls: number; spentCostUsd: number;
    startedAt: number;
  };
  emit: (ev: RunEvent) => void;      // SSE
}

interface BasePatch {                 // 沉淀产物(propose,不直接改 base)
  id: string; baseId: string; fromRunId: string;
  proposal: string; evidenceRefs: string[];
  status: 'pending' | 'accepted' | 'rejected';
  autoEligible: boolean;
}
```

### 2.5 Skill 与 MCP

```ts
interface SkillDef {
  id: string;
  name: string;
  path: string;               // packages/server/.claude/skills/<id>/SKILL.md(唯一源)
  source: 'imported' | 'builtin';
  enabled: boolean;
}

interface McpServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string; args?: string[]; env?: Record<string, string>;  // stdio
  url?: string; headers?: Record<string, string>;                   // http/sse
  enabled: boolean;
}
```

---

## 3. 知识库存储与版本化

### 3.1 SQLite schema(核心表)

```sql
CREATE TABLE agent_definitions (id TEXT PRIMARY KEY, name TEXT, kind TEXT, domain TEXT,
  base_id TEXT, base_pin TEXT, skills_json TEXT, mcp_json TEXT, tool_policy_json TEXT,
  system_prompt_extra TEXT, status TEXT, version INTEGER, updated_at TEXT);

CREATE TABLE knowledge_bases (id TEXT PRIMARY KEY, domain TEXT, kind TEXT,
  latest_version INTEGER, active_version INTEGER);   -- active_version 是唯一生效指针

CREATE TABLE base_versions (base_id TEXT, version INTEGER, fingerprint TEXT,
  content_path TEXT, status TEXT, created_at TEXT, reason TEXT, source_patch_id TEXT,
  PRIMARY KEY (base_id, version));                    -- status: draft|published|superseded

CREATE TABLE base_patches (id TEXT PRIMARY KEY, base_id TEXT, from_run_id TEXT,
  proposal TEXT, evidence_json TEXT, status TEXT, auto_eligible INTEGER, created_at TEXT);

CREATE TABLE runs (id TEXT PRIMARY KEY, task TEXT, status TEXT, forks_json TEXT,
  claims_json TEXT, final_delivery TEXT, created_at TEXT);  -- claims_json: Claim[]

CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT, path TEXT, source TEXT, enabled INTEGER);

CREATE TABLE mcp_servers (id TEXT PRIMARY KEY, name TEXT, transport TEXT, command TEXT,
  args_json TEXT, env_json TEXT, url TEXT, headers_json TEXT, enabled INTEGER);
```

### 3.2 版本化机制

- **不可变版本**:`base_versions` 只增不改。`fingerprint = sha256(content)`,内容相同复用文件。
- **fork**:run 启动按 `activeVersion`(或 agent `basePin`)读快照编译 capsule(§5.3)注入,并把 `base_id/version/fingerprint` 记进 `run.forks`。
- **发布**:patch 接受 → 写新 `base_versions`(status=published)+ 更新 `knowledge_bases.active_version`;旧版本置 superseded。**生效切换只动 `active_version` 一处**。
- **过期**:运行原则"当前证据优先于 base"——Lead 仲裁时,本次取到的 `observed_fact` 证据高于 base 推断;自动过期检测见 §9。

---

## 4. Claude SDK 集成与 agent 运行时 ★

核心:**server 是唯一编排者;每个 agent 是 server 起的独立 `query()` 会话;agent 间调用走 server 的 in-process 工具,router、预算、权限、注入全在 server。**

### 4.1 一个 agent 实例 = 一次 query()

```ts
// packages/server/src/sdk/runAgent.ts  ⚠️ 字段以 SDK 版本为准
import { query } from '@anthropic-ai/claude-agent-sdk';

async function runAgent(def: AgentDefinition, input: string, ctx: RunContext): Promise<Claim> {
  const baseCapsule = def.baseId ? await compileCapsule(def, ctx) : '';   // §5.3 默认动态 capsule
  const stream = query({
    prompt: input,
    options: {
      systemPrompt: { type: 'preset', preset: 'claude_code',
        append: `${rolePrompt(def)}\n\n${baseCapsule}\n\n${def.systemPromptExtra ?? ''}`,
        excludeDynamicSections: true },
      cwd: MANAGED_CWD,                       // packages/server:受管干净目录
      mcpServers: buildMcpServers(def, ctx),  // orchestration + claim-sink + 绑定 MCP
      allowedTools: [...def.toolPolicy.allow, 'mcp__personax-*__*'],  // 仅 auto-approve
      disallowedTools: ['Agent', 'Task'],     // ★ 关原生 subagent(v2.1.63+ 'Agent',旧 'Task')
      canUseTool: serverPolicyCanUseTool(def, ctx),  // ★ 真正的能力闸门(§4.5)
      permissionMode: 'default',              // 配合 canUseTool 作决策;不弹交互
      strictMcpConfig: true,                  // ★ 忽略文件 MCP,只认程序化注入
      settingSources: def.kind === 'worker' ? [] : ['project'],  // 仅为发现受管 skill
      skills: def.skills,                     // per-agent 过滤启用哪些 skill
      hooks: governanceHooks(ctx),            // PostToolUse 审计/证据索引(§8)
      model: modelFor(def.kind),              // lead=opus, worker=sonnet
      includePartialMessages: true,
    },
  });
  return collectClaim(stream, def, ctx);      // §4.4:zod 强校验
}
```

### 4.2 agent 间调用走 server router

server 用 `createSdkMcpServer` 暴露 in-process 工具,作为 agent 唯一对外调用入口:

```ts
const orchestration = createSdkMcpServer({
  name: 'personax-orchestration', version: '1.0.0',
  tools: [
    tool('call_domain_agent', '向某领域主 agent 提问,返回结构化 claim',
      { domain: z.string(), question: z.string() },
      async ({ domain, question }, _extra, ctx: RunContext) => {
        guardRecursion(ctx, 'call_domain_agent');          // ★ 深度/预算/防环(§4.6)
        const def = registry.byDomain(domain);
        const child = childContext(ctx, def.id);
        const claim = await runAgent(def, question, child);
        return { content: [{ type: 'text', text: JSON.stringify(claim) }],
                 structuredContent: claim };               // 结构化输出
      }),
    tool('spawn_worker', '派一次性 worker 做检索/读代码/跑命令,返回 claim',
      { task: z.string(), tools: z.array(z.string()).optional() },
      async ({ task, tools }, _extra, ctx: RunContext) => {
        guardRecursion(ctx, 'spawn_worker');
        const claim = await runWorker(task, tools, childContext(ctx, 'worker'));
        return { content: [{ type: 'text', text: JSON.stringify(claim) }],
                 structuredContent: claim };
      }),
  ],
});
```

注入形态:`buildMcpServers` 返回 record——`{ 'personax-orchestration': { type:'sdk', name, instance }, 'personax-claim-sink': {...}, ...绑定 MCP }`;工具名 `mcp__personax-orchestration__call_domain_agent`,故 `allowedTools` 放行 `mcp__personax-*__*`。

### 4.3 Worker(不依赖原生 subagent)

```ts
async function runWorker(task: string, tools: string[] | undefined, ctx: RunContext): Promise<Claim> {
  const def = workerDef(tools);   // 临时定义,kind='worker'
  const stream = query({ prompt: task, options: {
    systemPrompt: { type: 'preset', preset: 'claude_code',
      append: '你是一次性 worker。只做被指派的检索/执行,产出结构化 claim,不做业务判断。' },
    cwd: MANAGED_CWD,
    allowedTools: tools ?? ['Read', 'Grep', 'Glob', 'Bash'],  // 读代码自理;按粒度配
    disallowedTools: ['Agent', 'Task'],
    canUseTool: serverPolicyCanUseTool(def, ctx),
    permissionMode: 'default',
    strictMcpConfig: true,
    settingSources: [],            // worker 不加载 skill
    mcpServers: workerMcp(ctx),    // claim-sink + 必要 MCP(如日志查询)
    model: 'claude-sonnet-4-6',
    persistSession: false,         // 只存内存,不写盘
    includePartialMessages: true,
  }});
  return collectClaim(stream, def, ctx);
}
```

> 证据获取粒度(领域 agent 自理 vs 独立 worker/技术域 agent,如日志)在 agent 的 `toolPolicy` / `mcpServers` 上配。`call_domain_agent('log', ...)` 与 `spawn_worker` 两条路都留好。

### 4.4 结构化输出强校验(窄接口真正落地)

`consume()` 不保证产物是 Claim,模型可能输出自然语言或无效 JSON。因此 **agent 必须通过 in-process `submit_claim` 工具提交结论**(claim-sink server,入参即 `ClaimSchema`),server 在工具层 zod 校验:

```ts
async function collectClaim(stream, def, ctx): Promise<Claim> {
  const submitted = await consume(stream, ctx);     // 取 submit_claim 提交的 payload
  const parsed = ClaimSchema.safeParse(stamp(submitted, def, ctx));  // 补 agentId/baseFingerprint
  if (parsed.success) return parsed.data;
  const repaired = await repairOnce(def, parsed.error, ctx);   // 让该 agent 修复一次
  const reparsed = ClaimSchema.safeParse(stamp(repaired, def, ctx));
  if (reparsed.success) return reparsed.data;
  return failedObservation(def, ctx, parsed.error);  // claimType:'failed_observation'
}
```

`agentId / agentKind / baseId / baseVersion / baseFingerprint` 由 server 在 `stamp()` 时盖章(不信任模型自报)。

### 4.5 权限与能力边界模型(评审 #1 #2)

`allowedTools` **不是**限制,只是 auto-approve 列表;未列出的工具仍会走权限流程。真正的边界:

| 手段 | 作用 |
|---|---|
| `canUseTool(def)` | **硬闸门**:按 agent 的 `toolPolicy` 决定 allow/deny;命中 `confirm` 的危险工具转治理确认。⚠️ 返回 `{behavior:'allow'\|'deny', ...}`(结构以版本为准) |
| `disallowedTools: ['Agent','Task']` | 关原生 subagent |
| `strictMcpConfig: true` | 只认程序化注入的 MCP,忽略 `.mcp.json`/用户/插件/connector |
| `cwd = MANAGED_CWD` + `settingSources:['project']` | cwd 是受管干净目录(无 `.mcp.json`,只含投影的 skill),使 project 发现只能拿到受管 skill |
| `permissionMode` | 配合 `canUseTool` 不产生交互阻塞;具体值名以 SDK 行为为准 ⚠️ |

结论:能力完全由 server 决定,模型无法绕过 `allowedTools` 自取工具。

### 4.6 递归 / 预算 / 防环(评审 #6)

`guardRecursion(ctx, kind)` 在每次 `call_domain_agent` / `spawn_worker` 入口强制:

- `depth + 1 > budget.maxDepth` → 拒绝
- `spentChildAgents >= maxChildAgents` / `spentCostUsd >= maxCostUsd` / `now-startedAt > maxWallMs` → 拒绝
- `def.id ∈ visitedAgents`(同链路重入)→ 拒绝(防环)

超限不抛异常,返回 `claimType:'failed_observation'` 的 Claim,让 Lead 知情。`childContext()` 派生子 ctx(depth+1、追加 visitedAgents、共享 budget 计数)。每个 `result` 消息的 `total_cost_usd` 累加进 `budget.spentCostUsd`。

---

## 5. Skill 与 MCP 管理(最基本能力)

### 5.1 Skill

- **唯一事实源**:`packages/server/.claude/skills/<id>/SKILL.md`(server cwd 下)。
- **加载**:SDK 经 `settingSources:['project']` 在受管 cwd 发现;每次 query 用 `skills` 选项(`'all'|string[]|[]`)过滤本次启用哪些(SDK 自动加 `Skill` 工具)。SKILL.md 的 `allowed-tools` frontmatter 在 SDK **不生效**,工具权限走 `canUseTool`/`toolPolicy`。
- **导入 / 编辑**:直接读写该目录(管理面编辑器);写 `skills` 表。
- **绑定**:`agent_definitions.skills_json` → 运行时 `skills` 选项。
- API:`GET/POST/PUT/DELETE /skills`、`POST /skills/import`。

### 5.2 MCP

- **全程序化注入**:运行时 `buildMcpServers(def)` 把绑定且 enabled 的 MCP 拼进 `options.mcpServers`——stdio = `{command,args,env}`;SSE = `{type:'sse',url,headers}`;HTTP = `{type:'http',url,headers}`;进程内 = `{type:'sdk',name,instance}`。配 `strictMcpConfig:true`,任何文件 MCP 不参与。
- **导入 / 编辑 / 测试**:管理面粘贴配置或从注册表选;`POST /mcp/:id/test` 做连通探测并列工具。
- **治理**:MCP 写类工具纳入 `toolPolicy.confirm` → `canUseTool` 转确认。
- API:`GET/POST/PUT/DELETE /mcp`、`POST /mcp/import`、`POST /mcp/:id/test`。

### 5.3 知识注入(默认动态 capsule,评审 #9)

- **默认动态 capsule**:`compileCapsule(def, ctx)` 按当前任务从 base 快照检索/裁剪相关片段,控 token 预算,保留 source 引用。这是常规路径。
- **静态整库**:仅当 base 小、稳定、低风险时允许,作为 capsule 的退化形态,不作为默认——避免退回"大 prompt agent"。
- 具体 capsule 编译策略(检索方式、预算)见 §9 开放项。

---

## 6. 后端服务(Fastify + 运行时)

### 6.1 路由

```
GET/POST/PUT/DELETE  /agents
GET/POST             /bases
GET                  /bases/:id/versions
POST                 /bases/:id/versions          # 接受 patch → 新版本(切 active_version)
GET/POST/PUT         /bases/:id/patches
GET/POST/PUT/DELETE  /skills    POST /skills/import
GET/POST/PUT/DELETE  /mcp       POST /mcp/import   POST /mcp/:id/test
POST                 /runs                         # Global Lead 入口
GET                  /runs/:id/stream              # SSE
GET                  /runs/:id
```

### 6.2 RunManager

- 创建 run → 建根 `RunContext`(depth=0、初始 budget)→ 起 Global Lead `runAgent` → Lead 经 `call_domain_agent`/`spawn_worker` 触发子会话(router + `guardRecursion`)→ 收集 Claims → Lead 合成 `finalDelivery`。
- 维护 run state、forks、SSE 订阅、审计、预算计数。
- **沉淀只在 finalization 做**(评审 #8):RunManager 在 run 收尾(或 `Stop`/`SessionEnd` hook)从 claims + delivery 提炼 `BasePatch`(pending)。`PostToolUse` hook **只**做审计与证据索引,不触发沉淀。

---

## 7. 前端(React + Vite + Tailwind,agentX 风格)

### 7.1 样式

沿用 agentX:Tailwind,扩展 `gold`(#c9a227 系)/ `dark`(#0e0e16 系)token;lucide-react;framer-motion;zustand;自实现 SSE(参照 agentX `streamChat`)。

### 7.2 页面

| 页面 | 内容 |
|---|---|
| Run / Chat | 任务输入 + 流式输出 + **RunGraph**(agent 调用树,含 depth/预算)+ **ClaimCard**(claimType/出处/证据/负证据)+ ThinkingPanel |
| Agents | 注册表:agent 定义增删改,绑定 base/skill/mcp,toolPolicy,上下线,版本 |
| Knowledge | 版本列表、版本 diff、patch proposal 审核(接受 → 切 active) |
| Skills | 导入 / 在线编辑 / 启用禁用 |
| MCP | 导入 / 编辑 / 连通测试 / 启用禁用 |
| Settings | 模型、预算上限(maxDepth/cost/...)、治理策略开关 |

### 7.3 核心组件

`MessageBubble` · `SegmentRenderer`(react-markdown + remark-gfm)· `RunGraph` · `ClaimCard` · `VersionDiff` · `PatchReview` · `McpTester`。

---

## 8. 治理闭环

- **沉淀(propose)**:run finalization 时从 claims + delivery 提炼 `BasePatch`(pending)。LLM 只提议,不写 base。
- **判定(deterministic)**:policy engine 按规则定 `autoEligible`(有证据 + 无冲突 + 非敏感 → 可自动;否则人工)。状态转移由确定性代码执行。
- **确认**:`PatchReview` 接受 → 写新 `base_versions`(published)+ 切 `active_version`;拒绝 → 归档。
- **审计**:`PostToolUse` hook 索引每次工具调用与证据;每次 agent 调用、状态转移落审计,可回溯"为什么这么处理"。

---

## 9. 开放项

1. **capsule 编译策略**:检索方式(FTS/标签/结构化片段)、token 预算分配。
2. **证据获取粒度**:领域 agent 自理 vs 独立 worker/技术域 agent(在 `toolPolicy`/`mcpServers` 上配)。
3. **Base 过期自动检测**(指纹漂移 / 引用失效 / 时间衰减)。
4. **patch 自动接受**的具体 policy 阈值。
5. **多域 Claim 冲突时 Lead 的仲裁算法**(按 claimType 优先级 + confidence + 证据)。
6. **base 内容结构化程度**:纯 markdown vs 结构化片段 + 稳定引用 id。
7. ⚠️ SDK 小项随版本核对:`canUseTool` 的 `PermissionResult` 结构、`permissionMode` 与 `canUseTool` 的交互、`hooks` 各事件回调签名、`maxBudgetUsd`/`effort`/`fallbackModel` 稳定性。
```
