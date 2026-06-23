## 推你1：确认疲劳 vs 污染

你说得对：personal 工具的第一失败模式不是理论污染，而是**确认流没人用**。如果每次都让用户审 memory，记忆层会变成待办列表，最后被无视。

所以我会把 R1 的“前置确认”改成更实用的三档：

```text
1. 自动 active：低风险、可撤销、scope 明确、有证据
2. provisional active：可临时参与检索，但注入时降权/标注
3. 必须确认：会改变 persona、长期偏好、身份、安全边界
```

### 零确认即可自动 active 的白名单

白名单的原则：

```text
不改变用户人格；
不代表用户长期偏好；
不暴露敏感信息；
scope 明确；
错误后果低；
有证据；
可以被覆盖或撤销。
```

我会允许这些自动 active：

| kind | 是否可自动 active | 条件 |
|---|---:|---|
| `raw_event` | 是 | 原始交互日志，永远可写 |
| `session_summary` | 是 | 标记为派生摘要，不作为事实源 |
| `project_entity` | 是 | 项目名、技术名、文件名、模块名、库名 |
| `project_fact` | 是 | 仅限用户明确陈述或工具可观察事实 |
| `project_current_task` | 是 | 短有效期，scope 到 session/project |
| `glossary` | 是 | 项目内术语映射，例如 ACP、cc-ds、personaX |
| `decision_candidate` | 可 provisional | 明确讨论过，但未必锁定 |
| `workflow_observation` | 可 provisional | 只作低权重提示，不改变 persona |
| `tool_observation` | 是 | 从 repo/package/config 观察到的事实，带来源 |
| `user_explicit_remember` | 是 | 用户说“记住 X”，但仍要经过红线过滤 |

注意：`project_fact` 自动 active 只适合这种：

```text
personaX 是 Go 单二进制 + SQLite + React。
personaX 是单用户本地优先。
执行核通过 ACP 驱动 Claude Code。
```

因为这些是你明确给出的项目事实。

不适合自动 active 的是这种：

```text
用户偏好所有项目都用 Go。
用户不喜欢云服务。
用户永远反对多 agent。
用户喜欢批判性语气。
```

这些都是 persona/preference 层，必须更谨慎。

### 绝不自动 active 的红线

这些不应该零确认入长期 active：

| kind | 原因 |
|---|---|
| `persona_rule` | 会改变助手长期行为 |
| `global_preference` | 容易把临时指令永久化 |
| `identity_fact` | 用户身份、关系、职业、位置等敏感 |
| `sensitive_secret` | token、密码、私钥、账号、内部链接 |
| `security_policy` | 错了会产生越权行为 |
| `medical/legal/financial_profile` | 高风险个人信息 |
| `relationship_memory` | 极易误推断、隐私风险高 |
| `belief/value_judgment` | 模型最容易脑补 |
| `negative_preference` | “不喜欢 X”常常有上下文 |
| `global_workflow_rule` | 会影响所有任务协作方式 |
| `project_decision` | 如果不是用户明确锁定，只能 candidate/provisional |

但有一个例外：

```text
用户显式说“以后都用中文回答，记住”
```

这可以直接 active，因为是显式指令。但仍应记录 evidence，并允许 UI 撤销。

---

### “懒确认”：默认 active，矛盾时才确认，能不能替代前置确认？

我的判断：**不能全局替代，但可以用于低风险记忆。**

更准确地说：

```text
懒确认适合 project/local/low-risk memories；
不适合 persona/global/high-impact memories。
```

#### 懒确认的优点

它解决了 personal 工具的核心可用性问题：

- 用户不用维护 inbox；
- 记忆系统从第一天就有用；
- 自动积累项目上下文；
- 减少“确认疲劳”；
- 冲突出现时再打扰，时机更自然。

对项目事实很适合：

```text
本项目使用 SQLite。
前端是 React。
这轮在讨论 memory layer。
```

即使错了，影响也有限，可以在后续纠正。

#### 懒确认的危险

