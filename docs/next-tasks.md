# 下一批任务 · 已确认逻辑 + 待定项

## 已锁定(用户已拍板)

### 1. Agent 1V1 对话
- 入口:**Agents 页内的对话面板**(选中 agent → 对话)。
- **实时持久化**:会话 + 每条消息实时落库(chats / messages 表),刷新不丢。
- "清空" = **新开对话**(旧的留档,可回看)。
- 运行:复用该 agent 的 base/skills/mcp/toolPolicy;不挂编排 MCP(fan-out 留 Run);多轮用 SDK `resume` 续接(实现前先验 0.3.185 支持)。流式走 SSE。

### 2. Agent 选模型
- `AgentDefinition.model?: string`,表单加下拉(选项来自实时模型目录)。
- 优先级:**agent.model > Settings 默认模型**。**无 kind 兜底**(去掉 modelFor(kind))。
- 默认模型 = **claude-sonnet-4-6**(全局默认)。

### 3. Team 侧边栏
- 加占位 nav(`Users` 图标,Agents 下方),先不实现。将来 = 可保存的 agent 团队/编排预设。

### 4. Settings:供应商 + 模型 + 默认模型 + worker 模型
- 供应商:Anthropic(运行时 = Claude Agent SDK,仅支持 Claude 模型;文案写清"当前仅 Anthropic/Claude")。显示认证状态(订阅 token / API key,不露明文)。
- 模型目录:**实时获取,不写死** —— 调 Anthropic Models API(`GET /v1/models`)拉模型 + 能力(含 context window,用于 context 占比)。⚠️ 需验证订阅 OAuth token 能否访问 Models API;不行则退化为 API key 或维护内置表 + 标注。
- 默认模型:可选,默认 **sonnet-4-6**。
- **worker 模型**:worker 是临时 agent,无注册表单 → 在 **Settings 配 worker 模型**。
- 模型选择(agent / worker)统一在 Settings 能配。

### 5. 新增 Memory 概念(详见"待定 A")
保留 Knowledge(版本化/治理),**另加** Memory(轻量、per-agent)。

### 新增需求
- **各处显示消耗 / context 占比**:Run 的每个 agent 节点、1V1 对话、Settings 仪表盘都显示:输入/输出 token、cost(订阅下为名义值)、**context 占比**(= 输入 token / 该模型 context window)。
- **Settings 成本曲线**:随时间的消耗金额曲线,**分 agent**(可再分模型/按天)。需持久化 per-invocation 用量记录(usage_events 表:runId/chatId、agentId、model、in/out token、costUsd、ts),Settings 聚合出图。

---

## 已定(补充)
- A. Memory = **per-agent 用户可编辑笔记**,注入该 agent 上下文,可一键提升为 Knowledge patch(agent 自动写入留后续)。
- B. 成本曲线 = **手写 SVG**(风格匹配 gold/浅色,零依赖)。

## (原待定,备查)

### A. Memory 具体形态
- 选项1(推荐):**per-agent 记忆**,用户可编辑的笔记(markdown/条目),注入该 agent 上下文,可一键"提升"为 Knowledge patch。先做用户编辑,agent 自动写入留后续。
- 选项2:per-agent 记忆 + **agent 可在对话/run 中自动写入**(用 SDK memory 工具)。
- 选项3:仅 per-conversation 会话记忆(≈1V1 历史)。

### B. 成本曲线图表
- 选项1:**引入 recharts**(标准图表库,曲线/分组/tooltip 开箱即用,~中等依赖)。
- 选项2:**手写 SVG**(零依赖,简单折线,功能有限)。

---

## 实现顺序(2 点定后开工)
契约(agent.model / chat / memory / usage / settings)→ 任务4(settings + 实时模型目录 + worker/默认模型)→ 任务2(agent 选模型 + 去 kind 兜底)→ usage 采集 plumbing(各处显示消耗/context 占比)→ 任务1(1V1 对话 + 持久化)→ 任务5(memory)→ Settings 成本曲线 → 任务3(Team 占位)。
顺带:Run 历史列表 / runId 持久化 / 重连(呼应"刷新就没了",和 chat 持久化一起做)。

### 新增:飞书企业级接入(壳子 + 流程,先不做鉴权)
- 后端:Webhook 接收端点(如 `POST /integrations/feishu/events`),解析事件(@机器人 / 回复消息),映射成一次 agent run/chat,产出后"回帖"。**鉴权/签名校验/真实飞书 API 调用全部 stub**(打日志 / 占位响应)。
- 流程:飞书 @bot → webhook → personaX 选定 agent 跑 → 回复到原会话/话题。
- 前端:Settings/Integrations 加一张"飞书"卡(壳),显示连接状态(stub)+ webhook URL + 绑定哪个 agent。
- 数据:integration 配置(占位)。先跑通"收到事件 → 触发 run → 拿到回复 → stub 发送"这条链路即可。

### 执行方式(本批)
重活全部子 agent:每个 wave = 契约子 agent → (后端 ∥ 前端)子 agent → **独立验收子 agent**(端到端测试)→ 主对话最终抽查签字。主对话不直接写实现/跑长命令。
