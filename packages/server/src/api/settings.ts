/**
 * Fastify 插件:全局设置 + 供应商状态。
 * GET  /settings       → AppSettings
 * PUT  /settings       → 校验后合并保存 → AppSettings | 400
 * GET  /provider       → ProviderStatus(不含任何密钥明文)
 */
import type { FastifyPluginAsync } from 'fastify';
import { AppSettingsUpdateSchema } from '@personax/contracts';
import { getSettings, updateSettings } from '../store/settings.js';

const settingsPlugin: FastifyPluginAsync = async (fastify) => {
  // GET /settings
  fastify.get('/settings', async (_req, reply) => {
    return reply.code(200).send(getSettings());
  });

  // PUT /settings
  fastify.put('/settings', async (req, reply) => {
    const parsed = AppSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: '请求体校验失败',
        details: parsed.error.flatten(),
      });
    }
    const updated = updateSettings(parsed.data);
    return reply.code(200).send(updated);
  });

  // GET /provider
  fastify.get('/provider', async (_req, reply) => {
    const hasOAuth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const authMethod = hasOAuth ? 'subscription' : hasApiKey ? 'api_key' : 'none';
    const authConfigured = hasOAuth || hasApiKey;

    return reply.code(200).send({
      provider: 'anthropic',
      authMethod,
      authConfigured,
    });
  });
};

export default settingsPlugin;