但对 persona 层危险很大：

```text
用户这次要求“直接反驳”，系统自动学成“所有任务都要强硬反驳”。
用户这次说“不考虑云”，系统自动学成“用户讨厌所有云服务”。
用户这次要中文，系统自动学成“永远中文”。
```

这类错误不是普通污染，而是**行为漂移**。用户会感觉助手开始擅自定义自己。

所以懒确认应该变成：

```text
默认 provisional active，而不是真 active。
```

即：

- 可以参与检索；
- 可以帮助排序；
- 可以在 prompt 里作为“possible context”；
- 不能作为硬 persona rule；
- 不能覆盖 confirmed memory；
- 不能进入 global persona；
- 多次重复或用户显式接受后升级。

---

### 低打扰但不失控的默认确认策略

我建议采用这个默认策略：

```text
自动写 raw；
自动 active 低风险；
provisional active 中风险；
高风险进入 quiet inbox；
只在“即将影响行为”或“出现冲突”时打扰。
```

具体规则如下。

#### 1. 每轮对话后，不弹窗

后台做 extraction，但不打断用户。

写入：

```text
raw events: always
session summary: automatic
project facts: automatic if explicit/tool-observed
persona/preference: candidate only
```

前端只显示一个轻量标记：

```text
记忆：新增 3 条，待确认 1 条
```

不要 modal，不要强制处理。

#### 2. 用户显式说“记住”时，立即写入

例如：

```text
以后架构评审都先讲风险，记住。
```

这可以直接 active，但要有撤销 toast：

```text
已记住：架构评审先讲风险。 [撤销] [编辑]
```

这比进 inbox 更符合用户心理。

#### 3. 中风险候选进入 quiet inbox

例如：

```text
你似乎偏好“静态 persona 为主，学习只做建议”。
```

不立刻弹。进入 inbox，等待自然时机。

#### 4. Just-in-time 确认

当某条未确认记忆**即将影响回答**时，才问一次。

例如当前任务要决定 persona 演化策略，系统准备用这条候选：

```text
候选记忆：你倾向 persona 静态为主、学习只做建议。
```

可以在回答里轻量处理：

```text
我把你上次的倾向当作当前设计输入，不把它写成长期偏好，除非你确认。
```

或者 UI 侧出现小控件：

```text
将此设为长期偏好？ [是] [仅 personaX] [否]
```

这比批量 inbox 更有效，因为确认发生在上下文相关时刻。

#### 5. 冲突立即确认，但限制频率

冲突是少数值得打扰的场景。

例如已有：

```text
personaX 不做多 agent 平台。
```

新输入出现：

```text
项目方有意加较复杂的 agent 编排。
```

不要自动覆盖。应该判断为：

```text
不是直接冲突，可能是边界细化：不做多 agent 平台，但允许局部编排。
```

如果真冲突，才提示：

```text
这和已有项目记忆冲突：personaX 不做多 agent 平台。
处理方式：[保留旧判断] [更新为新判断] [限定为局部编排]
```

#### 6. 周期性 digest，而不是实时 inbox

默认频率：

```text
每天最多一次；
每次最多 5 条；
只显示高 salience；
无冲突则不主动弹；
用户打开记忆页时再展示全部。
```

更实用的触发：

```text
会话结束后，如果本轮产生 >=3 条高价值候选；
项目上下文即将被 capsule 重建；
出现 confirmed memory 冲突；
用户连续 3 次表达同一偏好；
用户显式进入“整理记忆”。
```

#### 7. 默认升级规则

我会设置一个自动升级机制，但只针对中低风险：

```text
同一 claim 在 3 个不同 session 中出现；
scope 一致；
没有冲突；
不是 persona/global/sensitive；
confidence >= 0.85；
则从 provisional -> active。
```

persona/preference 不走自动升级，只能生成 patch proposal。

---

## 推你2：v0 两周能跑起来的最小切法

你担心是对的。R1 的完整设计如果一次做完，会把 personaX 拖进“先造记忆平台”的坑。

