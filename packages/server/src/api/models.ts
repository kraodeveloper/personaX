/**
 * Fastify 插件:GET /models — 实时拉取 Anthropic Models API 并归一化为 ModelInfo[]。
 * 内存缓存 ~5 分钟;无凭据/请求失败时返回 []。
 *
 * 实现上使用 Node.js 内置 http/https/tls 模块,通过 HTTP CONNECT 隧道兼容系统代理
 * (HTTPS_PROXY 环境变量),因为 Node 原生 fetch() 不读取系统代理设置。
 */
import type { FastifyPluginAsync } from 'fastify';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import type { ModelInfo } from '@personax/contracts';
import { getConnectionRaw } from '../store/connections.js';
import { getSettings } from '../store/settings.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

let cachedModels: ModelInfo[] | null = null;
let cacheExpiresAt = 0;

/** 拉取目标:host + path + headers + 是否中转。 */
interface ModelsTarget {
  host: string;
  path: string;
  headers: Record<string, string>;
  relay: boolean; // true=api_relay(模型 id 不强制 claude 前缀)
}

/**
 * 按默认连接解析 /v1/models 的拉取目标:
 * - subscription:api.anthropic.com + OAuth(oauth beta)。
 * - api_relay:<baseUrl>/v1/models + x-api-key。
 * 无凭据 / 解析不到 → null。
 */
function resolveModelsTarget(): ModelsTarget | null {
  const conn = getConnectionRaw(getSettings().defaultConnectionId);

  // api_relay:走中转 baseUrl + x-api-key
  if (conn && conn.type === 'api_relay' && conn.baseUrl && conn.apiKey) {
    let url: URL;
    try {
      url = new URL(conn.baseUrl);
    } catch {
      return null;
    }
    // baseUrl 可能带或不带尾斜杠/路径;统一在其 pathname 后接 /v1/models
    const base = url.pathname.replace(/\/+$/, '');
    return {
      host: url.host,
      path: `${base}/v1/models`,
      headers: {
        'x-api-key': conn.apiKey,
        'anthropic-version': '2023-06-01',
      },
      relay: true,
    };
  }

  // subscription:走 .env 的订阅凭据(优先 OAuth,回退 ANTHROPIC_API_KEY)
  const oauth = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (oauth) {
    return {
      host: 'api.anthropic.com',
      path: '/v1/models',
      headers: {
        'Authorization': `Bearer ${oauth}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
      },
      relay: false,
    };
  }
  if (apiKey) {
    return {
      host: 'api.anthropic.com',
      path: '/v1/models',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      relay: false,
    };
  }
  return null;
}

/**
 * 发起 HTTPS GET 请求到 <targetHost><targetPath>。
 * 自动检测 HTTPS_PROXY / https_proxy 环境变量,如有则通过 CONNECT 隧道转发。
 */
async function httpsGetModels(target: ModelsTarget): Promise<{ status: number; body: string }> {
  const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy;
  const targetHost = target.host;
  const targetPath = target.path;
  const headers = target.headers;

  if (proxyEnv) {
    const proxyUrl = new URL(proxyEnv);
    return new Promise((resolve, reject) => {
      // Step 1: CONNECT 隧道
      const connectReq = http.request({
        host: proxyUrl.hostname,
        port: Number(proxyUrl.port) || 8080,
        method: 'CONNECT',
        path: `${targetHost}:443`,
        headers: { Host: `${targetHost}:443` },
      });
      connectReq.setTimeout(10000, () => { connectReq.destroy(); reject(new Error('proxy CONNECT timeout')); });
      connectReq.on('error', reject);
      connectReq.on('connect', (_res, socket) => {
        if (_res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`proxy CONNECT failed: ${_res.statusCode}`));
          return;
        }
        // Step 2: TLS over tunnel
        const tlsSocket = tls.connect({ socket, servername: targetHost }, () => {
          // Step 3: HTTPS request over tunnel
          const req = https.request({
            createConnection: () => tlsSocket,
            hostname: targetHost,
            port: 443,
            path: targetPath,
            method: 'GET',
            headers,
          }, (res) => {
            let body = '';
            res.on('data', (d: Buffer) => { body += d.toString(); });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
          });
          req.on('error', reject);
          req.end();
        });
        tlsSocket.on('error', reject);
      });
      connectReq.end();
    });
  }

  // 无代理:直连
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: targetHost,
      port: 443,
      path: targetPath,
      method: 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', (d: Buffer) => { body += d.toString(); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('request timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function fetchModels(): Promise<ModelInfo[]> {
  // 命中缓存
  if (cachedModels !== null && Date.now() < cacheExpiresAt) {
    return cachedModels;
  }

  const target = resolveModelsTarget();
  if (!target) {
    return cachedModels ?? [];
  }

  try {
    const { status, body } = await httpsGetModels(target);
    if (status !== 200) {
      console.error(`[models] Models API 返回 ${status}: ${body.slice(0, 200)}`);
      return cachedModels ?? [];
    }

    const json = JSON.parse(body) as { data?: unknown[] };
    const raw = Array.isArray(json.data) ? json.data : [];

    const models: ModelInfo[] = [];
    for (const m of raw) {
      const item = m as {
        id?: string;
        display_name?: string;
        max_input_tokens?: number;
        max_tokens?: number;
      };
      if (typeof item.id !== 'string') continue;
      // 订阅只收 claude*;中转放行任意模型 id
      if (!target.relay && !item.id.startsWith('claude')) continue;
      models.push({
        id: item.id,
        displayName: item.display_name ?? item.id,
        contextWindow: typeof item.max_input_tokens === 'number' ? item.max_input_tokens : 0,
        maxOutput: typeof item.max_tokens === 'number' ? item.max_tokens : 0,
      });
    }

    cachedModels = models;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return models;
  } catch (err) {
    console.error('[models] 拉取模型列表失败:', err);
    return cachedModels ?? [];
  }
}

/**
 * 从已缓存的模型目录查询某模型的 contextWindow。
 * 若缓存为空则尝试触发一次加载(async,不等待);
 * 无凭据/查不到时返回 undefined,不抛错。
 */
export function getModelContextWindow(modelId: string): number | undefined {
  if (cachedModels !== null) {
    const found = cachedModels.find((m) => m.id === modelId);
    return found?.contextWindow;
  }
  // 缓存尚未填充:异步触发一次加载(不阻塞调用方)
  fetchModels().catch(() => { /* 静默忽略 */ });
  return undefined;
}

const modelsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/models', async (_req, reply) => {
    const models = await fetchModels();
    return reply.code(200).send(models);
  });
};

export default modelsPlugin;
