/**
 * 运行时按连接注入凭据(见 docs/api-relay-research.md)。
 *
 * SDK query() 的 options.env 会**整体替换**子进程环境(不与 process.env 合并),
 * 因此必须先 spread process.env 再改。
 *
 * 认证优先级:CLAUDE_CODE_OAUTH_TOKEN > ANTHROPIC_API_KEY。
 * 中转(api_relay)模式下,订阅 token 会盖过中转,所以必须:
 *   delete CLAUDE_CODE_OAUTH_TOKEN; delete ANTHROPIC_AUTH_TOKEN;
 * 再设 ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY。
 * 订阅(subscription)模式保持 .env 的 OAuth,并清掉可能串入的 ANTHROPIC_BASE_URL。
 */
import type { AgentDefinition } from '@personax/contracts';
import { getConnectionRaw, SUBSCRIPTION_ID } from '../store/connections.js';
import { getSettings } from '../store/settings.js';

/**
 * 解析某 agent 实际使用的连接 id:
 * def.connectionId(显式绑定)> 全局 defaultConnectionId > 'subscription'。
 * worker 等无 def.connectionId 的场景 → 落到全局默认。
 */
export function resolveConnectionId(def: Pick<AgentDefinition, 'connectionId'>): string {
  return def.connectionId || getSettings().defaultConnectionId || SUBSCRIPTION_ID;
}

/**
 * 为指定连接组装 query() 的 env(子进程环境,整体替换语义)。
 * - 总是先 spread process.env。
 * - api_relay:删订阅 token,设 base/key。
 * - subscription(或连接不存在):保持订阅凭据,清掉 ANTHROPIC_BASE_URL 防串。
 */
export function buildEnvForConnection(connId: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  const conn = getConnectionRaw(connId);

  if (conn && conn.type === 'api_relay' && conn.baseUrl && conn.apiKey) {
    // 中转:订阅 token 优先级更高,必须先删,否则会盖过中转
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    delete env.ANTHROPIC_AUTH_TOKEN;
    env.ANTHROPIC_BASE_URL = conn.baseUrl;
    env.ANTHROPIC_API_KEY = conn.apiKey;
  } else {
    // 订阅(或解析不到连接):保持 .env 的订阅凭据,清掉可能串入的 base
    delete env.ANTHROPIC_BASE_URL;
  }

  return env;
}

/** 便捷组合:按 agent 定义解析连接并组装 env。 */
export function buildEnvForAgent(def: Pick<AgentDefinition, 'connectionId'>): Record<string, string | undefined> {
  return buildEnvForConnection(resolveConnectionId(def));
}