v0 目标应该是：

```text
先开始积累；
先能检索注入；
先能人工纠错；
不要把 schema 做死；
不要上复杂编排。
```

### v0 只保留 4 张表

#### 1. `sessions`

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project TEXT,
  title TEXT,
  task_type TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT,
  metadata_json TEXT
);
```

`project` v0 先用 text，不急着做 `projects` 表。

#### 2. `events`

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  project TEXT,
  task_type TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,

  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

#### 3. `memories`

把 candidates、confirmed、preferences、project facts 先放一张表。字段预留好，后面可拆。

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,

  kind TEXT NOT NULL,
  -- project_fact | project_decision | preference | persona_rule |
  -- workflow | glossary | note | session_summary

  scope_type TEXT NOT NULL,
  -- global | project | session

  scope TEXT,
  -- e.g. "personaX", session id, or null

  key TEXT,
  value TEXT NOT NULL,
  value_json TEXT,

  status TEXT NOT NULL,
  -- active | provisional | candidate | rejected | archived

  source TEXT NOT NULL,
  -- user_explicit | model_extracted | tool_observed | user_confirmed

  confidence REAL NOT NULL DEFAULT 0.5,
  salience REAL NOT NULL DEFAULT 0.5,

  evidence_json TEXT,
  tags_json TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);
```

`evidence_json` v0 可以这样：

```json
[
  {
    "event_id": "evt_123",
    "quote": "执行核是商品，不自研 agent loop"
  }
]
```

后面 v1 再拆 `memory_evidence` 表。

#### 4. `memory_fts`

v0 只对 memories 建 FTS。events 也可以建，但最小版本先 memory FTS 就够。

```sql
CREATE VIRTUAL TABLE memories_fts USING fts5(
  value,
  tags,
  scope,
  content='memories'
);
```

如果实现 FTS content sync 麻烦，v0 可以接受独立 FTS 表，应用层同步。

---

### v0 暂时砍掉什么

明确砍：

| 机制 | v0 是否做 | 原因 |
|---|---:|---|
| embedding/sqlite-vec | 不做 | 没必要，增加分发复杂度 |
| 独立 `memory_candidates` 表 | 不做 | 用 `memories.status` 表示 |
| 独立 evidence 表 | 不做 | 先用 `evidence_json` |
| conflict queue 表 | 不做 | v0 用简单 duplicate/conflict 标记 |
| context_capsules 表 | 不做 | 每次从 active memories 拼接 |
| persona_versions | 不做 | v0 用 memories + manual edit |
| 多 agent 提炼流水线 | 不做 | 一个 extractor 函数够 |
| 自动复杂 consolidation | 不做 | 先靠状态和手动处理 |
| project 表 | 可不做 | `project TEXT` 先够 |
| 复杂 UI | 不做 | 一个 memory list + accept/reject/edit |

v0 最核心功能不是“智能整理”，而是：

```text
记得住；
查得到；
能注入；
能删改；
不会静默改人格。
```

---

### v0 写入流程

#### 1. 所有对话写 events

这是底座，必须第一天就有。

#### 2. 用户显式记忆

支持类似：

```text
记住：personaX 不做多 agent 平台。
```

或者 UI 按钮“保存为记忆”。

直接写：

```json
{
  "kind": "project_decision",
  "scope_type": "project",
  "scope": "personaX",
  "status": "active",
  "source": "user_explicit",
  "confidence": 1.0
}
```

#### 3. 会话结束后跑一次 extractor

v0 extractor 只输出少量候选：

```json
{
  "memories": [
    {
      "kind": "project_fact",
      "scope_type": "project",
      "scope": "personaX",
      "key": "architecture.local_first",
      "value": "personaX is local-first and single-user.",
      "status_suggestion": "active",
      "confidence": 0.95,
      "evidence": [...]
    }
  ]
}
```

然后应用层按白名单决定：

```text
project_fact explicit -> active
glossary -> active
session_summary -> active
preference -> candidate
persona_rule -> candidate
project_decision not explicit -> provisional
```

