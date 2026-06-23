import type { Run, RunEvent } from '@personax/contracts'
import { ApiError } from './client'

const BASE = '/api'

/** 通用 fetch 封装,非 2xx 抛 ApiError */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (res.status === 204) return undefined as unknown as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
  }
  return data as T
}

/** POST /api/runs — 新建任务 */
export function createRun(task: string): Promise<{ id: string } & Partial<Run>> {
  return request<{ id: string } & Partial<Run>>('/runs', {
    method: 'POST',
    body: JSON.stringify({ task }),
  })
}

/** GET /api/runs/:id — 获取单次 run */
export function getRun(id: string): Promise<Run> {
  return request<Run>(`/runs/${encodeURIComponent(id)}`)
}

/**
 * GET /api/runs/:id/stream — SSE 流式消费。
 * 返回关闭函数;收到 run_finished/error 后自动关闭。
 */
export function streamRun(
  id: string,
  onEvent: (ev: RunEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/runs/${encodeURIComponent(id)}/stream`)

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as RunEvent
      onEvent(ev)
      if (ev.type === 'run_finished' || ev.type === 'error') {
        es.close()
      }
    } catch {
      // ignore malformed event
    }
  }

  es.onerror = () => {
    es.close()
  }

  return () => es.close()
}
