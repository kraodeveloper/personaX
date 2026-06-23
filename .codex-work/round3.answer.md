## 拍板1：记忆状态机 canonical policy 表

先定一个全局前置规则，否则表会被安全例外污染。

**全局 redline override：先于 kind policy 执行。**

```text
redline = true 时，不进入 active/provisional：
- secret/token/password/private key/account credential
- 医疗/法律/金融个人画像
- 用户身份、住址、关系、政治/宗教/健康等敏感画像
- 模型从助手回答中推断出的用户偏好/人格
- 无 evidence 的长期事实
```

处理结果：

```text
secret/credential -> rejected
sensitive personal profile -> candidate, requires explicit confirmation
model-inferred persona/preference -> candidate, requires explicit confirmation
no evidence -> rejected
```

下面表格默认前提：

```text
redline = false
evidence_count >= 1
conflict = false
```

字段定义：

```text
默认状态 = model_extracted 时的默认写入状态
零确认 active = 不需要用户额外点确认即可 active 的条件
是否需确认 = 是否必须用户确认才能成为 active
provisional 进 prompt = 是否允许作为低置信提示进入 prompt
自动升级 = 从 provisional/candidate 到 active 的确定规则
```

| kind | 默认状态 | 能否零确认 active | 是否需确认 | provisional 能否进 prompt | 自动升级条件 |
|---|---|---:|---:|---:|---|
| `project_fact` | `active` | 是：`scope_type=project` 且 `source in (user_explicit, tool_observed, model_extracted)` 且 `confidence>=0.85` | 否 | 是，标注为 `PROVISIONAL FACT` | `provisional -> active`：同一 `key+value+scope` 在 `>=2` 个 session 出现，`confidence>=0.85`，无冲突 |
| `project_decision` | `provisional` | 是：仅当 `source=user_explicit_remember` 或 `source=user_explicit` 且命中决策词 `锁定/拍板/决定/采用/不再讨论/最终` | 是：不满足零确认条件时必须确认 | 是，标注为 `PROVISIONAL DECISION`，不得覆盖 active 决策 | `provisional -> active`：用户在 `>=2` 个 session 明确重复同一决策，且至少一次命中决策词；否则永不自动升级 |
| `preference` | `candidate` | 否 | 是 | 是，但只能进入 `Possible Preferences`，不得作为硬规则 | 永不自动升级；只能用户确认 |
| `persona_rule` | `candidate` | 否 | 是 | 否 | 永不自动升级；只能用户确认 |
| `workflow` | `provisional` | 是：仅当 `source=user_explicit_remember` 且 `scope_type in (project, session)` | 是：global workflow 必须确认 | 是，标注为 `PROVISIONAL WORKFLOW` | project-scoped：同一 `key+value+scope` 在 `>=3` 个 session 出现，`confidence>=0.9`，无冲突；global 永不自动升级 |
| `glossary` | `active` | 是：`scope_type in (project, global)` 且 `confidence>=0.75` | 否 | 是 | `provisional -> active`：同一术语映射出现 `>=2` 次，无冲突 |
| `note` | `candidate` | 否 | 否：默认不要求用户处理 | 否 | 永不自动升级；用户手动提升或被后续 extractor 改写为具体 kind |
| `session_summary` | `active` | 是：`scope_type=session` | 否 | 否：不作为长期记忆直接注入 | 无升级；`active` 但只供检索和回溯 |
| `project_entity` | `active` | 是：项目名、模块名、文件名、技术名、库名、协议名，`confidence>=0.7` | 否 | 是，但只作为实体/标签提示，不作为事实断言 | `provisional -> active`：出现 `>=2` 次或来自 tool observation |
| `tool_observation` | `active` | 是：来自可审计工具输出，例如 repo 文件、测试结果、配置文件 | 否 | 是 | 无需升级；默认 active；若后续 tool observation 冲突，旧项 `archived`，新项 `active` |
| `user_explicit_remember` | `active` | 是：用户显式说“记住/以后/保存为记忆”，且 redline=false | 否：用户这句话本身就是确认 | 是 | 不升级；写入后应派生/归一化为目标 kind，并保留原始 directive |

