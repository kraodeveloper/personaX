/**
 * personaX server 入口。
 * 初始化 DB → 注册插件 → 监听。
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb } from './store/db.js';

// 可选:加载 packages/server/.env(放 CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY 等)。
// 文件不存在则忽略,零依赖(Node 内置)。
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(serverRoot, '.env'));
  console.log('[env] 已加载 packages/server/.env');
} catch {
  /* 无 .env,忽略 */
}
import agentsPlugin from './api/agents.js';
import basesPlugin from './api/bases.js';
import skillsPlugin from './api/skills.js';
import mcpPlugin from './api/mcp.js';
import runsPlugin from './api/runs.js';
import patchesPlugin from './api/patches.js';
import modelsPlugin from './api/models.js';
import settingsPlugin from './api/settings.js';
import usagePlugin from './api/usage.js';
import chatsPlugin from './api/chats.js';

// 初始化 SQLite(建表、WAL)
initDb();

const fastify = Fastify({ logger: true });

// 开发阶段放开跨域
await fastify.register(cors, { origin: true });

// Agent 注册表路由
await fastify.register(agentsPlugin);

// 知识库路由
await fastify.register(basesPlugin);

// Skill 管理路由
await fastify.register(skillsPlugin);

// MCP server 管理路由
await fastify.register(mcpPlugin);

// Run 运行时 + SSE 路由
await fastify.register(runsPlugin);

// Patch 治理路由
await fastify.register(patchesPlugin);

// 模型目录路由
await fastify.register(modelsPlugin);

// 全局设置 + 供应商状态路由
await fastify.register(settingsPlugin);

// 用量事件路由
await fastify.register(usagePlugin);

// 对话(1V1 直聊)路由
await fastify.register(chatsPlugin);

// 健康检查
fastify.get('/health', async () => ({ status: 'ok' }));

// 启动监听
const port = Number(process.env.PORT) || 8787;
const host = '127.0.0.1';

await fastify.listen({ port, host });
console.log(`personaX server 已启动: http://${host}:${port}`);
