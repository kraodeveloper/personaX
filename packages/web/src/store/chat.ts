import { create } from 'zustand'
import type { Chat, ChatMessage } from '@personax/contracts'
import { listChats, createChat, getChat, sendMessage } from '../api/chats'

interface ChatState {
  // 当前打开的 agent/chat
  currentAgentId: string | null
  currentChatId: string | null

  // 当前 agent 的对话列表
  chats: Chat[]
  chatsLoading: boolean
  chatsError: string | null

  // 当前对话的消息列表
  messages: ChatMessage[]
  messagesLoading: boolean
  messagesError: string | null

  // 流式状态
  streaming: boolean
  streamingThinking: string
  streamingText: string
  streamError: string | null

  // actions
  openAgentChat: (agentId: string) => Promise<void>
  newChat: (agentId: string) => Promise<void>
  selectChat: (chatId: string) => Promise<void>
  send: (text: string) => Promise<void>
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentAgentId: null,
  currentChatId: null,

  chats: [],
  chatsLoading: false,
  chatsError: null,

  messages: [],
  messagesLoading: false,
  messagesError: null,

  streaming: false,
  streamingThinking: '',
  streamingText: '',
  streamError: null,

  /**
   * 打开某 agent 的对话面板:拉取对话列表,选最近一条;无则自动新建。
   */
  openAgentChat: async (agentId: string) => {
    set({
      currentAgentId: agentId,
      currentChatId: null,
      chats: [],
      messages: [],
      chatsLoading: true,
      chatsError: null,
      messagesError: null,
      streamError: null,
      streamingThinking: '',
      streamingText: '',
    })
    try {
      const chats = await listChats(agentId)
      // 按 updatedAt 降序排列,最新在前
      const sorted = [...chats].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      set({ chats: sorted, chatsLoading: false })

      if (sorted.length > 0) {
        // 选最近一条
        await get().selectChat(sorted[0].id)
      } else {
        // 自动新建一条
        await get().newChat(agentId)
      }
    } catch (err) {
      set({
        chatsLoading: false,
        chatsError: err instanceof Error ? err.message : '加载对话列表失败',
      })
    }
  },

  /**
   * 新建空对话并切换到它。
   */
  newChat: async (agentId: string) => {
    set({ chatsLoading: true, chatsError: null })
    try {
      const chat = await createChat(agentId)
      set((s) => ({
        chats: [chat, ...s.chats],
        chatsLoading: false,
        currentChatId: chat.id,
        messages: [],
        messagesError: null,
        streamingThinking: '',
        streamingText: '',
        streamError: null,
      }))
    } catch (err) {
      set({
        chatsLoading: false,
        chatsError: err instanceof Error ? err.message : '新建对话失败',
      })
    }
  },

  /**
   * 切换到指定对话并加载历史消息。
   */
  selectChat: async (chatId: string) => {
    set({
      currentChatId: chatId,
      messages: [],
      messagesLoading: true,
      messagesError: null,
      streamingThinking: '',
      streamingText: '',
      streamError: null,
    })
    try {
      const detail = await getChat(chatId)
      set({ messages: detail.messages, messagesLoading: false })
    } catch (err) {
      set({
        messagesLoading: false,
        messagesError: err instanceof Error ? err.message : '加载消息失败',
      })
    }
  },

  /**
   * 发送用户消息,流式更新 assistant 回复。
   */
  send: async (text: string) => {
    const { currentChatId, streaming } = get()
    if (!currentChatId || streaming) return

    // 本地先插入 user 消息(临时 id)
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      chatId: currentChatId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    set((s) => ({
      messages: [...s.messages, userMsg],
      streaming: true,
      streamingThinking: '',
      streamingText: '',
      streamError: null,
    }))

    try {
      await sendMessage(currentChatId, text, (ev) => {
        if (ev.type === 'thinking_delta') {
          set((s) => ({ streamingThinking: s.streamingThinking + ev.text }))
        } else if (ev.type === 'text_delta') {
          set((s) => ({ streamingText: s.streamingText + ev.text }))
        } else if (ev.type === 'done') {
          // 将完整 assistant 消息落入 messages,清流式态
          set((s) => ({
            messages: [...s.messages, ev.message],
            streaming: false,
            streamingThinking: '',
            streamingText: '',
          }))
          // 更新对话列表中的 updatedAt
          const chatId = ev.message.chatId
          set((s) => ({
            chats: s.chats.map((c) =>
              c.id === chatId ? { ...c, updatedAt: new Date().toISOString() } : c,
            ),
          }))
        } else if (ev.type === 'error') {
          set({
            streaming: false,
            streamError: ev.message,
            streamingThinking: '',
            streamingText: '',
          })
        }
      })
    } catch (err) {
      set({
        streaming: false,
        streamError: err instanceof Error ? err.message : '发送失败',
        streamingThinking: '',
        streamingText: '',
      })
    }
  },

  reset: () => {
    set({
      currentAgentId: null,
      currentChatId: null,
      chats: [],
      chatsLoading: false,
      chatsError: null,
      messages: [],
      messagesLoading: false,
      messagesError: null,
      streaming: false,
      streamingThinking: '',
      streamingText: '',
      streamError: null,
    })
  },
}))