### 状态转移规则

Go policy engine 可以按这个顺序写死：

```text
1. redline check
2. evidence check
3. duplicate check
4. conflict check
5. kind default policy
6. source override
7. auto-upgrade check
8. prompt eligibility check
```

状态转移只允许：

```text
candidate -> active
candidate -> rejected
candidate -> archived

provisional -> active
provisional -> rejected
provisional -> archived

active -> archived
active -> rejected
active -> provisional  // 只允许用户手动降级

rejected -> archived
archived -> active     // 只允许用户手动恢复
```

自动任务不得执行：

```text
candidate -> persona_rule active
candidate -> preference active
candidate -> global workflow active
```

这三条是硬红线。

---

## 拍板2：v0 context-builder 最终模板

目标总预算：约 `1500 tokens`。

v0 不做复杂 compression，不做 embedding，不做 long transcript injection。context-builder 只拼接结构化 memories 和少量 FTS excerpt。

### 检索数量

固定数字：

```text
global persona/preference/workflow active: max 6 条
project active memories: max 10 条
relevant active memories from FTS: max 6 条
provisional memories: max 4 条
raw FTS evidence excerpts: max 3 条
candidate memories: 默认 0 条
```

去重后总注入：

```text
active memory 总数最多 14 条
provisional 最多 4 条
raw evidence 最多 3 条
```

排序：

```text
score =
  0.35 * scope_match
+ 0.25 * salience
+ 0.20 * fts_match
+ 0.10 * recency
+ 0.10 * source_weight
```

source weight：

```text
user_explicit_remember = 1.0
user_explicit = 0.9
tool_observed = 0.85
user_confirmed = 0.85
model_extracted = 0.55
```

### evidence 显示规则

```text
active memories：默认不显示 quote，只显示 source/date/kind
provisional memories：显示 source/date/kind，不显示长 quote
raw FTS evidence：显示短 excerpt，最多 3 条，每条 <= 45 汉字或 <= 35 英文词
candidate memories：默认不进 prompt
```

只有两种情况显示 evidence quote：

```text
1. 当前问题要求“我之前怎么说的/引用原话/追溯依据”
2. provisional memory 即将影响决策
```

v0 默认 system prompt 不塞大段证据。证据留在 UI 和 audit 里。

---

### 最终 system prompt 模板

```text
# Operating Contract
Budget: <= 140 tokens

You are personaX's execution layer for this session. Follow the user's current request first. Use the memory sections below as scoped context, not as absolute truth. Confirmed active memories override provisional notes. Provisional notes are hints only. Candidate memories are not included and must not be treated as facts.

# Global Persona And Workflow
Budget: <= 220 tokens
Source: active memories only
Max items: 6
Allowed kinds: persona_rule, preference, workflow

Format:
- [ACTIVE | {kind} | global | source={source} | updated={date}] {value}

Rules:
- Treat these as durable behavior guidance.
- Do not infer additional preferences beyond the listed items.

# Project Contract
Budget: <= 320 tokens
Source: active project-scoped memories
Max items: 8
Allowed kinds: project_decision, project_fact, workflow, glossary, project_entity, tool_observation

Format:
- [ACTIVE | {kind} | project={project} | source={source} | updated={date}] {value}

Rules:
- Project decisions are stronger than project facts.
- Do not contradict active project decisions unless the user explicitly asks to revisit them.

# Relevant Active Memories
Budget: <= 300 tokens
Source: structured retrieval + FTS over active memories
Max items: 6
Allowed kinds: project_fact, project_decision, workflow, glossary, tool_observation, note

Format:
- [ACTIVE | {kind} | scope={scope_type}:{scope} | source={source} | updated={date}] {value}

Rules:
- Use these only when relevant to the current task.
- Prefer project-scoped memories over global memories when both apply.

# Provisional Context
Budget: <= 180 tokens
Source: provisional memories only
Max items: 4
Allowed kinds: project_fact, project_decision, workflow, glossary, project_entity

Format:
- [PROVISIONAL | {kind} | scope={scope_type}:{scope} | confidence={confidence} | updated={date}] {value}

Rules:
- Treat these as unconfirmed hints.
- Do not rely on a provisional item to override an active item.
- If a provisional item materially affects the answer, mention the uncertainty or ask for confirmation.

# Retrieved Evidence
Budget: <= 160 tokens
Source: raw FTS excerpts from events/session summaries
Max excerpts: 3

Format:
- [EVIDENCE | session={session_id} | date={date}] "{short_excerpt}"

Rules:
- Evidence excerpts are context, not durable memory.
- Use them only to ground references to prior discussion.

# Current Task
Budget: <= 180 tokens

User request:
{current_user_request}

Task classification:
- project: {project_or_none}
- task_type: {task_type}
- intent: {intent}
- constraints: {current_turn_constraints}

# Response Requirements
Budget: <= 120 tokens

Follow the user's requested output format. Be direct. If memory conflicts with the current user message, obey the current user message and surface the conflict briefly when relevant. Do not claim a memory was confirmed unless its status is ACTIVE.
```

