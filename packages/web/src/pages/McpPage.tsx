import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, X, ChevronDown,
  AlertCircle, Loader2, CheckCircle, Server,
  Upload, Wifi, WifiOff,
} from 'lucide-react'
import type {
  McpServerConfig,
  McpServerCreate,
  McpServerUpdate,
  McpImport,
  McpTransport,
  McpTestResult,
} from '@personax/contracts'
import { useMcpStore } from '../store/mcp'
import { ApiError } from '../api/mcp'

// ─── helpers ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
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
}

const monoStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: '"Fira Mono", "Cascadia Code", "Consolas", monospace',
  fontSize: 13,
  lineHeight: '1.6',
  resize: 'vertical',
}

const TRANSPORTS: McpTransport[] = ['stdio', 'http', 'sse']

const TRANSPORT_COLORS: Record<McpTransport, { bg: string; color: string }> = {
  stdio: { bg: '#f0fdf4', color: '#16a34a' },
  http:  { bg: '#eff6ff', color: '#3b82f6' },
  sse:   { bg: '#f5f3ff', color: '#8b5cf6' },
}

// ─── Enabled Toggle ───────────────────────────────────────────────────────────

interface EnabledToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  loading?: boolean
}

const EnabledToggle: React.FC<EnabledToggleProps> = ({ enabled, onChange, loading }) => (
  <button
    type="button"
    disabled={loading}
    onClick={(e) => { e.stopPropagation(); onChange(!enabled) }}
    className="relative flex-shrink-0 transition-opacity"
    style={{ opacity: loading ? 0.5 : 1 }}
    title={enabled ? '已启用,点击停用' : '已停用,点击启用'}
  >
    <div
      className="w-9 h-5 rounded-full transition-colors duration-200"
      style={{ background: enabled ? '#c9a227' : '#e5e7eb' }}
    />
    <div
      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
      style={{ transform: enabled ? 'translateX(20px)' : 'translateX(2px)' }}
    />
  </button>
)

// ─── TestResultBadge ──────────────────────────────────────────────────────────

interface TestResultBadgeProps {
  result: McpTestResult
}

const TestResultBadge: React.FC<TestResultBadgeProps> = ({ result }) => (
  <div
    className="flex flex-col gap-1.5 p-3 rounded-lg text-sm"
    style={{
      background: result.ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`,
      color: result.ok ? '#16a34a' : '#dc2626',
    }}
  >
    <div className="flex items-center gap-2">
      {result.ok ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span className="font-medium">{result.ok ? '连通' : '失败'}</span>
      <span style={{ color: result.ok ? '#15803d' : '#b91c1c', fontWeight: 400 }}>
        — {result.message}
      </span>
    </div>
    {result.tools && result.tools.length > 0 && (
      <div className="flex flex-wrap gap-1 pt-1" style={{ borderTop: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}` }}>
        {result.tools.map((t) => (
          <span
            key={t}
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: result.ok ? '#dcfce7' : '#fee2e2', color: result.ok ? '#166534' : '#991b1b' }}
          >
            {t}
          </span>
        ))}
      </div>
    )}
  </div>
)

// ─── KV Row (env / headers) ───────────────────────────────────────────────────

interface KvRowProps {
  k: string
  v: string
  onChangeK: (v: string) => void
  onChangeV: (v: string) => void
  onRemove: () => void
}

const KvRow: React.FC<KvRowProps> = ({ k, v, onChangeK, onChangeV, onRemove }) => (
  <div className="flex items-center gap-2">
    <input
      value={k}
      onChange={(e) => onChangeK(e.target.value)}
      placeholder="KEY"
      style={{ ...inputStyle, flex: '0 0 38%', fontFamily: '"Fira Mono", monospace', fontSize: 12 }}
    />
    <input
      value={v}
      onChange={(e) => onChangeV(e.target.value)}
      placeholder="value"
      style={{ ...inputStyle, flex: 1, fontFamily: '"Fira Mono", monospace', fontSize: 12 }}
    />
    <button
      type="button"
      onClick={onRemove}
      className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center transition-colors"
      style={{ color: '#9ca3af' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
    >
      <X size={13} />
    </button>
  </div>
)

// ─── helpers for KV state ─────────────────────────────────────────────────────

type KvPair = { k: string; v: string }

function recordToKvPairs(r?: Record<string, string>): KvPair[] {
  if (!r) return []
  return Object.entries(r).map(([k, v]) => ({ k, v }))
}

function kvPairsToRecord(pairs: KvPair[]): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  let hasAny = false
  for (const { k, v } of pairs) {
    if (k.trim()) { result[k.trim()] = v; hasAny = true }
  }
  return hasAny ? result : undefined
}

function argsStringToArray(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean)
}

