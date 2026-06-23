import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, X, ChevronDown, Tag,
  AlertCircle, Loader2, CheckCircle, Bot, MessageSquare,
  Send, ChevronRight, PlusCircle, NotebookPen, ArrowUpCircle, Link2,
} from 'lucide-react'
import type { AgentDefinition, AgentDefinitionCreate, AgentDefinitionUpdate, AgentKind, ChatMessage } from '@personax/contracts'
import { useAgentsStore } from '../store/agents'
import { useSettingsStore } from '../store/settings'
import { ApiError } from '../api/client'
import { getMemory, saveMemory, promoteMemory } from '../api/memory'
import { useChatStore } from '../store/chat'
import { UsageStat } from '../components/UsageStat'

// ─── tiny cn helper ───────────────────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ─── kind 色板 & 标签 ─────────────────────────────────────────────────────────

const KIND_COLORS: Record<AgentKind, string> = {
  lead:             '#c9a227',
  business_domain:  '#3b82f6',
  technical_domain: '#8b5cf6',
  worker:           '#10b981',
}

const kindBg: Record<AgentKind, string> = {
  lead:             '#fdf8e7',
  business_domain:  '#eff6ff',
  technical_domain: '#f5f3ff',
  worker:           '#f0fdf4',
}

const kindLabel: Record<AgentKind, string> = {
  lead:             'Lead',
  business_domain:  'Business',
  technical_domain: 'Technical',
  worker:           'Worker',
}

const KINDS: AgentKind[] = ['lead', 'business_domain', 'technical_domain', 'worker']

function getInitials(name: string): string {
  return name.replace(/\s/g, '').slice(0, 2).toUpperCase() || '??'
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

interface TagInputProps {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}

const TagInput: React.FC<TagInputProps> = ({ label, value, onChange, placeholder }) => {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setInput('')
  }

  const remove = (item: string) => onChange(value.filter((v) => v !== item))

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: '#374151' }}>{label}</label>
      <div
        className="flex flex-wrap gap-1.5 min-h-[38px] p-2 rounded-md transition-colors"
        style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}
        onFocus={() => {}}
      >
        {value.map((item) => (
          <span
            key={item}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}
          >
            <Tag className="w-3 h-3" style={{ color: '#9ca3af' }} />
            {item}
            <button
              type="button"
              onClick={() => remove(item)}
              className="ml-0.5 transition-colors"
              style={{ color: '#9ca3af' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af' }}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm p-0 focus:ring-0"
          style={{ color: '#111827' }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1])
          }}
          placeholder={placeholder ?? '输入后按 Enter 添加'}
        />
      </div>
    </div>
  )
}

// ─── FormState ────────────────────────────────────────────────────────────────

type FormState = {
  id: string
  name: string
  kind: AgentKind
  group: string
  domain: string
  baseId: string
  basePin: string
  model: string
  connectionId: string
  skills: string[]
  mcpServers: string[]
  toolAllow: string[]
  toolConfirm: string[]
  systemPromptExtra: string
  status: 'active' | 'disabled'
}

const emptyForm = (): FormState => ({
  id: '', name: '', kind: 'worker', group: '', domain: '', baseId: '', basePin: '',
  model: '', connectionId: '',
  skills: [], mcpServers: [], toolAllow: [], toolConfirm: [],
  systemPromptExtra: '', status: 'active',
})

const agentToForm = (a: AgentDefinition): FormState => ({
  id: a.id,
  name: a.name,
  kind: a.kind,
  group: a.group ?? '',
  domain: a.domain ?? '',
  baseId: a.baseId ?? '',
  basePin: a.basePin ?? '',
  model: a.model ?? '',
  connectionId: a.connectionId ?? '',
  skills: a.skills,
  mcpServers: a.mcpServers,
  toolAllow: a.toolPolicy.allow,
  toolConfirm: a.toolPolicy.confirm ?? [],
  systemPromptExtra: a.systemPromptExtra ?? '',
  status: a.status,
})