### Candidate memories 的处理

正常任务：

```text
candidate memories = 0
不进 system prompt
不影响回答
```

只有在用户进入 memory review / inbox / confirmation 场景时，使用专门模板：

```text
# Candidate Memories For Review
Budget: <= 300 tokens
Max items: 8

- [CANDIDATE | {kind} | scope={scope_type}:{scope} | confidence={confidence}] {value}
  Evidence: "{short_quote}"
  Proposed action: accept / edit / reject / scope-change
```

这点要硬锁：**candidate 默认不进执行 prompt。**

---

## 拍板3 + 命门：跨多文件代码改造的 CC / personaX 归属

先正面回答命门：

**如果 personaX 只是“把记忆塞进 Claude Code prompt”，增量不够撑起第一刀。**

跨多文件改造这个场景成立，前提是 personaX 封套必须真的拥有这四件事：

```text
1. 持久项目记忆与锁定决策注入
2. 半固定改造流程编排
3. verify gate，不通过不进入完成态
4. 改造结论、影响面、失败经验回写 project memory
```

少了 2/3/4，裸 Claude Code 已经足够好，personaX 只是换壳。

### 8 步归属表

| 步骤 | Claude Code via ACP 负责 | personaX 封套负责 | 封套增量 |
|---|---|---|---|
| `inspect` | 读取代码、搜索调用点、理解现有结构、总结初步发现 | 注入 project contract、历史决策、禁区、技术栈记忆；创建 run record；要求 CC 按固定 inspect schema 输出 | 有增量：裸 CC 只能看当前上下文，personaX 能带入长期项目约束 |
| `impact-map` | 分析受影响文件、模块、API、数据流、测试 | 固定 impact-map JSON schema；保存为 durable artifact；用已知 project memories 检查遗漏区域 | 有增量：影响面变成可追踪 artifact，而不是聊天中的临时段落 |
| `plan` | 生成改造步骤、风险、回滚点 | 检查 plan 是否违反 active project decisions；必要时要求用户确认；把 plan 绑定到 run id | 有增量：封套提供决策闸门和项目约束校验 |
| `patch` | 实际编辑文件、调用工具、修改代码 | 主要负责边界：传入 plan、限制改动范围、记录 touched files | 增量较小：实际能力主要来自 CC；封套只提供约束和记录 |
| `verify` | 执行测试/构建/类型检查命令，解释失败 | 封套拥有 verify gate：定义 required commands、收集 exit code、阻止未通过时标记完成、决定是否进入 repair | 强增量：裸 CC 可能“建议跑测试”或跑一部分；personaX 把验证变成状态机闸门 |
| `critic` | 根据 diff、impact-map、测试结果做代码审查 | 封套启动独立 critic pass；提供 diff + plan + project contract + failure logs；要求结构化 review 输出 | 强增量：封套把 self-review 固化成流程，而不是靠用户提醒 |
| `repair` | 根据 verify/critic 结果修复代码 | 封套控制循环次数、预算、失败原因归档；每轮 repair 后必须回到 verify | 有增量：形成闭环，而不是一次性“修一下试试” |
| `summary` | 草拟变更摘要、风险、验证结果 | 封套生成最终 run summary；写入 events；把影响面、决策、失败经验提炼为 memory candidates/provisional/active | 强增量：结果进入长期项目记忆，下次改造能复用 |

