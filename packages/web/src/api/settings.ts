import type {
  ModelInfo, AppSettings, AppSettingsUpdate, ProviderStatus,
  FeishuConfig, FeishuConfigUpdate,
} from '@personax/contracts'

/** API 错误,带后端返回的 error 字符串 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = '/api'

/** 通用 fetch 封装,非 2xx 抛 ApiError */
async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  // 204 No Content — 无 body
  if (res.status === 204) {
    return undefined as unknown as T
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
  }

  return data as T
}

/** 获取模型列表 */
export function getModels(): Promise<ModelInfo[]> {
  return request<ModelInfo[]>('/models')
}

/** 获取全局设置 */
export function getSettings(): Promise<AppSettings> {
  return request<AppSettings>('/settings')
}

/** 更新全局设置(部分更新) */
export function updateSettings(body: AppSettingsUpdate): Promise<AppSettings> {
  return request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 获取供应商状态 */
export function getProvider(): Promise<ProviderStatus> {
  return request<ProviderStatus>('/provider')
}

/** 获取飞书集成配置 */
export function getFeishuConfig(): Promise<FeishuConfig> {
  return request<FeishuConfig>('/integrations/feishu/config')
}

/** 更新飞书集成配置(部分更新) */
export function updateFeishuConfig(patch: FeishuConfigUpdate): Promise<FeishuConfig> {
  return request<FeishuConfig>('/integrations/feishu/config', {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}