function argsArrayToString(arr?: string[]): string {
  return arr ? arr.join('\n') : ''
}

// ─── Server Form ──────────────────────────────────────────────────────────────

interface ServerFormFields {
  id: string
  name: string
  transport: McpTransport
  command: string
  args: string
  env: KvPair[]
  url: string
  headers: KvPair[]
  enabled: boolean
}

function emptyForm(): ServerFormFields {
  return {
    id: '', name: '', transport: 'stdio',
    command: '', args: '', env: [],
    url: '', headers: [],
    enabled: true,
  }
}

function serverToForm(s: McpServerConfig): ServerFormFields {
  return {
    id: s.id,
    name: s.name,
    transport: s.transport,
    command: s.command ?? '',
    args: argsArrayToString(s.args),
    env: recordToKvPairs(s.env),
    url: s.url ?? '',
    headers: recordToKvPairs(s.headers),
    enabled: s.enabled,
  }
}

interface ServerFormProps {
  initial: ServerFormFields
  isEdit: boolean
  onSubmit: (f: ServerFormFields) => Promise<void>
  onClose: () => void
  submitting: boolean
  submitError: string | null
}

const ServerForm: React.FC<ServerFormProps> = ({
  initial, isEdit, onSubmit, onClose, submitting, submitError,
}) => {
  const [form, setForm] = useState<ServerFormFields>(initial)
  const set = <K extends keyof ServerFormFields>(k: K, v: ServerFormFields[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const addEnvRow = () => set('env', [...form.env, { k: '', v: '' }])
  const updateEnvRow = (i: number, field: 'k' | 'v', val: string) =>
    set('env', form.env.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  const removeEnvRow = (i: number) => set('env', form.env.filter((_, idx) => idx !== i))

  const addHeaderRow = () => set('headers', [...form.headers, { k: '', v: '' }])
  const updateHeaderRow = (i: number, field: 'k' | 'v', val: string) =>
    set('headers', form.headers.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  const removeHeaderRow = (i: number) => set('headers', form.headers.filter((_, idx) => idx !== i))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(form)
  }

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
        className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <h2 className="font-semibold text-base" style={{ color: '#111827' }}>
            {isEdit ? 'Edit MCP Server' : 'New MCP Server'}
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
              <label className="text-sm font-medium" style={{ color: '#374151' }}>
                ID <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                required
                disabled={isEdit}
                value={form.id}
                onChange={(e) => set('id', e.target.value)}
                placeholder="my-mcp-server"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#374151' }}>
                Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="My MCP Server"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Transport + Enabled */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#374151' }}>Transport</label>
              <div className="relative">
                <select
                  value={form.transport}
                  onChange={(e) => set('transport', e.target.value as McpTransport)}
                  style={{ ...inputStyle, paddingRight: 32, appearance: 'none' as const }}
                >
                  {TRANSPORTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
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
              <label className="text-sm font-medium" style={{ color: '#374151' }}>Enabled</label>
              <div className="flex items-center gap-2 h-[34px]">
                <EnabledToggle enabled={form.enabled} onChange={(v) => set('enabled', v)} />
                <span className="text-sm" style={{ color: '#6b7280' }}>
                  {form.enabled ? '启用' : '停用'}
                </span>
              </div>
            </div>
          </div>

          {/* stdio fields */}
          {form.transport === 'stdio' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  Command <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  required
                  value={form.command}
                  onChange={(e) => set('command', e.target.value)}
                  placeholder="npx / node / python3 ..."
                  style={{ ...inputStyle, fontFamily: '"Fira Mono", monospace', fontSize: 13 }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  Args <span style={{ color: '#9ca3af', fontWeight: 400 }}>(每行一个)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.args}
                  onChange={(e) => set('args', e.target.value)}
                  placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir'}
                  style={monoStyle}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: '#374151' }}>
                    Environment Variables
                  </label>
                  <button
                    type="button"
                    onClick={addEnvRow}
                    className="text-xs flex items-center gap-1"
                    style={{ color: '#c9a227' }}
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {form.env.length === 0 && (
                  <p className="text-xs" style={{ color: '#9ca3af' }}>暂无环境变量</p>
                )}
                {form.env.map((row, i) => (
                  <KvRow
                    key={i}
                    k={row.k}
                    v={row.v}
                    onChangeK={(val) => updateEnvRow(i, 'k', val)}
                    onChangeV={(val) => updateEnvRow(i, 'v', val)}
                    onRemove={() => removeEnvRow(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* http / sse fields */}
          {(form.transport === 'http' || form.transport === 'sse') && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>
                  URL <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  required
                  type="url"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://mcp.example.com/sse"
                  style={{ ...inputStyle, fontFamily: '"Fira Mono", monospace', fontSize: 13 }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium" style={{ color: '#374151' }}>Headers</label>
                  <button
                    type="button"
                    onClick={addHeaderRow}
                    className="text-xs flex items-center gap-1"
                    style={{ color: '#c9a227' }}
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {form.headers.length === 0 && (
                  <p className="text-xs" style={{ color: '#9ca3af' }}>暂无 headers</p>
                )}
                {form.headers.map((row, i) => (
                  <KvRow
                    key={i}
                    k={row.k}
                    v={row.v}
                    onChangeK={(val) => updateHeaderRow(i, 'k', val)}
                    onChangeV={(val) => updateHeaderRow(i, 'v', val)}
                    onRemove={() => removeHeaderRow(i)}
                  />
                ))}
              </div>
            </>
          )}

          {submitError && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div
            className="flex justify-end gap-3 pt-2"
            style={{ borderTop: '1px solid #f3f4f6' }}
          >
            <button type="button" onClick={onClose} className="btn-ghost text-sm">取消</button>
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

// ─── Import Dialog ────────────────────────────────────────────────────────────

interface ImportDialogProps {
  onClose: () => void
  onImport: (data: McpImport) => Promise<void>
  submitting: boolean
  submitError: string | null
}

const ImportDialog: React.FC<ImportDialogProps> = ({ onClose, onImport, submitting, submitError }) => {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [configText, setConfigText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setParseError(null)
    let config: Record<string, unknown>
    try {
      config = JSON.parse(configText)
    } catch {
      setParseError('JSON 解析失败,请检查格式')
      return
    }
    onImport({
      id: id.trim(),
      name: name.trim() || undefined,
      config,
    })
  }

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
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <h2 className="font-semibold text-base" style={{ color: '#111827' }}>导入 MCP Server</h2>
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs" style={{ color: '#6b7280' }}>
            粘贴标准 MCP server JSON 配置片段(如 {"{ command, args, env }"} 或 {"{ type, url, headers }"})。
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#374151' }}>
                ID <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="my-mcp-server"
                style={inputStyle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: '#374151' }}>
                Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(可选)</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="留空则使用 id"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#374151' }}>
              Config JSON <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              required
              rows={10}
              value={configText}
              onChange={(e) => { setConfigText(e.target.value); setParseError(null) }}
              placeholder={'{\n  "command": "npx",\n  "args": ["-y", "@scope/server"]\n}'}
              style={monoStyle}
            />
          </div>

          {(parseError || submitError) && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{parseError ?? submitError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2" style={{ borderTop: '1px solid #f3f4f6' }}>
            <button type="button" onClick={onClose} className="btn-ghost text-sm">取消</button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              导入
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  server: McpServerConfig
  onConfirm: () => Promise<void>
  onClose: () => void
  deleting: boolean
}

const DeleteConfirm: React.FC<DeleteConfirmProps> = ({ server, onConfirm, onClose, deleting }) => (
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
        即将删除 MCP Server{' '}
        <span className="font-semibold" style={{ color: '#111827' }}>{server.name}</span>
        {' '}<span className="font-mono text-xs" style={{ color: '#9ca3af' }}>({server.id})</span>，此操作不可撤销。
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

// ─── MCP Server Card ──────────────────────────────────────────────────────────

interface McpCardProps {
  server: McpServerConfig
  index: number
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  toggling: boolean
  onTest: () => void
  testing: boolean
  testResult?: McpTestResult
}

const McpCard = React.forwardRef<HTMLDivElement, McpCardProps>(({
  server, index, onEdit, onDelete, onToggle, toggling, onTest, testing, testResult,
}, ref) => {
  const tc = TRANSPORT_COLORS[server.transport]

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
      className="relative group bg-white rounded-xl p-5 cursor-default"
      style={{
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
        e.currentTarget.style.borderColor = '#d1d5db'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
        e.currentTarget.style.borderColor = '#e5e7eb'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#f3f4f6' }}
          >
            <Server size={16} style={{ color: '#374151' }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: '#111827' }}>
              {server.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className="inline-block text-xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: tc.bg, color: tc.color }}
              >
                {server.transport}
              </span>
              {!server.enabled && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#f3f4f6', color: '#9ca3af' }}
                >
                  disabled
                </span>
              )}
              {testResult && (
                <span
                  className="inline-block text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
                  style={{
                    background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                    color: testResult.ok ? '#16a34a' : '#dc2626',
                  }}
                >
                  {testResult.ok ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {testResult.ok ? '连通' : '失败'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0 ml-2">
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

      {/* ID + endpoint */}
      <p className="text-xs font-mono mb-1 truncate" style={{ color: '#9ca3af' }}>{server.id}</p>
      {server.transport === 'stdio' && server.command && (
        <p className="text-xs font-mono truncate" style={{ color: '#6b7280' }}>
          {server.command}{server.args && server.args.length > 0 ? ' ' + server.args.join(' ') : ''}
        </p>
      )}
      {(server.transport === 'http' || server.transport === 'sse') && server.url && (
        <p className="text-xs font-mono truncate" style={{ color: '#6b7280' }}>{server.url}</p>
      )}

      {/* Test result details */}
      {testResult && (
        <div className="mt-3">
          <TestResultBadge result={testResult} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 mt-3" style={{ borderTop: '1px solid #f3f4f6' }}>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: testing ? '#9ca3af' : '#c9a227' }}
        >
          {testing
            ? <Loader2 size={12} className="animate-spin" />
            : <Wifi size={12} />}
          测试连通
        </button>
        <EnabledToggle enabled={server.enabled} onChange={onToggle} loading={toggling} />
      </div>
    </motion.div>
  )
})
McpCard.displayName = 'McpCard'

// ─── McpPage ──────────────────────────────────────────────────────────────────

type DialogState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'import' }
  | { type: 'edit'; server: McpServerConfig }
  | { type: 'delete'; server: McpServerConfig }

const McpPage: React.FC = () => {
  const { servers, loading, error, fetchAll, create, import: importFn, update, remove, test, testResults, testingId } = useMcpStore()
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  useEffect(() => { fetchAll() }, [fetchAll])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2500)
  }

  const closeDialog = useCallback(() => {
    setDialog({ type: 'none' })
    setSubmitError(null)
  }, [])

  const formToCreate = (f: ServerFormFields): McpServerCreate => ({
    id: f.id,
    name: f.name,
    transport: f.transport,
    command: f.transport === 'stdio' ? f.command || undefined : undefined,
    args: f.transport === 'stdio' ? argsStringToArray(f.args) : undefined,
    env: f.transport === 'stdio' ? kvPairsToRecord(f.env) : undefined,
    url: f.transport !== 'stdio' ? f.url || undefined : undefined,
    headers: f.transport !== 'stdio' ? kvPairsToRecord(f.headers) : undefined,
    enabled: f.enabled,
  })

  const formToUpdate = (f: ServerFormFields): McpServerUpdate => ({
    name: f.name || undefined,
    transport: f.transport,
    command: f.transport === 'stdio' ? f.command || undefined : undefined,
    args: f.transport === 'stdio' ? argsStringToArray(f.args) : undefined,
    env: f.transport === 'stdio' ? kvPairsToRecord(f.env) : undefined,
    url: f.transport !== 'stdio' ? f.url || undefined : undefined,
    headers: f.transport !== 'stdio' ? kvPairsToRecord(f.headers) : undefined,
    enabled: f.enabled,
  })

  const handleSubmitForm = useCallback(async (f: ServerFormFields) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (dialog.type === 'create') {
        await create(formToCreate(f))
        flash('MCP Server 已创建')
      } else if (dialog.type === 'edit') {
        await update(dialog.server.id, formToUpdate(f))
        flash('MCP Server 已更新')
      }
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [dialog, create, update, closeDialog])

  const handleImport = useCallback(async (data: McpImport) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await importFn(data)
      flash('MCP Server 已导入')
      closeDialog()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '操作失败')
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [importFn, closeDialog])

  const handleDelete = useCallback(async () => {
    if (dialog.type !== 'delete') return
    setSubmitting(true)
    try {
      await remove(dialog.server.id)
      flash(`已删除 ${dialog.server.name}`)
      closeDialog()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }, [dialog, remove, closeDialog])

  const handleToggle = useCallback(async (server: McpServerConfig, enabled: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(server.id))
    try {
      await update(server.id, { enabled })
    } catch {
      // ignore
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev)
        next.delete(server.id)
        return next
      })
    }
  }, [update])

  const handleTest = useCallback(async (id: string) => {
    try {
      await test(id)
    } catch {
      // error stored in testResults by store if needed; for now just swallow
    }
  }, [test])

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-5 bg-white shrink-0"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: '#f3f4f6' }}
          >
            <Server size={17} style={{ color: '#374151' }} />
          </div>
          <div>
            <h1 className="font-semibold text-base" style={{ color: '#111827' }}>MCP</h1>
            <p className="text-xs" style={{ color: '#9ca3af' }}>管理 MCP Server 配置</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={() => { setSubmitError(null); setDialog({ type: 'import' }) }}
            className="btn-ghost text-sm flex items-center gap-1.5"
          >
            <Upload size={14} />
            导入
          </button>
          <button
            onClick={() => { setSubmitError(null); setDialog({ type: 'create' }) }}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />
            New Server
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20" style={{ color: '#9ca3af' }}>
            <Loader2 size={22} className="animate-spin" style={{ color: '#c9a227' }} />
            <span>加载中…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle size={32} style={{ color: '#ef4444' }} />
            <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
            <button onClick={fetchAll} className="btn-ghost text-sm">重试</button>
          </div>
        )}

        {!loading && !error && servers.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-center select-none">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: '#ffffff', border: '2px dashed #e5e7eb' }}
            >
              <Plus size={28} style={{ color: '#c9a227', opacity: 0.6 }} />
            </div>
            <div>
              <p className="font-medium" style={{ color: '#374151' }}>还没有 MCP Server</p>
              <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>点击「New Server」或「导入」开始</p>
            </div>
          </div>
        )}

        {!loading && !error && servers.length > 0 && (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {servers.map((server, i) => (
                <McpCard
                  key={server.id}
                  server={server}
                  index={i}
                  onEdit={() => { setSubmitError(null); setDialog({ type: 'edit', server }) }}
                  onDelete={() => { setSubmitError(null); setDialog({ type: 'delete', server }) }}
                  onToggle={(enabled) => handleToggle(server, enabled)}
                  toggling={togglingIds.has(server.id)}
                  onTest={() => handleTest(server.id)}
                  testing={testingId === server.id}
                  testResult={testResults[server.id]}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {(dialog.type === 'create' || dialog.type === 'edit') && (
          <ServerForm
            key="form"
            initial={dialog.type === 'edit' ? serverToForm(dialog.server) : emptyForm()}
            isEdit={dialog.type === 'edit'}
            onSubmit={handleSubmitForm}
            onClose={closeDialog}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {dialog.type === 'import' && (
          <ImportDialog
            key="import"
            onClose={closeDialog}
            onImport={handleImport}
            submitting={submitting}
            submitError={submitError}
          />
        )}
        {dialog.type === 'delete' && (
          <DeleteConfirm
            key="delete"
            server={dialog.server}
            onConfirm={handleDelete}
            onClose={closeDialog}
            deleting={submitting}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default McpPage
