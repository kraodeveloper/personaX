/**
 * Skill 数据访问层。
 * 唯一事实源:磁盘 <skillsRoot>/<id>/SKILL.md
 * DB 只存元数据(id, name, path, source, enabled)。
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getDb } from './db.js';
import { DuplicateError } from './agents.js';
import type { SkillDef, SkillWithContent, SkillCreate, SkillUpdate, SkillImport } from '@personax/contracts';

// ---------- skills 根目录 ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/store/skills.ts → 向上两级 = packages/server
const serverRoot = path.resolve(__dirname, '../..');

function getSkillsRoot(): string {
  return process.env.PERSONAX_SKILLS_DIR ?? path.join(serverRoot, '.claude', 'skills');
}

export { getSkillsRoot };

// ---------- Row 类型 ----------

interface SkillRow {
  id: string;
  name: string;
  path: string;
  source: string;
  enabled: number;
}

// ---------- 行映射 ----------

function rowToSkillDef(row: SkillRow): SkillDef {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    source: row.source as SkillDef['source'],
    enabled: row.enabled === 1,
  };
}

// ---------- frontmatter 解析 ----------

/**
 * 从 SKILL.md 内容中用简单正则解析 YAML frontmatter 的 name 和 id 字段。
 * frontmatter 为 ---\n...\n--- 块。
 */
function parseFrontmatter(content: string): { name?: string; id?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const idMatch = block.match(/^id:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : undefined,
    id: idMatch ? idMatch[1].trim() : undefined,
  };
}

/** 将字符串转为 URL-friendly slug(用作 id 缺省值) */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------- CRUD ----------

/** 列出所有 skill(仅元数据) */
export function listSkills(): SkillDef[] {
  const rows = getDb()
    .prepare('SELECT * FROM skills ORDER BY rowid')
    .all() as SkillRow[];
  return rows.map(rowToSkillDef);
}

/** 按 id 查询,含 SKILL.md 内容。不存在返回 undefined */
export function getSkill(id: string): SkillWithContent | undefined {
  const row = getDb()
    .prepare('SELECT * FROM skills WHERE id = ?')
    .get(id) as SkillRow | undefined;
  if (!row) return undefined;

  const content = existsSync(row.path) ? readFileSync(row.path, 'utf8') : '';
  return { ...rowToSkillDef(row), content };
}

/**
 * 创建 skill:建目录、写 SKILL.md、插 DB 行。
 * id 重复抛 DuplicateError。
 */
export function createSkill(input: SkillCreate): SkillDef {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM skills WHERE id = ?').get(input.id);
  if (existing) throw new DuplicateError(input.id);

  const skillsRoot = getSkillsRoot();
  mkdirSync(skillsRoot, { recursive: true });

  const skillDir = path.join(skillsRoot, input.id);
  mkdirSync(skillDir, { recursive: true });

  const skillPath = path.join(skillDir, 'SKILL.md');
  writeFileSync(skillPath, input.content, 'utf8');

  const skill: SkillDef = {
    id: input.id,
    name: input.name,
    path: skillPath,
    source: 'imported',
    enabled: input.enabled ?? true,
  };

  db.prepare(`
    INSERT INTO skills (id, name, path, source, enabled)
    VALUES (@id, @name, @path, @source, @enabled)
  `).run({
    id: skill.id,
    name: skill.name,
    path: skill.path,
    source: skill.source,
    enabled: skill.enabled ? 1 : 0,
  });

  return skill;
}

/**
 * 更新 skill:若 patch 含 content 则覆盖写 SKILL.md;
 * name/enabled 更新 DB。不存在返回 undefined。
 */
export function updateSkill(id: string, patch: SkillUpdate): SkillDef | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined;
  if (!row) return undefined;

  if (patch.content !== undefined) {
    writeFileSync(row.path, patch.content, 'utf8');
  }

  const updated: SkillDef = {
    id: row.id,
    name: patch.name ?? row.name,
    path: row.path,
    source: row.source as SkillDef['source'],
    enabled: patch.enabled !== undefined ? patch.enabled : row.enabled === 1,
  };

  db.prepare(`
    UPDATE skills SET name = @name, enabled = @enabled WHERE id = @id
  `).run({
    id: updated.id,
    name: updated.name,
    enabled: updated.enabled ? 1 : 0,
  });

  return updated;
}

/**
 * 删除 skill:删 DB 行 + 递归删 skill 目录。
 * 不存在返回 false。
 */
export function deleteSkill(id: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined;
  if (!row) return false;

  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(id);
  if (result.changes === 0) return false;

  // 递归删目录(skill dir = dirname(SKILL.md))
  const skillDir = path.dirname(row.path);
  if (existsSync(skillDir)) {
    rmSync(skillDir, { recursive: true, force: true });
  }

  return true;
}

/**
 * 导入 skill:从 content 的 YAML frontmatter 解析 id/name(如未显式给出)。
 * 本质等同 createSkill。
 */
export function importSkill(input: SkillImport): SkillDef {
  const fm = parseFrontmatter(input.content);

  const resolvedName = input.name ?? fm.name;
  const resolvedId = input.id ?? fm.id ?? (resolvedName ? slugify(resolvedName) : undefined);

  if (!resolvedId) {
    throw new Error('无法确定 skill id:请在 content frontmatter 或请求中提供 id 或 name');
  }
  if (!resolvedName) {
    throw new Error('无法确定 skill name:请在 content frontmatter 或请求中提供 name');
  }

  return createSkill({
    id: resolvedId,
    name: resolvedName,
    content: input.content,
    enabled: true,
  });
}
