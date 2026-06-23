/**
 * 飞书集成配置数据访问层(壳子)。
 * feishu_config 表只有一行(id=1),用 INSERT OR REPLACE 做 upsert。
 * webhookPath 为展示用常量,不入库,读取时拼回。
 * 无行时返回默认值(disabled),不抛错。
 */
import { getDb } from './db.js';
import type { FeishuConfig, FeishuConfigUpdate } from '@personax/contracts';

/** webhook 事件路由路径(展示用常量,与 api/feishu.ts 注册路径一致)。 */
export const FEISHU_WEBHOOK_PATH = '/api/integrations/feishu/events';

interface FeishuRow {
  id: number;
  enabled: number | null;
  agent_id: string | null;
}

/** 读取当前飞书配置;无行时返回默认值(disabled)。 */
export function getFeishuConfig(): FeishuConfig {
  const row = getDb()
    .prepare('SELECT * FROM feishu_config WHERE id = 1')
    .get() as FeishuRow | undefined;
  if (!row) {
    return { enabled: false, agentId: undefined, webhookPath: FEISHU_WEBHOOK_PATH };
  }
  return {
    enabled: row.enabled !== 0 && row.enabled !== null,
    agentId: row.agent_id ?? undefined,
    webhookPath: FEISHU_WEBHOOK_PATH,
  };
}

/** 合并 patch 后 upsert(INSERT OR REPLACE id=1),返回新配置。 */
export function updateFeishuConfig(patch: FeishuConfigUpdate): FeishuConfig {
  const current = getFeishuConfig();
  const next: FeishuConfig = {
    enabled: patch.enabled ?? current.enabled,
    // agentId 在 patch 中显式出现时(含 undefined 不区分)以 patch 为准;否则保留
    agentId: 'agentId' in patch ? patch.agentId : current.agentId,
    webhookPath: FEISHU_WEBHOOK_PATH,
  };
  getDb()
    .prepare(`
      INSERT OR REPLACE INTO feishu_config (id, enabled, agent_id)
      VALUES (1, @enabled, @agentId)
    `)
    .run({ enabled: next.enabled ? 1 : 0, agentId: next.agentId ?? null });
  return next;
}
