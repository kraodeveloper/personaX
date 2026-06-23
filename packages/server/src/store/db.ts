/**
 * 数据库单例。ESM 环境下用 import.meta.url 推导 __dirname。
 * 启动时若 data/ 目录不存在则自动创建,然后执行建表。
 * DB 路径可通过环境变量 PERSONAX_DB 覆盖(用于测试隔离)。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ESM 下没有 __dirname,用 import.meta.url 手动推导
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB 路径:优先取环境变量,否则默认 packages/server/data/personax.db
const dbPath = process.env.PERSONAX_DB ?? path.join(path.resolve(__dirname, '../../data'), 'personax.db');

// 派生目录
const dataDir = path.dirname(dbPath);
const basesDir = path.join(dataDir, 'bases');

/** 返回 bases 内容文件目录 */
export function getBasesDir(): string {
  return basesDir;
}

// 初始化数据库连接(延迟到 initDb() 调用)
let _db: Database.Database | null = null;

/** 返回数据库单例,未初始化时抛错 */
export function getDb(): Database.Database {
  if (!_db) throw new Error('DB 未初始化,请先调用 initDb()');
  return _db;
}

/**
 * 打开 SQLite,启用 WAL,建表。
 * 在 index.ts 启动时调用一次。
 */
export function initDb(): Database.Database {
  // 确保 data 目录和 bases 目录存在
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(basesDir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id                  TEXT PRIMARY KEY,
      name                TEXT,
      kind                TEXT,
      domain              TEXT,
      base_id             TEXT,
      base_pin            TEXT,
      skills_json         TEXT,
      mcp_json            TEXT,
      tool_policy_json    TEXT,
      system_prompt_extra TEXT,
      status              TEXT,
      version             INTEGER,
      updated_at          TEXT,
      group_name          TEXT,
      model               TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id            INTEGER PRIMARY KEY CHECK(id=1),
      default_model TEXT,
      worker_model  TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id             TEXT PRIMARY KEY,
      domain         TEXT,
      kind           TEXT,
      latest_version INTEGER,
      active_version INTEGER
    );

    CREATE TABLE IF NOT EXISTS base_versions (
      base_id         TEXT,
      version         INTEGER,
      fingerprint     TEXT,
      content_path    TEXT,
      status          TEXT,
      created_at      TEXT,
      reason          TEXT,
      source_patch_id TEXT,
      PRIMARY KEY (base_id, version)
    );

    CREATE TABLE IF NOT EXISTS skills (
      id      TEXT PRIMARY KEY,
      name    TEXT,
      path    TEXT,
      source  TEXT,
      enabled INTEGER
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id           TEXT PRIMARY KEY,
      name         TEXT,
      transport    TEXT,
      command      TEXT,
      args_json    TEXT,
      env_json     TEXT,
      url          TEXT,
      headers_json TEXT,
      enabled      INTEGER
    );

    CREATE TABLE IF NOT EXISTS runs (
      id             TEXT PRIMARY KEY,
      task           TEXT,
      status         TEXT,
      forks_json     TEXT,
      claims_json    TEXT,
      final_delivery TEXT,
      created_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS base_patches (
      id             TEXT PRIMARY KEY,
      base_id        TEXT,
      from_run_id    TEXT,
      proposal       TEXT,
      evidence_json  TEXT,
      status         TEXT,
      auto_eligible  INTEGER,
      created_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id               TEXT PRIMARY KEY,
      run_id           TEXT,
      chat_id          TEXT,
      agent_id         TEXT,
      agent_kind       TEXT,
      model            TEXT,
      input_tokens     INTEGER,
      output_tokens    INTEGER,
      cache_read_tokens INTEGER,
      cost_usd         REAL,
      context_window   INTEGER,
      created_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS chats (
      id         TEXT PRIMARY KEY,
      agent_id   TEXT,
      title      TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id             TEXT PRIMARY KEY,
      chat_id        TEXT,
      role           TEXT,
      content        TEXT,
      model          TEXT,
      input_tokens   INTEGER,
      output_tokens  INTEGER,
      cost_usd       REAL,
      context_window INTEGER,
      created_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_memory (
      agent_id   TEXT PRIMARY KEY,
      content    TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS feishu_config (
      id       INTEGER PRIMARY KEY CHECK(id=1),
      enabled  INTEGER,
      agent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id         TEXT PRIMARY KEY,
      label      TEXT,
      type       TEXT,
      base_url   TEXT,
      api_key    TEXT,
      created_at TEXT
    );
  `);

  // 幂等迁移:为旧库安全加列(PRAGMA 检查后跳过 ALTER)
  {
    const cols = _db.prepare('PRAGMA table_info(agent_definitions)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'group_name')) {
      _db.exec('ALTER TABLE agent_definitions ADD COLUMN group_name TEXT');
    }
    if (!cols.some(c => c.name === 'model')) {
      _db.exec('ALTER TABLE agent_definitions ADD COLUMN model TEXT');
    }
    if (!cols.some(c => c.name === 'connection_id')) {
      _db.exec('ALTER TABLE agent_definitions ADD COLUMN connection_id TEXT');
    }
  }

  // 幂等迁移:app_settings 加 default_connection_id 列
  {
    const cols = _db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'default_connection_id')) {
      _db.exec('ALTER TABLE app_settings ADD COLUMN default_connection_id TEXT');
    }
  }

  return _db;
}

// 导出单例访问(路由层直接用 db,无需 getDb 包装)
export { getDb as db };
