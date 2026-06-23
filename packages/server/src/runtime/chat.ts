/**
 * 1V1 直聊运行时(Wave 3)。
 *
 * runChatTurn:与单个已注册 agent 的一轮对话。
 * - 每轮把**全部历史**渲染进 systemPrompt 重发(默认历史全部传递,不依赖 SDK resume)。
 * - 实时持久化:先落库用户消息,流式产出后落库 assistant 消息。
 * - 流式:经 emit 回调发出 thinking_delta / text_delta / done / error(ChatEvent)。
 * - 对话**不走编排 / claim-sink**,只装该 agent 绑定的外部 MCP;回复是自由文本。
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, PermissionResult, CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition, Chat, ChatEvent } from '@personax/contracts';
import { getAgent } from '../store/agents.js';
import { getBase, getVersion } from '../store/bases.js';
import { getSettings } from '../store/settings.js';
import { insertUsageEvent } from '../store/usage.js';
import { getModelContextWindow } from '../api/models.js';
import { buildChatMcpServers } from '../sdk/mcp.js';
import { MANAGED_CWD } from '../sdk/runAgent.js';
import { appendMessage, listMessages, touchChat } from '../store/chats.js';

/** 解析最终模型:def.model 优先,否则全局 defaultModel。 */
function resolveModel(def: AgentDefinition): string {
  return def.model || getSettings().defaultModel;
}

/** 对话用角色定位:不强制 submit_claim(自由文本作答)。 */
function chatRolePrompt(def: AgentDefinition): string {
  switch (def.kind) {
    case 'lead':
      return `你是「${def.name}」,以自然语言与用户多轮对话,基于你的职责与知识直接作答。`;
    case 'business_domain':
    case 'technical_domain':
      return `你是「${def.domain ?? def.name}」领域 agent,以自然语言与用户多轮对话,基于本域知识直接作答。`;
    case 'worker':
    default:
      return `你是「${def.name}」,以自然语言与用户多轮对话,直接作答。`;
  }
}

/** 取 def.baseId 当前生效版本内容做静态注入(与 runAgent 一致)。无则空串。 */
function loadBaseCapsule(def: AgentDefinition): string {
  if (!def.baseId) return '';
  const base = getBase(def.baseId);
  if (!base) return '';
  const versionNum = def.basePin ? Number(def.basePin) : base.activeVersion;
  if (!Number.isInteger(versionNum) || versionNum < 1) return '';
  const ver = getVersion(def.baseId, versionNum);
  if (!ver) return '';
  return `【领域知识库 ${def.baseId} v${ver.version}】\n${ver.content}`;
}

/**
 * 对话用 canUseTool:绑定 MCP 工具 + def.toolPolicy.allow 放行,其余拒绝。
 * 不引 RunContext(对话无 run 上下文)。
 */
function makeChatCanUseTool(def: AgentDefinition): CanUseTool {
  const allow = def.toolPolicy.allow ?? [];
  const globMatch = (pattern: string, name: string): boolean => {
    if (pattern === name) return true;
    if (!pattern.includes('*')) return false;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(name);
  };
  return async (toolName, input, _options): Promise<PermissionResult> => {
    if (allow.some((p) => globMatch(p, toolName))) {
      return { behavior: 'allow', updatedInput: input };
    }
    return {
      behavior: 'deny',
      message: `工具 ${toolName} 不在 agent(${def.id})的能力白名单内,已拒绝`,
    };
  };
}

/**
 * 把历史消息拼成可续写的文本块。priorMessages 为「最新用户消息之前」的全部消息,
 * 逐条按「用户: ... / 助手: ...」拼接。最新用户消息作为 prompt 单独传入,不在此重复。
 */
function renderHistory(priorMessages: { role: string; content: string }[]): string {
  if (priorMessages.length === 0) return '(无历史,这是第一轮对话)';
  return priorMessages
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');
}

/**
 * 运行一轮对话:落库用户消息 → 重发全部历史 → 流式产出 → 落库 assistant 消息 + usage → emit done。
 * 任何失败 emit error 而不抛(不崩进程)。
 */
export async function runChatTurn(
  chat: Chat,
  userText: string,
  emit: (ev: ChatEvent) => void,
): Promise<void> {
  const def = getAgent(chat.agentId);
  if (!def) {
    emit({ type: 'error', message: `agent 不存在: ${chat.agentId}` });
    return;
  }

  // 先落库用户消息(实时持久化)
  appendMessage({ chatId: chat.id, role: 'user', content: userText });

  // 取该 chat 全部历史(含刚落库的最新用户消息);最新用户消息作为 prompt,历史里放它之前的
  const all = listMessages(chat.id);
  const prior = all.slice(0, -1); // 去掉最后一条(= 刚存的最新用户消息)

  const capsule = loadBaseCapsule(def);
  const append = [
    chatRolePrompt(def),
    capsule,
    def.systemPromptExtra ?? '',
    '## 对话历史(延续它,回答用户最新一条)',
    renderHistory(prior),
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const model = resolveModel(def);

  const options: Options = {
    systemPrompt: { type: 'preset', preset: 'claude_code', append },
    cwd: MANAGED_CWD,
    model,
    mcpServers: buildChatMcpServers(def),
    allowedTools: [...def.toolPolicy.allow],
    disallowedTools: ['Agent', 'Task'],
    canUseTool: makeChatCanUseTool(def),
    permissionMode: 'default',
    strictMcpConfig: true,
    settingSources: ['project'],
    skills: def.skills,
    includePartialMessages: true,
  };

  let assistantText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;

  try {
    const stream = query({ prompt: userText, options });
    for await (const msg of stream as AsyncIterable<SDKMessage>) {
      if (msg.type === 'stream_event') {
        const ev = msg.event as {
          type?: string;
          delta?: { type?: string; text?: string; thinking?: string };
        };
        if (ev.type === 'content_block_delta' && ev.delta) {
          if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
            assistantText += ev.delta.text;
            emit({ type: 'text_delta', text: ev.delta.text });
          } else if (ev.delta.type === 'thinking_delta' && typeof ev.delta.thinking === 'string') {
            emit({ type: 'thinking_delta', text: ev.delta.thinking });
          }
        }
      } else if (msg.type === 'result') {
        costUsd = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0;
        const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0;
        outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0;
        // 容错:若没拿到任何流式文本,取 result 的最终文本兜底
        const resultText = (msg as { result?: unknown }).result;
        if (assistantText.length === 0 && typeof resultText === 'string') {
          assistantText = resultText;
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: 'error', message: `对话运行失败: ${message}` });
    return;
  }

  const contextWindow = getModelContextWindow(model);

  // 落库 assistant 消息
  const assistantMsg = appendMessage({
    chatId: chat.id,
    role: 'assistant',
    content: assistantText,
    model,
    inputTokens,
    outputTokens,
    costUsd,
    contextWindow,
  });

  // 落库用量事件(带 chatId)
  try {
    insertUsageEvent({
      chatId: chat.id,
      agentId: def.id,
      agentKind: def.kind,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      contextWindow,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[chat usage] insertUsageEvent 失败:', err);
  }

  touchChat(chat.id);
  emit({ type: 'done', message: assistantMsg });
}
