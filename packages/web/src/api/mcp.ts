import type {
  McpServerConfig,
  McpServerCreate,
  McpServerUpdate,
  McpImport,
  McpTestResult,
} from '@personax/contracts'

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

export function listMcp(): Promise<McpServerConfig[]> {
  return request<McpServerConfig[]>('/mcp')
}

export function getMcp(id: string): Promise<McpServerConfig> {
  return request<McpServerConfig>(`/mcp/${encodeURIComponent(id)}`)
}

export function createMcp(body: McpServerCreate): Promise<McpServerConfig> {
  return request<McpServerConfig>('/mcp', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateMcp(id: string, body: McpServerUpdate): Promise<McpServerConfig> {
  return request<McpServerConfig>(`/mcp/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteMcp(id: string): Promise<void> {
  return request<void>(`/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function importMcp(body: McpImport): Promise<McpServerConfig> {
  return request<McpServerConfig>('/mcp/import', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function testMcp(id: string): Promise<McpTestResult> {
  return request<McpTestResult>(`/mcp/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  })
}
