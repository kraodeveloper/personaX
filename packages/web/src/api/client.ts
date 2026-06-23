import type {
  AgentDefinition,
  AgentDefinitionCreate,
  AgentDefinitionUpdate,
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

/** 获取全部 agent 列表 */
export function listAgents(): Promise<AgentDefinition[]> {
  return request<AgentDefinition[]>('/agents')
}

/** 获取单个 agent */
export function getAgent(id: string): Promise<AgentDefinition> {
  return request<AgentDefinition>(`/agents/${encodeURIComponent(id)}`)
}

/** 新建 agent */
export function createAgent(body: AgentDefinitionCreate): Promise<AgentDefinition> {
  return request<AgentDefinition>('/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** 更新 agent */
export function updateAgent(id: string, body: AgentDefinitionUpdate): Promise<AgentDefinition> {
  return request<AgentDefinition>(`/agents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 删除 agent (返回 void,后端 204) */
export function deleteAgent(id: string): Promise<void> {
  return request<void>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
