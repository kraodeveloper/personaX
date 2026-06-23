import type { Connection, ConnectionCreate, ConnectionUpdate } from '@personax/contracts'

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

/** 列出所有连接(含内置订阅) */
export function listConnections(): Promise<Connection[]> {
  return request<Connection[]>('/connections')
}

/** 新建中转连接(返回掩码) */
export function createConnection(body: ConnectionCreate): Promise<Connection> {
  return request<Connection>('/connections', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** 更新中转连接(部分更新;apiKey 传则更新,不传保留) */
export function updateConnection(id: string, body: ConnectionUpdate): Promise<Connection> {
  return request<Connection>(`/connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 删除中转连接(订阅会 400/404) */
export function deleteConnection(id: string): Promise<void> {
  return request<void>(`/connections/${id}`, {
    method: 'DELETE',
  })
}