#### 4. 简单 memory inbox

v0 inbox 只需要三个操作：

```text
accept
reject
edit
```

不要做复杂 conflict UI。

#### 5. 检索注入

v0 检索可以极简单：

```text
1. 固定取 global active persona/preference top N
2. 取当前 project active memories top N
3. FTS 查 query 相关 memories top N
4. provisional 降权，只进“possible notes”
```

排序：

```text
score =
  salience * 0.4
+ scope_match * 0.3
+ recency * 0.2
+ fts_match * 0.1
```

不用过度追求最优。v0 只要比“完全没记忆”明显好。

---

### v0 / v1 / v1.5 边界

#### v0：两周能跑

目标：

```text
本地记录交互；
提炼少量记忆；
可人工确认；
可检索注入；
可删除/编辑；
无 embedding；
无复杂 agent 编排。
```

包含：

- `sessions`
- `events`
- `memories`
- `memories_fts`
- extractor 单函数
- 自动 active 白名单
- candidate/provisional 状态
- 简单 memory inbox
- context builder
- 手动“记住这个”入口
- “为什么注入这条”最小解释：显示 memory id/source/evidence

#### v1：记忆治理成型

目标：

```text
减少污染；
降低确认成本；
支持项目 capsule；
支持冲突处理。
```

增加：

- `memory_evidence` 独立表
- `memory_conflicts`
- `projects`
- `context_capsules`
- digest 式确认
- just-in-time confirmation
- conflict resolution UI
- project capsule builder
- persona patch proposal
- memory audit 页面

#### v1.5：增强召回和编排

目标：

```text
复杂项目和长历史下仍然好用。
```

增加：

- optional sqlite-vec
- event_chunks
- embedding retrieval as candidate source
- background consolidation
- memory evaluation tests
- 可选多 agent memory pipeline
- 任务执行编排的第一刀场景

---

## A：记忆/策展流水线做多 agent 编排，是承重还是表演？

我的判断：**v0 是表演，v1.5 以后可能是承重。**

单用户个人工具里，把 extractor / classifier / conflict-resolver / capsule-builder / critic 一开始都做成独立子 agent，是过度工程。原因：

- 数据量小；
- 错误主要来自 schema 和权限，不来自 agent 数量不足；
- 多 agent 会增加延迟、成本、日志复杂度；
- 子 agent 之间的分歧还要再治理；
- 最后你会先写一个 agent orchestration framework，而不是让 personaX 上岗。

但是，到了 v1.5，如果历史多、项目多、记忆质量开始影响体验，多 agent 化可以变成承重复杂度。前提是它不是“模拟团队”，而是**独立检查点流水线**。

### 哪几环不需要独立 agent

#### classifier 不需要独立 agent

分类可以是：

```text
规则 + 小模型/一次 LLM JSON 输出
```

没必要一个 classifier agent。它只是给事件打标签，错误后果低。

#### extractor 不一定需要独立 agent

v0/v1 一个 extractor 函数足够。它的输入输出固定 JSON，不需要 agent loop。

#### capsule-builder 不需要 agent 化

capsule-builder 更像 compiler：

```text
active memories -> compressed prompt section
```

它应该确定、可测试、可重建。用 LLM 做摘要可以，但不需要“agent”。

### 哪几环适合独立角色

如果后续做多 agent，我只保留这些角色边界：

#### 1. Extractor

职责：

```text
从 raw events 中提出 memory candidates。
只提候选，不决定入库。
必须给 evidence。
必须区分 explicit / inferred。
```

输出：

```json
{
  "candidates": [...]
}
```

#### 2. Validator / Critic

职责：

```text
检查候选是否被证据支持；
检查是否过度概括；
检查是否把助手建议误当用户偏好；
检查是否触碰红线；
给 risk label。
```

它不负责生成新记忆，只负责反驳 extractor。

输出：

```json
{
  "candidate_id": "...",
  "verdict": "pass | weaken | reject | needs_confirmation",
  "issues": [...]
}
```

