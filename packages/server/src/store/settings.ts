/**
 * App 全局设置数据访问层。
 * app_settings 表只有一行(id=1),用 INSERT OR REPLACE 做 upsert。
 * 无行时返回默认值,不抛错。
 */
import { getDb } from './db.js';
import type { AppSettings, AppSettingsUpdate } from '@personax/contracts';

const DEFAULTS: AppSettings = {
  defaultModel: 'claude-sonnet-4-6',
  workerModel: 'claude-sonnet-4-6',
};

interface SettingsRow {
  id: number;
  default_model: string | null;
  worker_model: string | null;
}

/** 读取当前设置;无行时返回默认值。 */
export function getSettings(): AppSettings {
  const row = getDb()
    .prepare('SELECT * FROM app_settings WHERE id = 1')
    .get() as SettingsRow | undefined;
  if (!row) return { ...DEFAULTS };
  return {
    defaultModel: row.default_model ?? DEFAULTS.defaultModel,
    workerModel: row.worker_model ?? DEFAULTS.workerModel,
  };
}

/** 合并 patch 后 upsert(INSERT OR REPLACE id=1),返回新设置。 */
export function updateSettings(patch: AppSettingsUpdate): AppSettings {
  const current = getSettings();
  const next: AppSettings = {
    defaultModel: patch.defaultModel ?? current.defaultModel,
    workerModel: patch.workerModel ?? current.workerModel,
  };
  getDb()
    .prepare(`
      INSERT OR REPLACE INTO app_settings (id, default_model, worker_model)
      VALUES (1, @defaultModel, @workerModel)
    `)
    .run({ defaultModel: next.defaultModel, workerModel: next.workerModel });
  return next;
}
