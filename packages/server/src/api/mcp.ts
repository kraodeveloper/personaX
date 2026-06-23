/**
 * Fastify 插件:MCP server 管理 REST 路由。
 * 请求体用 contracts zod schema safeParse 校验,失败返回 400。
 * 错误响应形状 { error, details? }。
 *
 * POST /mcp/:id/test:Slice 3 基础探活(完整 MCP 握手将在 Slice 4 接入)。
 */
import { spawn } from 'node:child_process';
import type { FastifyPluginAsync } from 'fastify';
import {
  McpServerCreateSchema,
  McpServerUpdateSchema,
  McpImportSchema,
} from '@personax/contracts';
import type { McpTestResult } from '@personax/contracts';
import {
  listMcp,
  getMcp,
  createMcp,
  updateMcp,
  deleteMcp,
  importMcp,
} from '../store/mcp.js';
import { DuplicateError } from '../store/agents.js';

const PROBE_TIMEOUT_MS = 3000;

const mcpPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /mcp — 列出所有 MCP server 配置
  fastify.get('/mcp', async (_req, reply) => {
    return reply.code(200).send(listMcp());
  });

  // GET /mcp/:id — 查询单个 MCP server
  fastify.get<{ Params: { id: string } }>('/mcp/:id', async (req, reply) => {
    const mcp = getMcp(req.params.id);
    if (!mcp) return reply.code(404).send({ error: `MCP server 不存在: ${req.params.id}` });
    return reply.code(200).send(mcp);
  });

  // POST /mcp — 创建 MCP server 配置
  fastify.post('/mcp', async (req, reply) => {
    const parsed = McpServerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    try {
      const mcp = createMcp(parsed.data);
      return reply.code(201).send(mcp);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: (err as Error).message });
      }
      throw err;
    }
  });

  // PUT /mcp/:id — 更新 MCP server 配置
  fastify.put<{ Params: { id: string } }>('/mcp/:id', async (req, reply) => {
    const parsed = McpServerUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    const mcp = updateMcp(req.params.id, parsed.data);
    if (!mcp) return reply.code(404).send({ error: `MCP server 不存在: ${req.params.id}` });
    return reply.code(200).send(mcp);
  });

  // DELETE /mcp/:id — 删除 MCP server 配置
  fastify.delete<{ Params: { id: string } }>('/mcp/:id', async (req, reply) => {
    const ok = deleteMcp(req.params.id);
    if (!ok) return reply.code(404).send({ error: `MCP server 不存在: ${req.params.id}` });
    return reply.code(204).send();
  });

  // POST /mcp/import — 导入 MCP server(从标准 config JSON 映射)
  fastify.post('/mcp/import', async (req, reply) => {
    const parsed = McpImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    try {
      const mcp = importMcp(parsed.data);
      return reply.code(201).send(mcp);
    } catch (err) {
      if (err instanceof DuplicateError) {
        return reply.code(409).send({ error: (err as Error).message });
      }
      if (err instanceof Error) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /mcp/:id/test — 基础探活
  // Slice 3:进程可启动性(stdio)/ HTTP 可达性(http/sse)。完整 MCP 握手在 Slice 4 接入。
  fastify.post<{ Params: { id: string } }>('/mcp/:id/test', async (req, reply) => {
    const mcp = getMcp(req.params.id);
    if (!mcp) return reply.code(404).send({ error: `MCP server 不存在: ${req.params.id}` });

    let result: McpTestResult;

    if (mcp.transport === 'stdio') {
      result = await probeStdio(mcp.command!, mcp.args ?? [], mcp.env);
    } else {
      result = await probeHttp(mcp.url!);
    }

    return reply.code(200).send(result);
  });
};

// ---------- 探活实现 ----------

/** stdio 探活:spawn 进程,3s 内未报 ENOENT/立即退出非0 → ok */
async function probeStdio(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<McpTestResult> {
  return new Promise((resolve) => {
    let settled = false;

    const child = spawn(command, args, {
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'pipe',
      shell: false,
    });

    const settle = (result: McpTestResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 确保子进程被清理
      try { child.kill(); } catch { /* already gone */ }
      resolve(result);
    };

    // 3s 超时:进程仍在运行 → 视为可启动
    const timer = setTimeout(() => {
      settle({
        ok: true,
        message: '进程可启动(完整 MCP 握手将在运行时接入)',
      });
    }, PROBE_TIMEOUT_MS);

    child.on('error', (err: NodeJS.ErrnoException) => {
      settle({ ok: false, message: `spawn 失败: ${err.message}` });
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      // 进程很快退出:0 或 null(被 signal) → 认为可启动;非0 视为启动失败
      if (code === 0 || code === null) {
        settle({
          ok: true,
          message: '进程可启动(完整 MCP 握手将在运行时接入)',
        });
      } else {
        settle({ ok: false, message: `进程退出,exit code ${code}` });
      }
    });
  });
}

/** http/sse 探活:GET 请求,3s AbortController 超时 */
async function probeHttp(url: string): Promise<McpTestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: true,
      message: `HTTP 可达(status ${res.status})(完整 MCP 握手将在运行时接入)`,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `HTTP 探活失败: ${msg}` };
  }
}

export default mcpPlugin;
