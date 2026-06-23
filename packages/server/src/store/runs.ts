/**
 * Run 数据访问层。
 * runs 表的 JSON 列(forks_json / claims_json)整体序列化;
 * row(snake_case) ↔ Run(camelCase),NULL → undefined。
 * saveRun 用 INSERT ... ON CONFLICT 做整体 upsert。
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import type { Run, Claim, RunFork } from '@personax/contracts';

// ---------- Row 类型 ----------

interface RunRow {
  id: string;
  task: string;
  status: string;
  forks_json: string;
  claims_json: string;
  final_delivery: string | null;
  created_at: string;
}

// ---------- 行映射 ----------

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    task: row.task,
    status: row.status as Run['status'],
    forks: JSON.parse(row.forks_json) as RunFork[],
    claims: JSON.parse(row.claims_json) as Claim[],
    finalDelivery: row.final_delivery ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------- API ----------

/**
 * 创建 run:id = run_xxx,status='running',forks/claims 空。
 * 立即落库并返回内存对象。
 */
export function createRun(task: string): Run {
  const run: Run = {
    id: `run_${nanoid()}`,
    task,
    status: 'running',
    forks: [],
    claims: [],
    createdAt: new Date().toISOString(),
  };
  saveRun(run);
  return run;
}

/** 按 id 查询,不存在返回 undefined */
export function getRun(id: string): Run | undefined {
  const row = getDb()
    .prepare('SELECT * FROM runs WHERE id = ?')
    .get(id) as RunRow | undefined;
  return row ? rowToRun(row) : undefined;
}

/** 整体 upsert(JSON 列序列化)。运行过程中多次调用以持久化最新状态。 */
export function saveRun(run: Run): void {
  getDb()
    .prepare(`
      INSERT INTO runs (id, task, status, forks_json, claims_json, final_delivery, created_at)
      VALUES (@id, @task, @status, @forksJson, @claimsJson, @finalDelivery, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        task           = excluded.task,
        status         = excluded.status,
        forks_json     = excluded.forks_json,
        claims_json    = excluded.claims_json,
        final_delivery = excluded.final_delivery,
        created_at     = excluded.created_at
    `)
    .run({
      id: run.id,
      task: run.task,
      status: run.status,
      forksJson: JSON.stringify(run.forks),
      claimsJson: JSON.stringify(run.claims),
      finalDelivery: run.finalDelivery ?? null,
      createdAt: run.createdAt,
    });
}
