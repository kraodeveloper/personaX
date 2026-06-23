import type { AgentMemory } from '@personax/contracts'
import { ApiError } from './client'

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

/** patch promote 返回体 */
export interface PromoteResult {
  patch: unknown
}

/** 获取某 agent 的记忆 */
export function getMemory(agentId: string): Promise<AgentMemory> {
  return request<AgentMemory>(`/agents/${encodeURIComponent(agentId)}/memory`)
}

/** 保存某 agent 的记忆 */
export function saveMemory(agentId: string, content: string): Promise<AgentMemory> {
  return request<AgentMemory>(`/agents/${encodeURIComponent(agentId)}/memory`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
}

/** 提升记忆为待审 Knowledge patch(未绑定库时后端返回 400) */
export function promoteMemory(agentId: string): Promise<PromoteResult> {
  return request<PromoteResult>(`/agents/${encodeURIComponent(agentId)}/memory/promote`, {
    method: 'POST',
  })
}