#### 3. Conflict Resolver

职责：

```text
拿候选和现有 memories 比较；
判断 duplicate / supersedes / contradiction / scope_difference；
不给最终覆盖决定，只给 resolution proposal。
```

输出：

```json
{
  "conflicts": [
    {
      "existing_memory_id": "...",
      "candidate_id": "...",
      "type": "scope_difference",
      "proposal": "keep both with different scopes"
    }
  ]
}
```

#### 4. Curator

职责：

```text
根据白名单、红线、validator、conflict resolver 的输出，决定：
active / provisional / candidate / rejected。
```

注意：Curator 不应该是 LLM 自由发挥。它最好是 Go 里的确定性 policy engine。LLM 最多提供建议。

#### 5. Capsule Builder

职责：

```text
把 active memories 编译成 prompt capsule。
控制 token budget。
保留 source ids。
```

这个可以用 LLM 压缩，但必须可重建。更像 build step，不像 agent。

### 协作时序

如果做成流水线，我建议时序如下：

```text
1. Event Writer
   写 raw events，不等任何 agent。

2. Classifier
   给 session/event 打 project/task/entities/tags。

3. Extractor
   从 session 中提出 memory candidates。

4. Validator/Critic
   对每个 candidate 做证据审查和过度概括审查。

5. Conflict Resolver
   candidate vs existing memories，输出冲突/重复/覆盖建议。

6. Policy Engine / Curator
   应用白名单和红线：
   - auto active
   - provisional
   - candidate inbox
   - reject
   - conflict needs user

7. Capsule Builder
   只读取 active/provisional memories，生成 project/global capsule。

8. Audit Log
   记录每一步为什么这么处理。
```

关键点：

```text
LLM agents 只能 propose / critique；
最终状态转移由 deterministic policy 控制。
```

这才是承重架构。否则多 agent 只是把一个不可靠总结器换成五个不可靠总结器互相聊天。

---

## B：任务执行编排的第一刀场景

我同意你的判断：任务执行编排必须由硬任务挣出来。personaX 是个人开发者分身，第一刀不能选“泛用 planner”。要选：

```text
高频；
痛；
天然可拆；
并行有收益；
验证可自动化；
结果需要 synthesis。
```

我提名两个场景。

---

### 场景 1：跨多文件代码改造 / 迁移

这是第一优先级。

例子：

```text
把某个本地存储接口从 ad-hoc JSON 改成 SQLite repository。
把 React 状态管理从组件内状态抽到统一 store。
把 API response schema 改名，跨前后端同步。
给 personaX 增加 memory status：active/provisional/candidate。
```

#### 为什么这是个人开发者高频痛点

个人项目最常见的痛不是“写一个函数”，而是：

```text
我知道大方向，但改动散在很多文件；
怕漏；
怕破坏旧行为；
每次都要先全局理解；
改完还要跑测试/构建/手动验证。
```

这正适合 personaX 做“个人开发分身”。

#### 为什么天然可分解

跨文件改造可以拆成 DAG：

```text
1. Inspect
   找接口、调用点、数据流、测试。

2. Plan
   生成改造步骤和风险点。

3. Fan-out Analysis
   子任务 A：后端 schema/repository 影响面
   子任务 B：前端调用点影响面
   子任务 C：测试和 fixtures 影响面
   子任务 D：文档/config 影响面

4. Patch
   分模块修改。

5. Verify
   go test / npm test / typecheck / lint / build。

6. Critic
   对 diff 做 review：
   - 是否漏调用点
   - 是否破坏兼容
   - 是否出现死代码
   - 是否违反项目约束

7. Repair
   根据失败日志和 critic 反馈修补。

8. Synthesize
   输出变更摘要、验证结果、剩余风险。
```

这里的 fan-out 真有收益，因为不同子任务可以独立读不同区域：

```text
后端数据层
前端组件
测试
文档
```

而且 verify 有硬信号，不是纯主观。

#### 为什么不是表演

因为它有明确收益：

