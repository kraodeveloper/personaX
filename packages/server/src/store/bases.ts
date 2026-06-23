/**
 * 知识库(KnowledgeBase)与版本(BaseVersion)数据访问层。
 * row(snake_case) ↔ 类型(camelCase),NULL → undefined。
 * createVersion 用 better-sqlite3 事务保证原子性。
 */
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, getBasesDir } from './db.js';
import { DuplicateError } from './agents.js';
import type {
  KnowledgeBase,
  KnowledgeBaseCreate,
  BaseVersion,
  BaseVersionCreate,
  BaseVersionWithContent,
} from '@personax/contracts';

// ---------- Row 类型 ----------

interface BaseRow {
  id: string;
  domain: string;
  kind: string;
  latest_version: number;
  active_version: number;
}

interface VersionRow {
  base_id: string;
  version: number;
  fingerprint: string;
  content_path: string;
  status: string;
  created_at: string;
  reason: string | null;
  source_patch_id: string | null;
}

// ---------- 行映射 ----------

function rowToBase(row: BaseRow): KnowledgeBase {
  return {
    id: row.id,
    domain: row.domain,
    kind: row.kind as KnowledgeBase['kind'],
    latestVersion: row.latest_version,
    activeVersion: row.active_version,
  };
}

function rowToVersion(row: VersionRow): BaseVersion {
  return {
    baseId: row.base_id,
    version: row.version,
    fingerprint: row.fingerprint,
    contentPath: row.content_path,
    status: row.status as BaseVersion['status'],
    createdAt: row.created_at,
    reason: row.reason ?? undefined,
    sourcePatchId: row.source_patch_id ?? undefined,
  };
}

// ---------- CRUD ----------

/** 列出所有知识库 */
export function listBases(): KnowledgeBase[] {
  const rows = getDb()
    .prepare('SELECT * FROM knowledge_bases ORDER BY rowid')
    .all() as BaseRow[];
  return rows.map(rowToBase);
}

/** 按 id 查询知识库,不存在返回 undefined */
export function getBase(id: string): KnowledgeBase | undefined {
  const row = getDb()
    .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
    .get(id) as BaseRow | undefined;
  return row ? rowToBase(row) : undefined;
}

/**
 * 创建知识库。latestVersion=0, activeVersion=0。
 * id 重复抛 DuplicateError。
 */
export function createBase(input: KnowledgeBaseCreate): KnowledgeBase {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM knowledge_bases WHERE id = ?')
    .get(input.id);
  if (existing) throw new DuplicateError(input.id);

  db.prepare(`
    INSERT INTO knowledge_bases (id, domain, kind, latest_version, active_version)
    VALUES (@id, @domain, @kind, 0, 0)
  `).run({ id: input.id, domain: input.domain, kind: input.kind });

  return { ...input, latestVersion: 0, activeVersion: 0 };
}

/** 列出某知识库的所有版本,按 version 降序 */
export function listVersions(baseId: string): BaseVersion[] {
  const rows = getDb()
    .prepare('SELECT * FROM base_versions WHERE base_id = ? ORDER BY version DESC')
    .all(baseId) as VersionRow[];
  return rows.map(rowToVersion);
}

/** 查询特定版本,含文件内容。不存在返回 undefined */
export function getVersion(
  baseId: string,
  version: number,
): BaseVersionWithContent | undefined {
  const row = getDb()
    .prepare('SELECT * FROM base_versions WHERE base_id = ? AND version = ?')
    .get(baseId, version) as VersionRow | undefined;
  if (!row) return undefined;

  const content = readFileSync(row.content_path, 'utf8');
  return { ...rowToVersion(row), content };
}

/**
 * 创建并发布新版本(事务):
 * 1. 计算 fingerprint = sha256(content)
 * 2. 内容寻址写盘(存绝对路径,相同 fingerprint 复用)
 * 3. version = base.latestVersion + 1
 * 4. 插入 base_versions(status=published)
 * 5. 将该 base 其他 published 版本置 superseded
 * 6. 更新 knowledge_bases.latest_version / active_version
 *
 * base 不存在返回 undefined。
 */
export function createVersion(
  baseId: string,
  input: BaseVersionCreate,
): BaseVersionWithContent | undefined {
  const db = getDb();

  const txn = db.transaction(() => {
    const baseRow = db
      .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
      .get(baseId) as BaseRow | undefined;
    if (!baseRow) return undefined;

    const fingerprint = createHash('sha256').update(input.content, 'utf8').digest('hex');
    const contentPath = path.join(getBasesDir(), `${fingerprint}.md`);

    // 内容寻址:文件不存在才写
    if (!existsSync(contentPath)) {
      writeFileSync(contentPath, input.content, 'utf8');
    }

    const newVersion = baseRow.latest_version + 1;
    const createdAt = new Date().toISOString();

    // 插入新版本
    db.prepare(`
      INSERT INTO base_versions
        (base_id, version, fingerprint, content_path, status, created_at, reason, source_patch_id)
      VALUES
        (@baseId, @version, @fingerprint, @contentPath, 'published', @createdAt, @reason, NULL)
    `).run({
      baseId,
      version: newVersion,
      fingerprint,
      contentPath,
      createdAt,
      reason: input.reason ?? null,
    });

    // 将之前 published 的版本全部置 superseded
    db.prepare(`
      UPDATE base_versions
      SET status = 'superseded'
      WHERE base_id = ? AND version != ? AND status = 'published'
    `).run(baseId, newVersion);

    // 更新知识库元数据
    db.prepare(`
      UPDATE knowledge_bases
      SET latest_version = @v, active_version = @v
      WHERE id = @id
    `).run({ v: newVersion, id: baseId });

    const versionResult: BaseVersionWithContent = {
      baseId,
      version: newVersion,
      fingerprint,
      contentPath,
      status: 'published',
      createdAt,
      reason: input.reason,
      content: input.content,
    };
    return versionResult;
  });

  return txn() as BaseVersionWithContent | undefined;
}