// ─── AgentCard (agentX visual) ────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentDefinition
  index: number
  highlighted?: boolean
  connectionLabel?: string
  onEdit: () => void
  onDelete: () => void
  onChat: () => void
  onMemory: () => void
}

const AgentCard = React.forwardRef<HTMLDivElement, AgentCardProps>(({ agent, index, highlighted, connectionLabel, onEdit, onDelete, onChat, onMemory }, ref) => {
  const color = KIND_COLORS[agent.kind]
  const bg = kindBg[agent.kind]

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.05, duration: 0.25, ease: 'easeOut' }}
      className="relative group bg-white rounded-xl p-5 cursor-default"
      style={{
        border: highlighted ? '2px solid #c9a227' : '1px solid #e5e7eb',
        boxShadow: highlighted ? '0 0 0 3px rgba(201,162,39,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!highlighted) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
          e.currentTarget.style.borderColor = '#d1d5db'
        }
      }}
      onMouseLeave={(e) => {
        if (!highlighted) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
          e.currentTarget.style.borderColor = '#e5e7eb'
        }
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3.5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: bg, border: `1px solid ${color}25` }}
          >
            <span className="text-sm font-bold" style={{ color }}>
              {getInitials(agent.name)}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: '#111827' }}>
              {agent.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="inline-block text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: bg, color }}
              >
                {kindLabel[agent.kind]}
              </span>
              {agent.status === 'disabled' && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#f3f4f6', color: '#9ca3af' }}
                >
                  disabled
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onChat}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="对话"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fdf8e7'; e.currentTarget.style.color = '#c9a227' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <MessageSquare size={13} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onMemory}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="记忆 / Memory"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fdf8e7'; e.currentTarget.style.color = '#c9a227' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <NotebookPen size={13} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onEdit}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="编辑"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <Pencil size={13} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onDelete}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            title="删除"
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <Trash2 size={13} />
          </motion.button>
        </div>
      </div>

      {/* ID */}
      <p className="text-xs font-mono mb-2 truncate" style={{ color: '#9ca3af' }}>{agent.id}</p>

      {/* Footer stats */}
      <div className="flex items-center gap-4 pt-3" style={{ borderTop: '1px solid #f3f4f6' }}>
        <span className="text-xs" style={{ color: '#9ca3af' }}>v{agent.version}</span>
        {agent.skills.length > 0 && (
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            Skills: {agent.skills.length}
          </span>
        )}
        {agent.mcpServers.length > 0 && (
          <span className="text-xs" style={{ color: '#9ca3af' }}>
            MCP: {agent.mcpServers.length}
          </span>
        )}
        {agent.domain && (
          <span className="text-xs truncate" style={{ color: '#9ca3af' }}>{agent.domain}</span>
        )}
        {agent.group && (
          <span
            className="text-xs px-1.5 py-0.5 rounded truncate"
            style={{ background: '#f3f4f6', color: '#6b7280' }}
          >
            {agent.group}
          </span>
        )}
        {agent.model && (
          <span className="text-xs font-mono truncate" style={{ color: '#9ca3af' }} title={agent.model}>
            {agent.model.split('-').slice(0, 2).join('-')}
          </span>
        )}
        {connectionLabel && (
          <span
            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded truncate"
            style={{ background: '#eff6ff', color: '#1d4ed8' }}
            title={`连接:${connectionLabel}`}
          >
            <Link2 size={10} />
            {connectionLabel}
          </span>
        )}
        <div className="ml-auto flex-shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: agent.status === 'active' ? '#10b981' : '#d1d5db' }}
          />
        </div>
      </div>
    </motion.div>
  )
})
AgentCard.displayName = 'AgentCard'

// ─── AgentForm 弹窗 (agentX drawer style, centered modal) ────────────────────

