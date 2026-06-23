import type { Chat, ChatWithMessages, ChatEvent } from '@personax/contracts'
import { ApiError } from './client'

const BASE = '/api'

/** 获取某 agent 的所有对话列表 */
export function listChats(agentId: string): Promise<Chat[]> {
  return fetch(`${BASE}/agents/${encodeURIComponent(agentId)}/chats`, {
    headers: { 'Content-Type': 'application/json' },
  }).then(async (res) => {
    if (res.status === 204) return [] as Chat[]
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
      throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
    }
    return data as Chat[]
  })
}

/** 新建一个空对话 */
export function createChat(agentId: string): Promise<Chat> {
  return fetch(`${BASE}/agents/${encodeURIComponent(agentId)}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
      throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
    }
    return data as Chat
  })
}

/** 获取对话详情(含消息列表) */
export function getChat(chatId: string): Promise<ChatWithMessages> {
  return fetch(`${BASE}/chats/${encodeURIComponent(chatId)}`, {
    headers: { 'Content-Type': 'application/json' },
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
      throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
    }
    return data as ChatWithMessages
  })
}

/** 删除对话 */
export function deleteChat(chatId: string): Promise<void> {
  return fetch(`${BASE}/chats/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  }).then(async (res) => {
    if (res.status === 204) return
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
      throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
    }
  })
}

/**
 * 发送消息并流式读取 SSE 响应(POST + ReadableStream,非 EventSource)。
 * 每次收到 ChatEvent 时调用 onEvent 回调;遇到 done/error 时解析结束。
 */
export async function sendMessage(
  chatId: string,
  text: string,
  onEvent: (ev: ChatEvent) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/chats/${encodeURIComponent(chatId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg, (data as { details?: unknown }).details)
  }

  if (!res.body) {
    throw new Error('响应没有 body stream')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 按 SSE 双换行分割事件块
    const blocks = buffer.split('\n\n')
    // 最后一块可能不完整,留到下次
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      // 每个事件块可能是多行,取 "data: " 开头的行
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue
          try {
            const ev = JSON.parse(jsonStr) as ChatEvent
            onEvent(ev)
            if (ev.type === 'done' || ev.type === 'error') {
              reader.cancel()
              return
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }
  }
}