### 半固定编排状态机

```text
created
-> inspecting
-> impact_mapped
-> planned
-> patching
-> verifying
-> critic_review
-> repairing
-> verified
-> summarized
-> archived
```

失败路径：

```text
verifying -> repairing -> verifying
critic_review -> repairing -> verifying
verifying -> failed
repairing -> failed
```

完成条件：

```text
status = summarized
AND verify.required_all_passed = true
AND summary.persisted = true
```

不能只靠 CC 说“完成了”。

### 一句话增量结论

用 personaX 做跨多文件改造，比直接开 Claude Code 多得到：

```text
带长期项目记忆和锁定决策的上下文注入、强制 verify/critic/repair 闸门、以及可回写复用的影响面和改造经验。
```

再短一点：

```text
personaX 把 Claude Code 的一次性改代码，变成带项目记忆、验证闸门和经验沉淀的可复用改造流程。
```

这是足够撑起第一刀的，但前提是 v0 真的实现 verify gate 和 summary/memory writeback。否则我会反对。

---

## 接缝：v0 单 extractor 如何预留 v1.5 多 agent 管线

原则：

```text
v0 可以只有一个 Extractor 函数；
但它的输入输出必须已经等于未来 pipeline 的中间契约。
```

也就是说，v0 不要写成：

```go
func Extract(text string) []Memory
```

这会重写。

应该写成：

```go
func RunMemoryPipeline(input PipelineInput) PipelineOutput
```

v0 内部只有一个 LLM call + deterministic policy。v1.5 时把内部拆开，但外部契约不变。

---

### 顶层接口

Go 形状：

```go
type MemoryPipeline interface {
    Run(ctx context.Context, input PipelineInput) (PipelineOutput, error)
}
```

v0 实现：

```text
MemoryPipelineV0
- classify inline
- extract inline
- validate with simple rules
- detect conflicts with SQL query
- curate with policy table
- no capsule build or simple capsule build
```

v1.5 实现：

```text
MemoryPipelineV15
- Classifier
- Extractor
- Validator
- ConflictResolver
- Curator
- CapsuleBuilder
```

外部调用不变。

---

### PipelineInput JSON 契约

```json
{
  "run_id": "memrun_20260622_001",
  "project": "personaX",
  "session": {
    "id": "sess_123",
    "title": "R3 design lock",
    "task_type": "architecture_design",
    "started_at": "2026-06-22T10:00:00+08:00",
    "ended_at": "2026-06-22T11:00:00+08:00"
  },
  "events": [
    {
      "id": "evt_1",
      "role": "user",
      "content": "...",
      "created_at": "2026-06-22T10:01:00+08:00"
    }
  ],
  "existing_memories": [
    {
      "id": "mem_1",
      "kind": "project_decision",
      "scope_type": "project",
      "scope": "personaX",
      "key": "architecture.execution_core",
      "value": "Execution core is Claude Code via ACP.",
      "status": "active",
      "source": "user_explicit",
      "confidence": 0.95,
      "salience": 0.9,
      "updated_at": "2026-06-21T12:00:00+08:00"
    }
  ],
  "policy": {
    "states": ["active", "provisional", "candidate", "rejected", "archived"],
    "redline_enabled": true,
    "auto_active_enabled": true,
    "auto_upgrade_enabled": true
  }
}
```

---

### PipelineOutput JSON 契约

```json
{
  "run_id": "memrun_20260622_001",
  "classification": {
    "project": "personaX",
    "task_type": "architecture_design",
    "entities": ["personaX", "memory state machine", "context-builder"],
    "tags": ["memory", "architecture", "v0"]
  },
  "candidates": [],
  "validation_reports": [],
  "conflict_reports": [],
  "curation_decisions": [],
  "capsule_updates": [],
  "audit": [
    {
      "stage": "curator",
      "message": "Applied project_decision policy: default provisional unless explicit decision marker is present."
    }
  ]
}
```