interface AgentFormProps {
  initial: FormState
  isEdit: boolean
  onSubmit: (f: FormState) => Promise<void>
  onClose: () => void
  submitting: boolean
  submitError: string | null
  existingGroups: string[]
  availableModels: { id: string; displayName: string }[]
  connections: { id: string; label: string }[]
}

const AgentForm: React.FC<AgentFormProps> = ({
  initial, isEdit, onSubmit, onClose, submitting, submitError, existingGroups, availableModels, connections,
}) => {
  const [form, setForm] = useState<FormState>(initial)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(form)
  }

  const fieldLabel = (text: string, required = false) => (
    <label className="text-sm font-medium" style={{ color: '#374151' }}>
      {text}{required && <span style={{ color: '#ef4444' }}> *</span>}
    </label>
  )

  const inputStyle = {
    width: '100%',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 14,
    color: '#111827',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.15s',
  } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <h2 className="font-semibold text-base" style={{ color: '#111827' }}>
            {isEdit ? 'Edit Agent' : 'New Agent'}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* ID + Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              {fieldLabel('ID', true)}
              <input
                required
                disabled={isEdit}
                value={form.id}
                onChange={(e) => set('id', e.target.value)}
                placeholder="my-agent-id"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('Name', true)}
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="My Agent"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Kind + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              {fieldLabel('Kind')}
              <div className="relative">
                <select
                  value={form.kind}
                  onChange={(e) => set('kind', e.target.value as AgentKind)}
                  style={{ ...inputStyle, paddingRight: 32, appearance: 'none' as const }}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{kindLabel[k]} ({k})</option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: '#9ca3af' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              {fieldLabel('Status')}
              <div className="flex gap-2 h-[34px] items-center">
                {(['active', 'disabled'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('status', s)}
                    className="flex-1 py-1.5 rounded-md text-sm font-medium border transition-all"
                    style={
                      form.status === s
                        ? s === 'active'
                          ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }
                          : { background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280' }
                        : { background: 'transparent', border: '1px solid #e5e7eb', color: '#9ca3af' }
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Domain + Base ID */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              {fieldLabel('Domain')}
              <input
                value={form.domain}
                onChange={(e) => set('domain', e.target.value)}
                placeholder="e.g. finance"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('Base ID')}
              <input
                value={form.baseId}
                onChange={(e) => set('baseId', e.target.value)}
                placeholder="base agent id"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            {fieldLabel('Base Pin')}
            <input
              value={form.basePin}
              onChange={(e) => set('basePin', e.target.value)}
              placeholder="版本锁定 pin"
              style={inputStyle}
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            {fieldLabel('模型')}
            <div className="relative">
              <select
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
                style={{ ...inputStyle, paddingRight: 32, appearance: 'none' as const }}
              >
                <option value="">(默认) — 使用全局默认模型</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#9ca3af' }}
              />
            </div>
          </div>

          {/* Connection */}
          <div className="space-y-1.5">
            {fieldLabel('连接')}
            <div className="relative">
              <select
                value={form.connectionId}
                onChange={(e) => set('connectionId', e.target.value)}
                style={{ ...inputStyle, paddingRight: 32, appearance: 'none' as const }}
              >
                <option value="">(默认) — 使用全局默认连接</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#9ca3af' }}
              />
            </div>
          </div>

          {/* Group */}
          <div className="space-y-1.5">
            {fieldLabel('Group')}
            <input
              list="group-datalist"
              value={form.group}
              onChange={(e) => set('group', e.target.value)}
              placeholder="分组名(留空=未分组)"
              style={inputStyle}
            />
            <datalist id="group-datalist">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          {/* Tag fields */}
          <TagInput label="Skills" value={form.skills} onChange={(v) => set('skills', v)}
            placeholder="输入 skill 后按 Enter" />
          <TagInput label="MCP Servers" value={form.mcpServers} onChange={(v) => set('mcpServers', v)}
            placeholder="输入 MCP server 后按 Enter" />
          <TagInput label="Tool Policy — Allow" value={form.toolAllow} onChange={(v) => set('toolAllow', v)}
            placeholder="允许的工具,按 Enter 添加" />
          <TagInput label="Tool Policy — Confirm" value={form.toolConfirm} onChange={(v) => set('toolConfirm', v)}
            placeholder="需确认的工具,按 Enter 添加" />

          {/* System Prompt Extra */}
          <div className="space-y-1.5">
            {fieldLabel('System Prompt Extra')}
            <textarea
              rows={4}
              value={form.systemPromptExtra}
              onChange={(e) => set('systemPromptExtra', e.target.value)}
              placeholder="附加到系统提示的额外指令..."
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>

          {/* Error */}
          {submitError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Actions */}
          <div
            className="flex justify-end gap-3 pt-2"
            style={{ borderTop: '1px solid #f3f4f6' }}
          >
            <button type="button" onClick={onClose} className="btn-ghost text-sm">
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── 删除确认弹窗 ─────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  agent: AgentDefinition
  onConfirm: () => Promise<void>
  onClose: () => void
  deleting: boolean
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({ agent, onConfirm, onClose, deleting }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4"
      style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-center gap-3" style={{ color: '#dc2626' }}>
        <Trash2 size={18} />
        <h3 className="font-semibold text-base">确认删除</h3>
      </div>
      <p className="text-sm" style={{ color: '#6b7280' }}>
        即将删除 Agent{' '}
        <span className="font-semibold" style={{ color: '#111827' }}>{agent.name}</span>
        {' '}<span className="font-mono text-xs" style={{ color: '#9ca3af' }}>({agent.id})</span>，此操作不可撤销。
      </p>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-ghost text-sm">取消</button>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="btn-danger text-sm flex items-center gap-2"
        >
          {deleting && <Loader2 size={14} className="animate-spin" />}
          删除
        </button>
      </div>
    </motion.div>
  </div>
)

// ─── MessageBubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: ChatMessage
  isStreaming?: boolean
  streamingThinking?: string
  streamingText?: string
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, isStreaming, streamingThinking, streamingText }) => {
  const isUser = msg.role === 'user'
  const [thinkingOpen, setThinkingOpen] = useState(false)

  const displayContent = isStreaming ? (streamingText ?? '') : msg.content
  const thinkingContent = isStreaming ? (streamingThinking ?? '') : undefined

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* thinking 折叠块 (assistant only) */}
      {!isUser && thinkingContent && (
        <button
          type="button"
          onClick={() => setThinkingOpen((v) => !v)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
          style={{ color: '#9ca3af', background: '#f9fafb', border: '1px solid #f3f4f6' }}
        >
          <ChevronRight
            size={11}
            style={{
              transform: thinkingOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          />
          Thinking…
        </button>
      )}
      {!isUser && thinkingOpen && thinkingContent && (
        <div
          className="text-xs rounded-lg p-3 max-w-[85%] whitespace-pre-wrap leading-relaxed"
          style={{ background: '#f9fafb', color: '#9ca3af', border: '1px solid #f3f4f6', fontStyle: 'italic' }}
        >
          {thinkingContent}
        </div>
      )}

      {/* 主消息气泡 */}
      <div
        className="rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap max-w-[85%]"
        style={
          isUser
            ? { background: '#c9a227', color: '#ffffff' }
            : { background: '#ffffff', color: '#111827', border: '1px solid #e5e7eb' }
        }
      >
        {displayContent}
        {isStreaming && (
          <span
            className="inline-block w-1.5 h-3.5 ml-0.5 rounded-sm animate-pulse"
            style={{ background: isUser ? 'rgba(255,255,255,0.6)' : '#c9a227', verticalAlign: 'text-bottom' }}
          />
        )}
      </div>

      {/* UsageStat (assistant, non-streaming) */}
      {!isUser && !isStreaming && (
        <div className="pl-1">
          <UsageStat
            model={msg.model}
            inputTokens={msg.inputTokens}
            outputTokens={msg.outputTokens}
            costUsd={msg.costUsd}
            contextWindow={msg.contextWindow}
          />
        </div>
      )}
    </div>
  )
}

// ─── ChatPanel (右侧抽屉) ──────────────────────────────────────────────────────

interface ChatPanelProps {
  agent: AgentDefinition
  onClose: () => void
}

const ChatPanel: React.FC<ChatPanelProps> = ({ agent, onClose }) => {
  const {
    chats, chatsLoading, chatsError,
    currentChatId, messages, messagesLoading, messagesError,
    streaming, streamingThinking, streamingText, streamError,
    openAgentChat, newChat, selectChat, send,
  } = useChatStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // 打开时加载
  useEffect(() => {
    openAgentChat(agent.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id])

  // 自动滚到底
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    send(text)
  }, [input, streaming, send])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const color = KIND_COLORS[agent.kind]
  const bg = kindBg[agent.kind]

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed inset-y-0 right-0 z-40 flex flex-col bg-white"
      style={{
        width: 440,
        borderLeft: '1px solid #e5e7eb',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部栏 */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #f3f4f6' }}
      >
        {/* Agent 头像 */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: bg, border: `1px solid ${color}25` }}
        >
          <span className="text-xs font-bold" style={{ color }}>{getInitials(agent.name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: '#111827' }}>{agent.name}</p>
          <p className="text-xs truncate" style={{ color: '#9ca3af' }}>
            {chats.length > 0 ? `${chats.length} 条对话` : '对话'}
          </p>
        </div>

        {/* 新开对话按钮 */}
        <button
          type="button"
          onClick={() => newChat(agent.id)}
          disabled={chatsLoading}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors"
          style={{ color: '#c9a227', background: '#fdf8e7', border: '1px solid #f0d87a' }}
          title="新开对话"
        >
          <PlusCircle size={12} />
          新对话
        </button>

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
          style={{ color: '#9ca3af' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
        >
          <X size={15} />
        </button>
      </div>

      {/* 历史对话下拉 */}
      {chats.length > 1 && (
        <div
          className="px-4 py-2 shrink-0 flex items-center gap-2"
          style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}
        >
          <span className="text-xs shrink-0" style={{ color: '#9ca3af' }}>切换对话</span>
          <div className="relative flex-1">
            <select
              value={currentChatId ?? ''}
              onChange={(e) => selectChat(e.target.value)}
              className="w-full text-xs rounded-md pl-2 pr-6 py-1.5 appearance-none"
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#374151',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title ?? `对话 ${c.id.slice(0, 8)}`} — {new Date(c.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </option>
              ))}
            </select>
            <ChevronDown
              size={11}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#9ca3af' }}
            />
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* 加载中 */}
        {(chatsLoading || messagesLoading) && (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: '#9ca3af' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#c9a227' }} />
            <span className="text-sm">加载中…</span>
          </div>
        )}

        {/* 错误 */}
        {(chatsError || messagesError) && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{chatsError ?? messagesError}</span>
          </div>
        )}

        {/* 空态 */}
        {!chatsLoading && !messagesLoading && !chatsError && !messagesError && messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center gap-3 py-16 select-none">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: bg, border: `1px solid ${color}25` }}
            >
              <MessageSquare size={20} style={{ color }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: '#374151' }}>开始对话</p>
              <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>向 {agent.name} 发送第一条消息</p>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* 流式 assistant 消息 */}
        {streaming && (
          <MessageBubble
            msg={{
              id: 'streaming',
              chatId: currentChatId ?? '',
              role: 'assistant',
              content: streamingText,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
            streamingThinking={streamingThinking}
            streamingText={streamingText}
          />
        )}

        {/* 流式错误 */}
        {streamError && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{streamError}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid #f3f4f6' }}
      >
        <div
          className="flex items-end gap-2 rounded-xl p-2"
          style={{ background: '#f8f9fa', border: '1px solid #e5e7eb' }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // 自适应高度
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            disabled={streaming || !currentChatId}
            placeholder={streaming ? 'AI 正在回复…' : '输入消息 (Enter 发送, Shift+Enter 换行)'}
            className="flex-1 bg-transparent border-0 outline-none text-sm resize-none leading-relaxed"
            style={{
              color: '#111827',
              minHeight: 24,
              maxHeight: 120,
              fontFamily: 'inherit',
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={handleSend}
            disabled={streaming || !input.trim() || !currentChatId}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0"
            style={
              !streaming && input.trim() && currentChatId
                ? { background: '#c9a227', color: '#ffffff' }
                : { background: '#f3f4f6', color: '#d1d5db' }
            }
          >
            {streaming
              ? <Loader2 size={14} className="animate-spin" />
              : <Send size={14} />
            }
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── MemoryPanel 弹窗 (per-agent 记忆笔记) ─────────────────────────────────────

interface MemoryPanelProps {
  agent: AgentDefinition
  onClose: () => void
}

const MemoryPanel: React.FC<MemoryPanelProps> = ({ agent, onClose }) => {
  const [content, setContent] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // 加载
  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    getMemory(agent.id)
      .then((m) => {
        if (!alive) return
        setContent(m.content)
        setUpdatedAt(m.updatedAt)
      })
      .catch((err) => {
        if (!alive) return
        setLoadError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [agent.id])

  const flashNotice = (n: { kind: 'ok' | 'err'; text: string }) => {
    setNotice(n)
    setTimeout(() => setNotice(null), 3000)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const m = await saveMemory(agent.id, content)
      setUpdatedAt(m.updatedAt)
      flashNotice({ kind: 'ok', text: '记忆已保存' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '保存失败')
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handlePromote = async () => {
    setPromoting(true)
    try {
      await promoteMemory(agent.id)
      flashNotice({ kind: 'ok', text: '已生成待审 patch' })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        flashNotice({ kind: 'err', text: '该 agent 未绑定知识库,无法提升为 patch' })
      } else {
        const msg = err instanceof Error ? err.message : '提升失败'
        flashNotice({ kind: 'err', text: msg })
      }
    } finally {
      setPromoting(false)
    }
  }

  const color = KIND_COLORS[agent.kind]
  const bg = kindBg[agent.kind]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center gap-3 px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: bg, border: `1px solid ${color}25` }}
          >
            <NotebookPen size={15} style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base truncate" style={{ color: '#111827' }}>
              记忆 · {agent.name}
            </h2>
            <p className="text-xs truncate" style={{ color: '#9ca3af' }}>
              {updatedAt
                ? `更新于 ${new Date(updatedAt).toLocaleString('zh-CN')}`
                : 'per-agent 可编辑笔记'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: '#9ca3af' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 说明小字 */}
          <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
            这份记忆会注入该 agent 的上下文;可经治理提升进版本化 Knowledge。支持 Markdown。
          </p>

          {/* 加载态 */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16" style={{ color: '#9ca3af' }}>
              <Loader2 size={18} className="animate-spin" style={{ color: '#c9a227' }} />
              <span className="text-sm">加载中…</span>
            </div>
          )}

          {/* 加载错误 */}
          {!loading && loadError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* 编辑器 */}
          {!loading && !loadError && (
            <>
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'# 关于该 agent 的记忆\n\n在这里记录该 agent 应长期记住的信息…'}
                className="w-full"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#111827',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />

              {/* 保存错误 */}
              {saveError && (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-sm"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
                >
                  <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* 行内提示 */}
              <AnimatePresence>
                {notice && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
                    style={
                      notice.kind === 'ok'
                        ? { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }
                        : { background: '#fffbeb', border: '1px solid #fde68a', color: '#92700d' }
                    }
                  >
                    {notice.kind === 'ok'
                      ? <CheckCircle size={14} />
                      : <AlertCircle size={14} />}
                    {notice.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div
                className="flex items-center justify-between gap-3 pt-3"
                style={{ borderTop: '1px solid #f3f4f6' }}
              >
                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={promoting || saving}
                  className="btn-ghost text-sm flex items-center gap-1.5"
                  title="将当前记忆提升为待审 Knowledge patch"
                >
                  {promoting
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ArrowUpCircle size={14} />}
                  提升为 Knowledge patch
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  保存
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ─── AgentsPage 主组件 ────────────────────────────────────────────────────────

type DialogState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; agent: AgentDefinition }
  | { type: 'delete'; agent: AgentDefinition }

const AgentsPage: React.FC = () => {
  const {
    agents, loading, error, fetchAll, create, update, remove,
    focusAgentId, filterGroup, setFocusAgent, setFilterGroup,
  } = useAgentsStore()
  const { models: availableModels, connections, fetchAll: fetchModels } = useSettingsStore()
  const { reset: resetChat } = useChatStore()
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const [chatAgent, setChatAgent] = useState<AgentDefinition | null>(null)
  const [memoryAgent, setMemoryAgent] = useState<AgentDefinition | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  // highlighted card id (for brief animation after focus)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // refs map for scrollIntoView
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchModels() }, [fetchModels])

  // Derive existing groups for datalist
  const existingGroups = Array.from(
    new Set(agents.map((a) => a.group).filter((g): g is string => !!g))
  )

  // connectionId -> label 查表(卡片展示用)
  const connectionLabelById = new Map(connections.map((c) => [c.id, c.label]))

  // Respond to focusAgentId from sidebar
  useEffect(() => {
    if (!focusAgentId) return
    const el = cardRefs.current[focusAgentId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightId(focusAgentId)
      const timer = setTimeout(() => {
        setHighlightId(null)
        setFocusAgent(null)
      }, 1800)
      return () => clearTimeout(timer)
    }
    // If el not mounted yet, wait briefly and retry
    const timer = setTimeout(() => {
      const el2 = cardRefs.current[focusAgentId]
      if (el2) {
        el2.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightId(focusAgentId)
        setTimeout(() => {
          setHighlightId(null)
          setFocusAgent(null)
        }, 1800)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [focusAgentId, setFocusAgent])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const closeDialog = useCallback(() => {
    setDialog({ type: 'none' })
    setSubmitError(null)
  }, [])

  const handleSubmit = useCallback(async (form: FormState) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload = {
        id: form.id,
        name: form.name,
        kind: form.kind,
        group: form.group || undefined,
        domain: form.domain || undefined,
        baseId: form.baseId || undefined,
        basePin: form.basePin || undefined,
        model: form.model || undefined,
        connectionId: form.connectionId || undefined,
        skills: form.skills,
        mcpServers: form.mcpServers,
        toolPolicy: {
          allow: form.toolAllow,
          confirm: form.toolConfirm.length > 0 ? form.toolConfirm : undefined,
        },
        systemPromptExtra: form.systemPromptExtra || undefined,
        status: form.status,
      }
      if (dialog.type === 'create') {
        await create(payload as AgentDefinitionCreate)
        flash('Agent 已创建')
      } else if (dialog.type === 'edit') {
        const { id, ...rest } = payload
        await update(dialog.agent.id, rest as AgentDefinitionUpdate)
        flash('Agent 已更新')
      }
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [dialog, create, update, closeDialog])

  const handleDelete = useCallback(async () => {
    if (dialog.type !== 'delete') return
    setSubmitting(true)
    try {
      await remove(dialog.agent.id)
      flash(`已删除 ${dialog.agent.name}`)
      closeDialog()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [dialog, remove, closeDialog])

  // Agents to display (filtered by group if filterGroup is set)
  const displayedAgents = filterGroup !== null
    ? agents.filter((a) => (filterGroup === '__ungrouped__' ? !a.group : a.group === filterGroup))
    : agents

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* 页头 */}
      <div
        className="flex items-center justify-between px-6 py-5 bg-white shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: '#f3f4f6' }}
          >
            <Bot size={17} style={{ color: '#374151' }} />
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: '#111827' }}>Agents</h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>管理所有 AI Agent 定义</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Group filter badge */}
          {filterGroup !== null && (
            <div
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg cursor-pointer"
              style={{ background: '#fdf8e7', border: '1px solid #f0d87a', color: '#92700d' }}
              onClick={() => setFilterGroup(null)}
              title="清除筛选"
            >
              <span>{filterGroup === '__ungrouped__' ? '未分组' : filterGroup}</span>
              <X size={11} />
            </div>
          )}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
                style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a' }}
              >
                <CheckCircle size={14} />
                {successMsg}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => { setSubmitError(null); setDialog({ type: 'create' }) }}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />
            New Agent
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
        {/* 加载 */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20" style={{ color: '#9ca3af' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: '#c9a227' }} />
            <span>加载中…</span>
          </div>
        )}

        {/* 错误 */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
            <button onClick={fetchAll} className="btn-ghost text-sm">重试</button>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && agents.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-center select-none">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
            >
              <Plus size={28} style={{ color: '#c9a227', opacity: 0.6 }} />
            </div>
            <div>
              <p className="font-medium" style={{ color: '#374151' }}>还没有 Agent</p>
              <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>点击「New Agent」开始</p>
            </div>
          </div>
        )}

        {/* 卡片网格 */}
        {!loading && !error && agents.length > 0 && (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {displayedAgents.map((agent, i) => (
                <AgentCard
                  key={agent.id}
                  ref={(el) => { cardRefs.current[agent.id] = el }}
                  agent={agent}
                  index={i}
                  highlighted={highlightId === agent.id}
                  connectionLabel={agent.connectionId ? connectionLabelById.get(agent.connectionId) : undefined}
                  onEdit={() => { setSubmitError(null); setDialog({ type: 'edit', agent }) }}
                  onDelete={() => { setSubmitError(null); setDialog({ type: 'delete', agent }) }}
                  onChat={() => { resetChat(); setChatAgent(agent) }}
                  onMemory={() => setMemoryAgent(agent)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* 弹窗 */}
      <AnimatePresence>
        {(dialog.type === 'create' || dialog.type === 'edit') && (
          <AgentForm
            key="form"
            initial={dialog.type === 'edit' ? agentToForm(dialog.agent) : emptyForm()}
            isEdit={dialog.type === 'edit'}
            onSubmit={handleSubmit}
            onClose={closeDialog}
            submitting={submitting}
            submitError={submitError}
            existingGroups={existingGroups}
            availableModels={availableModels}
            connections={connections}
          />
        )}
        {dialog.type === 'delete' && (
          <DeleteConfirm
            key="delete"
            agent={dialog.agent}
            onConfirm={handleDelete}
            onClose={closeDialog}
            deleting={submitting}
          />
        )}
      </AnimatePresence>

      {/* 对话抽屉 */}
      <AnimatePresence>
        {chatAgent && (
          <>
            {/* 遮罩(点击关闭) */}
            <motion.div
              key="chat-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.15)' }}
              onClick={() => { resetChat(); setChatAgent(null) }}
            />
            <ChatPanel
              key={`chat-${chatAgent.id}`}
              agent={chatAgent}
              onClose={() => { resetChat(); setChatAgent(null) }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 记忆弹窗 */}
      <AnimatePresence>
        {memoryAgent && (
          <MemoryPanel
            key={`memory-${memoryAgent.id}`}
            agent={memoryAgent}
            onClose={() => setMemoryAgent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default AgentsPage
