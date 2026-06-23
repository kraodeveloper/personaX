/**
 * BasePatch 数据访问层。
 * base_patches 表的 CRUD。
 * row(snake_case) ↔ BasePatch(camelCase);
 * auto_eligible INTEGER ↔ boolean;evidence_json ↔ string[]。
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type { BasePatch, BasePatchCreate, BasePatchStatus } from '@personax/contracts';

// ---------- Row 类型 ----------

interface PatchRow {
  id: string;
  base_id: string;
  from_run_id: string;
  proposal: string;
  evidence_json: string;
  status: string;
  auto_eligible: number;
  created_at: string;
}

// ---------- 行映射 ----------

function rowToPatch(row: PatchRow): BasePatch {
  return {
    id: row.id,
    baseId: row.base_id,
    fromRunId: row.from_run_id,
    proposal: row.proposal,
    evidenceRefs: JSON.parse(row.evidence_json) as string[],
    status: row.status as BasePatchStatus,
    autoEligible: row.auto_eligible !== 0,
    createdAt: row.created_at,
  };
}

// ---------- CRUD ----------

/**
 * 创建 patch。id = patch_xxx,status = 'pending'。
 * input 含 baseId(由调用者提供),fromRunId,proposal,evidenceRefs,autoEligible。
 */
export function createPatch(
  input: BasePatchCreate & { baseId: string; autoEligible: boolean },
): BasePatch {
  const id = `patch_${nanoid()}`;
  const createdAt = new Date().toISOString();

  getDb()
    .prepare(`
      INSERT INTO base_patches
        (id, base_id, from_run_id, proposal, evidence_json, status, auto_eligible, created_at)
      VALUES
        (@id, @baseId, @fromRunId, @proposal, @evidenceJson, 'pending', @autoEligible, @createdAt)
    `)
    .run({
      id,
      baseId: input.baseId,
      fromRunId: input.fromRunId,
      proposal: input.proposal,
      evidenceJson: JSON.stringify(input.evidenceRefs),
      autoEligible: input.autoEligible ? 1 : 0,
      createdAt,
    });

  return {
    id,
    baseId: input.baseId,
    fromRunId: input.fromRunId,
    proposal: input.proposal,
    evidenceRefs: input.evidenceRefs,
    status: 'pending',
    autoEligible: input.autoEligible,
    createdAt,
  };
}

/** 列出某知识库的所有 patch,按 createdAt 降序 */
export function listPatchesByBase(baseId: string): BasePatch[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM base_patches WHERE base_id = ? ORDER BY created_at DESC',
    )
    .all(baseId) as PatchRow[];
  return rows.map(rowToPatch);
}

/** 按 id 查询 patch,不存在返回 undefined */
export function getPatch(id: string): BasePatch | undefined {
  const row = getDb()
    .prepare('SELECT * FROM base_patches WHERE id = ?')
    .get(id) as PatchRow | undefined;
  return row ? rowToPatch(row) : undefined;
}

/**
 * 更新 patch 状态。
 * 不存在返回 undefined;存在则更新并返回新 patch。
 */
export function setPatchStatus(
  id: string,
  status: BasePatchStatus,
): BasePatch | undefined {
  const result = getDb()
    .prepare('UPDATE base_patches SET status = ? WHERE id = ?')
    .run(status, id);
  if (result.changes === 0) return undefined;
  return getPatch(id);
}