v0 可以让 `validation_reports/conflict_reports/capsule_updates` 很薄，但字段必须存在。

---

## 子接口契约

### 1. Classifier

```go
type Classifier interface {
    Classify(ctx context.Context, input ClassificationInput) (ClassificationOutput, error)
}
```

输入：

```json
{
  "session_id": "sess_123",
  "project_hint": "personaX",
  "events": ["evt_1", "evt_2"]
}
```

输出：

```json
{
  "project": "personaX",
  "task_type": "architecture_design",
  "intent": "lock_design",
  "entities": ["context-builder", "memory policy"],
  "tags": ["memory", "policy", "agent-orchestration"]
}
```

v0：可以由 extractor 顺手输出。

v1.5：独立 classifier。

---

### 2. Extractor

```go
type Extractor interface {
    Extract(ctx context.Context, input ExtractionInput) (ExtractionOutput, error)
}
```

输入：

```json
{
  "session": {
    "id": "sess_123",
    "project": "personaX",
    "task_type": "architecture_design"
  },
  "events": [
    {
      "id": "evt_1",
      "role": "user",
      "content": "采用 5 态：active / provisional / candidate / rejected / archived。"
    }
  ],
  "existing_memory_summaries": [
    {
      "id": "mem_1",
      "kind": "project_decision",
      "value": "Memory uses candidate -> confirmed with evidence."
    }
  ]
}
```

输出：

```json
{
  "candidates": [
    {
      "temp_id": "cand_1",
      "kind": "project_decision",
      "scope_type": "project",
      "scope": "personaX",
      "key": "memory.state_machine",
      "value": "The memory state machine uses five states: active, provisional, candidate, rejected, archived.",
      "source": "user_explicit",
      "confidence": 0.98,
      "salience": 0.9,
      "evidence": [
        {
          "event_id": "evt_1",
          "quote": "采用 5 态：active / provisional / candidate / rejected / archived"
        }
      ],
      "tags": ["memory", "state-machine"]
    }
  ]
}
```

硬要求：

```text
Extractor 只能提出 candidates。
Extractor 不得决定 active/provisional/candidate。
Extractor 必须给 evidence。
Extractor 必须标 source。
```

---

### 3. Validator

```go
type Validator interface {
    Validate(ctx context.Context, input ValidationInput) (ValidationOutput, error)
}
```

输入：

```json
{
  "candidates": [
    {
      "temp_id": "cand_1",
      "kind": "project_decision",
      "value": "The memory state machine uses five states.",
      "evidence": [
        {
          "event_id": "evt_1",
          "quote": "采用 5 态..."
        }
      ]
    }
  ]
}
```

输出：

```json
{
  "reports": [
    {
      "candidate_temp_id": "cand_1",
      "verdict": "pass",
      "evidence_supported": true,
      "overgeneralized": false,
      "redline": false,
      "issues": [],
      "recommended_confidence": 0.98
    }
  ]
}
```

允许 verdict：

```text
pass
weaken
reject
needs_confirmation
```

v0：用规则实现即可。

---

### 4. ConflictResolver

```go
type ConflictResolver interface {
    Resolve(ctx context.Context, input ConflictInput) (ConflictOutput, error)
}
```

输入：

```json
{
  "candidates": [
    {
      "temp_id": "cand_1",
      "kind": "project_decision",
      "scope_type": "project",
      "scope": "personaX",
      "key": "memory.state_machine",
      "value": "The memory state machine uses five states."
    }
  ],
  "existing_memories": [
    {
      "id": "mem_old",
      "kind": "project_decision",
      "scope_type": "project",
      "scope": "personaX",
      "key": "memory.state_machine",
      "value": "The memory state machine uses candidate and confirmed states.",
      "status": "active"
    }
  ]
}
```

输出：