- 缩短大改前的探索时间；
- 降低漏改；
- 自动跑验证；
- 失败可自修复；
- 最终 diff 可 review。

这不是“多 agent 为了像团队”，而是把一个大改任务拆成：

```text
影响面分析 + 局部修改 + 验证闭环
```

这是承重。

---

### 场景 2：专题调研到本地决策 brief

第二优先级。

例子：

```text
为 personaX 评估 sqlite-vec / FTS5 / tantivy / libsql 的本地检索方案。
调研 ACP 生态和 Claude Code 替代执行核。
比较本地 LLM embedding 模型在 Windows 分发下的成本。
```

#### 为什么这是个人高频痛点

个人开发者经常需要做这种事：

```text
我不想看 30 个网页；
我需要知道该选什么；
我需要结论落到我的项目约束；
我还想保留证据，之后能追溯。
```

personaX 的价值就在“属于我个人、有我项目上下文”。调研不是泛泛总结，而是：

```text
结合 personaX 的 local-first、Go、SQLite、单用户、低复杂度约束做决策。
```

#### 为什么天然可分解

专题调研可以拆成：

```text
1. Define Question
   明确决策问题和约束。

2. Source Discovery
   找官方 docs、repo、issues、benchmarks、release notes。

3. Fan-out Reading
   子任务 A：候选方案 1
   子任务 B：候选方案 2
   子任务 C：候选方案 3
   子任务 D：风险/维护状态/分发成本

4. Evidence Extraction
   每个子任务输出 claims + sources + uncertainty。

5. Critic
   检查：
   - 是否用了二手信息
   - 是否遗漏关键约束
   - 是否把 benchmark 外推过度
   - 是否有时间敏感风险

6. Decision Matrix
   按 personaX 约束评分。

7. Synthesize
   输出 recommendation、tradeoffs、adoption path。

8. Memory Write
   把最终决策和证据写入 project memory candidate。
```

这里也是真并行：不同候选方案可以独立研究，最后合成。

#### 风险

这个场景需要网络和引用治理，复杂度高于代码改造。并且调研质量很依赖 source selection。它适合作为第二刀，不是第一刀。

---

### 我不建议第一刀做“线上排查”

虽然你提到了线上排查，但对 personaX 当前定位，我不建议第一刀选它。

原因：

```text
personaX 本地优先、个人项目；
线上排查需要日志、监控、权限、环境接入；
验证闭环依赖外部系统；
安全边界更复杂；
失败代价更高。
```

除非 personaX 未来明确接入你的个人服务监控，否则线上排查不是最小承重场景。

### 我也不建议第一刀做泛用 planner→DAG

不要先做通用 DAG agent。应该先为“跨文件改造”做半固定编排：

```text
inspect -> plan -> patch -> verify -> repair -> summarize
```

等这个跑顺，再抽象 DAG。否则你会做出一个漂亮的编排壳，但没有任何场景真正需要它。

---

## R3 该敲定的 2–3 点

**1. 记忆状态机和自动 active policy。**

R3 应该把这几个状态彻底定死：

```text
active
provisional
candidate
rejected
archived
```

以及每个 `kind` 的默认入库策略。尤其要定：

```text
project_decision 到底何时可 active？
preference 是否永远需要确认？
provisional 是否允许进入 prompt？
```

**2. v0 context-builder 的 prompt 格式和 token budget。**

不要再抽象讨论“注入记忆”。下一轮应该直接定：

```text
system prompt 分几段；
每段最多多少 token；
active/provisional/candidate 怎么呈现；
evidence 是否显示；
project memories 取多少条；
global persona 取多少条。
```

这会直接决定 v0 体验。

**3. 第一刀编排场景是否锁定“跨多文件代码改造”。**

如果锁定，就设计它的最小 DAG：

```text
inspect
impact map
implementation plan
patch
verify
critic
repair
summary
```

同时明确哪些步骤由 Claude Code 执行核完成，哪些由 personaX 封套负责编排、记录、注入上下文。