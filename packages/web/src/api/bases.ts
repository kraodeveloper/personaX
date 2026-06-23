import type {
  KnowledgeBase,
  KnowledgeBaseCreate,
  BaseVersion,
  BaseVersionWithContent,
  BaseVersionCreate,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

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

export function listBases(): Promise<KnowledgeBase[]> {
  return request<KnowledgeBase[]>('/bases')
}

export function getBase(id: string): Promise<KnowledgeBase> {
  return request<KnowledgeBase>(`/bases/${encodeURIComponent(id)}`)
}

export function createBase(body: KnowledgeBaseCreate): Promise<KnowledgeBase> {
  return request<KnowledgeBase>('/bases', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function listVersions(baseId: string): Promise<BaseVersion[]> {
  return request<BaseVersion[]>(`/bases/${encodeURIComponent(baseId)}/versions`)
}

export function getVersion(baseId: string, version: number): Promise<BaseVersionWithContent> {
  return request<BaseVersionWithContent>(`/bases/${encodeURIComponent(baseId)}/versions/${version}`)
}

export function createVersion(baseId: string, body: BaseVersionCreate): Promise<BaseVersionWithContent> {
  return request<BaseVersionWithContent>(`/bases/${encodeURIComponent(baseId)}/versions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