```json
{
  "conflicts": [
    {
      "candidate_temp_id": "cand_1",
      "existing_memory_id": "mem_old",
      "type": "supersedes",
      "severity": "medium",
      "proposal": "archive_existing_and_accept_candidate",
      "reason": "New user message explicitly locks a more precise five-state machine."
    }
  ]
}
```

type 枚举：

```text
duplicate
supersedes
contradiction
scope_difference
unrelated
```

v0：只做 same `kind+scope+key` 的 duplicate/supersedes。

---

### 5. Curator

```go
type Curator interface {
    Curate(ctx context.Context, input CurationInput) (CurationOutput, error)
}
```

输入：

```json
{
  "candidates": [
    {
      "temp_id": "cand_1",
      "kind": "project_decision",
      "scope_type": "project",
      "scope": "personaX",
      "key": "memory.state_machine",
      "value": "The memory state machine uses five states.",
      "source": "user_explicit",
      "confidence": 0.98,
      "salience": 0.9
    }
  ],
  "validation_reports": [
    {
      "candidate_temp_id": "cand_1",
      "verdict": "pass",
      "redline": false
    }
  ],
  "conflict_reports": [
    {
      "candidate_temp_id": "cand_1",
      "type": "supersedes",
      "existing_memory_id": "mem_old"
    }
  ],
  "policy_version": "memory_policy_v0"
}
```

输出：

```json
{
  "decisions": [
    {
      "candidate_temp_id": "cand_1",
      "action": "create_memory",
      "status": "active",
      "reason": "project_decision with explicit user decision marker",
      "memory": {
        "kind": "project_decision",
        "scope_type": "project",
        "scope": "personaX",
        "key": "memory.state_machine",
        "value": "The memory state machine uses five states: active, provisional, candidate, rejected, archived.",
        "status": "active",
        "source": "user_explicit",
        "confidence": 0.98,
        "salience": 0.9
      },
      "side_effects": [
        {
          "action": "archive_memory",
          "memory_id": "mem_old",
          "reason": "superseded"
        }
      ]
    }
  ]
}
```

action 枚举：

```text
create_memory
update_memory
archive_memory
reject_candidate
keep_candidate
request_confirmation
```

关键：**Curator 是 policy engine，不是自由 LLM agent。**

---

### 6. CapsuleBuilder

```go
type CapsuleBuilder interface {
    Build(ctx context.Context, input CapsuleInput) (CapsuleOutput, error)
}
```

输入：

```json
{
  "project": "personaX",
  "active_memories": [
    {
      "id": "mem_1",
      "kind": "project_decision",
      "value": "Execution core is Claude Code via ACP.",
      "salience": 0.95
    }
  ],
  "provisional_memories": [
    {
      "id": "mem_2",
      "kind": "workflow",
      "value": "For design lock rounds, output design-doc-ready artifacts.",
      "confidence": 0.8
    }
  ],
  "budget_tokens": 1500
}
```

输出：

```json
{
  "capsule": {
    "project": "personaX",
    "content": "# Project Contract\n- [ACTIVE | project_decision] Execution core is Claude Code via ACP.\n...",
    "token_estimate": 1180,
    "source_memory_ids": ["mem_1", "mem_2"]
  }
}
```

v0：context-builder 直接根据查询实时生成，不持久化 capsule。

v1：可持久化 `context_capsules`。

v1.5：CapsuleBuilder 可成为独立 agent/compiler。

---

## 最终落地边界

v0 必须做：

```text
1. 5 态 memories 表
2. canonical policy engine
3. v0 context-builder 模板
4. 跨文件改造 run state machine
5. verify gate
6. summary -> memory candidate/writeback
7. 单 extractor 函数，但输入输出使用 pipeline 契约
```

v0 不做：

```text
1. sqlite-vec
2. 泛用 DAG
3. 多 agent memory pipeline
4. 独立 capsule 持久化
5. persona 自动学习
```

这版边界是收敛的：personaX 不和 Claude Code 抢执行能力，而是在 Claude Code 外面提供**记忆、闸门、流程、沉淀**。这四个才是封套的产品价值。