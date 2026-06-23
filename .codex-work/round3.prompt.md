R2 很好，三块基本采纳。R3 是收敛锁定轮：我先拍板，你负责把“最终可落地产物”给全 + 抓我拍错的地方 + 正面打一个命门问题。

【拍板1：记忆状态机锁定】
采用 5 态：active / provisional / candidate / rejected / archived。请产出一张最终 canonical 表：每个 kind（project_fact / project_decision / preference / persona_rule / workflow / glossary / note / session_summary / project_entity / tool_observation / user_explicit_remember）× [默认状态 / 能否零确认 active / 是否需确认 / provisional 能否进 prompt / 自动升级条件]。要能直接翻译成 Go policy engine 规则，不要再有“视情况”。

【拍板2：v0 context-builder 锁定】
采用你的极简检索。请直接给最终 system prompt 模板：分段标题 + 每段 token 上限 + active/provisional/candidate 各自怎么呈现 + evidence 显不显 + global persona 取几条 / project memories 取几条 / FTS 取几条。给具体数字，按总预算约 1500 token 估。

【拍板3：第一刀锁定 = 跨多文件代码改造】
采纳。半固定编排：inspect → impact-map → plan → patch → verify → critic → repair → summary，先不做泛用 DAG。

【命门问题（我最在意，正面打）】
裸 Claude Code 本来就会做跨文件改造。请精确划出 personaX 封套相对裸 Claude Code 的增量：上面 8 步里，逐步标注哪几步是执行核(Claude Code via ACP)干的、哪几步是 personaX 封套干的（编排调度 / 注入项目记忆与锁定决策 / verify 闸门 / 把改造结论与影响面回写 project memory）。某步封套没有增量就直说。最终我要能一句话回答：“用 personaX 做这个改造，比直接开 Claude Code 多得到了 X、Y、Z。” 如果你认为增量不足以撑起第一刀，现在就反对并改提名。

【接缝要求（honor A+B 都要）】
v0 的单 extractor 函数，请说明怎么留好接缝，使其 v1.5 能无重写地拆成 Extractor/Validator/Conflict/Curator/Capsule 多 agent 管线：给接口形状和 JSON 契约。让 A 是“设计即预留、延后实现”，不是推倒重来。

输出：拍板1 给最终表；拍板2 给最终模板+数字；拍板3+命门 给逐步 CC/封套 归属 + 一句话增量结论（或反对）；接缝给接口契约。中文、直接。这是最后一轮，给能直接进 design 文档的成品。
