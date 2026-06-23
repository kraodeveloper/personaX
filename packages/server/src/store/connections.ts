/**
 * 连接(Connection)数据访问层。
 *
 * 两种连接:
 * - subscription:内置虚拟连接(id='subscription'),不入库;凭据来自 .env(OAuth/订阅)。
 * - api_relay:用户自建 API 中转,存 connections 表(含明文 key,仅内部运行时注入用)。
 *
 * 对外读取(listConnections / getConnection)一律掩码,不回明文 key。
 * getConnectionRaw 是内部接口,含明文 key,供运行时按连接注入凭据。
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type {
  Connection,
  ConnectionCreate,
  ConnectionUpdate,
} from '@personax/contracts';

/** 内置订阅连接 id(虚拟,不入库)。 */
export const SUBSCRIPTION_ID = 'subscription';

/** 内置订阅连接(对外展示用,无 baseUrl / key)。 */
const SUBSCRIPTION_CONNECTION: Connection = {
  id: SUBSCRIPTION_ID,
  label: 'Claude 订阅',
  type: 'subscription',
};

// ---------- Row 类型 ----------

interface ConnectionRow {
  id: string;
  label: string;
  type: string;
  base_url: string | null;
  api_key: string | null;
  created_at: string | null;
}

/** 内部:含明文 key 的连接(运行时注入用)。 */
export interface ConnectionRaw {
  id: string;
  type: Connection['type'];
  baseUrl?: string;
  apiKey?: string;
}

// ---------- 掩码 ----------

/** 把明文 key 掩码:前 5 + … + 后 4。短 key 退化为前缀 + …。 */
function maskKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 9) return `${key.slice(0, Math.min(5, key.length))}…`;
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

/** 行 → 对外 Connection(掩码 key)。 */
function rowToConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    label: row.label,
    type: row.type as Connection['type'],
    baseUrl: row.base_url ?? undefined,
    apiKeyMasked: maskKey(row.api_key),
    createdAt: row.created_at ?? undefined,
  };
}

// ---------- 读取(对外,掩码) ----------

/** 列出所有连接:内置订阅 + 存储的 api_relay 行(掩码)。 */
export function listConnections(): Connection[] {
  const rows = getDb()
    .prepare('SELECT * FROM connections ORDER BY rowid')
    .all() as ConnectionRow[];
  return [SUBSCRIPTION_CONNECTION, ...rows.map(rowToConnection)];
}

/** 按 id 查询(含订阅虚拟连接);掩码。不存在返回 undefined。 */
export function getConnection(id: string): Connection | undefined {
  if (id === SUBSCRIPTION_ID) return SUBSCRIPTION_CONNECTION;
  const row = getDb()
    .prepare('SELECT * FROM connections WHERE id = ?')
    .get(id) as ConnectionRow | undefined;
  return row ? rowToConnection(row) : undefined;
}

// ---------- 读取(内部,含明文 key) ----------

/**
 * 内部接口:取连接的原始凭据(含明文 key),供运行时按连接注入子进程环境。
 * 订阅 → 返回 {type:'subscription'};不存在 → undefined。
 */
export function getConnectionRaw(id: string): ConnectionRaw | undefined {
  if (id === SUBSCRIPTION_ID) {
    return { id: SUBSCRIPTION_ID, type: 'subscription' };
  }
  const row = getDb()
    .prepare('SELECT * FROM connections WHERE id = ?')
    .get(id) as ConnectionRow | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    type: row.type as Connection['type'],
    baseUrl: row.base_url ?? undefined,
    apiKey: row.api_key ?? undefined,
  };
}

// ---------- 写入 ----------

/** 创建一个 api_relay 连接;存明文 key,返回掩码视图。 */
export function createConnection(input: ConnectionCreate): Connection {
  const db = getDb();
  const id = `conn_${nanoid()}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO connections (id, label, type, base_url, api_key, created_at)
    VALUES (@id, @label, 'api_relay', @baseUrl, @apiKey, @createdAt)
  `).run({
    id,
    label: input.label,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    createdAt,
  });

  return {
    id,
    label: input.label,
    type: 'api_relay',
    baseUrl: input.baseUrl,
    apiKeyMasked: maskKey(input.apiKey),
    createdAt,
  };
}

/**
 * 更新一个 api_relay 连接(部分字段)。
 * apiKey 传则更新,不传则保留原明文。订阅不可改 / 不存在 → undefined。
 */
export function updateConnection(id: string, patch: ConnectionUpdate): Connection | undefined {
  if (id === SUBSCRIPTION_ID) return undefined;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM connections WHERE id = ?')
    .get(id) as ConnectionRow | undefined;
  if (!row) return undefined;

  const nextLabel = patch.label ?? row.label;
  const nextBaseUrl = patch.baseUrl ?? row.base_url;
  const nextApiKey = patch.apiKey ?? row.api_key; // 未传则保留原明文

  db.prepare(`
    UPDATE connections SET
      label    = @label,
      base_url = @baseUrl,
      api_key  = @apiKey
    WHERE id = @id
  `).run({
    id,
    label: nextLabel,
    baseUrl: nextBaseUrl,
    apiKey: nextApiKey,
  });

  return {
    id,
    label: nextLabel,
    type: 'api_relay',
    baseUrl: nextBaseUrl ?? undefined,
    apiKeyMasked: maskKey(nextApiKey),
    createdAt: row.created_at ?? undefined,
  };
}

/**
 * 删除一个连接。订阅不可删 → false。
 * 影响行数 > 0 → true;否则 false。
 */
export function deleteConnection(id: string): boolean {
  if (id === SUBSCRIPTION_ID) return false;
  const result = getDb()
    .prepare('DELETE FROM connections WHERE id = ?')
    .run(id);
  return result.changes > 0;
}
