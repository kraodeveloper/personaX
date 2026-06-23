import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  ChevronRight,
  ChevronDown,
  Brain,
  Check,
  AlertTriangle,
  Wrench,
  DollarSign,
  Zap,
  GitBranch,
} from 'lucide-react'
import { useRunStore, type RunNode } from '../store/run'
import type { Claim, AgentKind } from '@personax/contracts'
import { UsageStat } from '../components/UsageStat'

// ── helpers ───────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ')
}

// ── agentKind 色板 ────────────────────────────────────────────────────────────

const KIND_COLOR: Record<AgentKind, string> = {
  lead: '#c9a227',
  business_domain: '#3b82f6',
  technical_domain: '#8b5cf6',
  worker: '#10b981',
}

const KIND_LABEL: Record<AgentKind, string> = {
  lead: 'Lead',
  business_domain: 'Business',
  technical_domain: 'Technical',
  worker: 'Worker',
}

// ── ThinkingDots ──────────────────────────────────────────────────────────────

function ThinkingDots({ color = '#9ca3af' }: { color?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block rounded-full"
          style={{ width: 4, height: 4, background: color }}
          animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

// ── claimType 配置 ────────────────────────────────────────────────────────────

type ClaimType = Claim['claimType']

const CLAIM_TYPE_CONFIG: Record<ClaimType, { label: string; bg: string; color: string }> = {
  observed_fact: { label: 'Observed Fact', bg: '#dcfce7', color: '#16a34a' },
  inference: { label: 'Inference', bg: '#dbeafe', color: '#2563eb' },
  hypothesis: { label: 'Hypothesis', bg: '#fef9c3', color: '#d97706' },
  recommendation: { label: 'Recommendation', bg: '#fef3c7', color: '#c9a227' },
  failed_observation: { label: 'Failed Observation', bg: '#f3f4f6', color: '#6b7280' },
}

// ── ClaimCard ─────────────────────────────────────────────────────────────────

function ClaimCard({ claim }: { claim: Claim }) {
  const cfg = CLAIM_TYPE_CONFIG[claim.claimType]
  const pct = Math.round(claim.confidence * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl p-4 bg-white"
      style={{ border: '1px solid #e5e7eb' }}
    >
      {/* header row */}
      <div className="flex items-start gap-3 mb-3">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>
        <span className="text-xs flex-shrink-0 ml-auto" style={{ color: '#9ca3af' }}>
          {KIND_LABEL[claim.agentKind]}
        </span>
      </div>

      {/* claim body */}
      <p className="text-sm leading-relaxed mb-3" style={{ color: '#111827' }}>
        {claim.claim}
      </p>

      {/* scope */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs" style={{ color: '#9ca3af' }}>Scope:</span>
        <span className="text-xs font-medium" style={{ color: '#374151' }}>{claim.scope}</span>
      </div>

      {/* confidence bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: '#9ca3af' }}>Confidence</span>
          <span className="text-xs font-medium" style={{ color: cfg.color }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f3f4f6' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: cfg.color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* evidence refs */}
      {claim.evidenceRefs.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#9ca3af' }}>Evidence</div>
          <div className="flex flex-wrap gap-1">
            {claim.evidenceRefs.map((ref, i) => (
              <code
                key={i}
                className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                {ref}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* negative evidence */}
      {claim.negativeEvidenceRefs && claim.negativeEvidenceRefs.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#9ca3af' }}>Negative Evidence</div>
          <div className="flex flex-wrap gap-1">
            {claim.negativeEvidenceRefs.map((ref, i) => (
              <code
                key={i}
                className="text-xs px-1.5 py-0.5 rounded font-mono"
                style={{ background: '#fef2f2', color: '#dc2626' }}
              >
                {ref}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* uncertainty */}
      {claim.uncertainty && (
        <div className="mb-2 flex items-start gap-1.5">
          <AlertTriangle size={11} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#92400e' }}>{claim.uncertainty}</p>
        </div>
      )}

      {/* open questions */}
      {claim.openQuestions && claim.openQuestions.length > 0 && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#9ca3af' }}>Open Questions</div>
          <ul className="space-y-0.5">
            {claim.openQuestions.map((q, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5">
                <span style={{ color: '#d1d5db' }}>·</span>
                <span style={{ color: '#6b7280' }}>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* timeWindow */}
      {claim.timeWindow && (
        <div className="mt-2 text-xs" style={{ color: '#9ca3af' }}>
          Window: <span style={{ color: '#374151' }}>{claim.timeWindow}</span>
        </div>
      )}
    </motion.div>
  )
}

// ── NodeRow (RunGraph leaf) ───────────────────────────────────────────────────

function NodeRow({
  node,
  selected,
  onSelect,
}: {
  node: RunNode
  selected: boolean
  onSelect: () => void
}) {
  const color = KIND_COLOR[node.agentKind]
  const active = node.status === 'running'
  const hasUsage = node.status === 'done' && (
    node.inputTokens !== undefined || node.outputTokens !== undefined || node.costUsd !== undefined
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        marginLeft: node.depth * 20,
        width: `calc(100% - ${node.depth * 20}px)`,
      }}
    >
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
        style={{
          background: selected ? '#f3f4f6' : 'transparent',
          border: selected ? '1px solid #e5e7eb' : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!selected) e.currentTarget.style.background = '#f9fafb'
        }}
        onMouseLeave={(e) => {
          if (!selected) e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* depth connector */}
        {node.depth > 0 && (
          <ChevronRight size={11} style={{ color: '#d1d5db', flexShrink: 0 }} />
        )}

        {/* kind dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: color,
            boxShadow: active ? `0 0 0 3px ${color}33` : 'none',
          }}
        />

        {/* label */}
        <span
          className="text-sm flex-1 min-w-0 truncate"
          style={{ color: '#374151', fontWeight: selected ? 500 : 400 }}
        >
          {node.label}
        </span>

        {/* kind badge */}
        <span
          className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {KIND_LABEL[node.agentKind]}
        </span>

        {/* status */}
        {active ? (
          <ThinkingDots color={color} />
        ) : (
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#dcfce7' }}
          >
            <Check size={9} color="#16a34a" />
          </div>
        )}
      </button>

      {/* per-node usage stat */}
      {hasUsage && (
        <div className="px-3 pb-1.5">
          <UsageStat
            model={node.model}
            inputTokens={node.inputTokens}
            outputTokens={node.outputTokens}
            costUsd={node.costUsd}
            contextWindow={node.contextWindow}
          />
        </div>
      )}
    </motion.div>
  )
}

// ── NodeDetail panel ──────────────────────────────────────────────────────────

function NodeDetail({ node }: { node: RunNode }) {
  const [thinkingOpen, setThinkingOpen] = useState(true)
  const color = KIND_COLOR[node.agentKind]

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div
        className="flex items-center gap-2 pb-3"
        style={{ borderBottom: '1px solid #e5e7eb' }}
      >
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="font-medium text-sm" style={{ color: '#111827' }}>{node.label}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full ml-1"
          style={{ background: `${color}15`, color }}
        >
          {KIND_LABEL[node.agentKind]}
        </span>
        {node.status === 'running' && <ThinkingDots color={color} />}
        {node.status === 'done' && (
          <span className="text-xs ml-auto" style={{ color: '#10b981' }}>Done</span>
        )}
      </div>

      {/* usage stats below header */}
      {node.status === 'done' && (node.inputTokens !== undefined || node.outputTokens !== undefined || node.costUsd !== undefined) && (
        <div className="pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <UsageStat
            model={node.model}
            inputTokens={node.inputTokens}
            outputTokens={node.outputTokens}
            costUsd={node.costUsd}
            contextWindow={node.contextWindow}
          />
        </div>
      )}

      {/* thinking */}
      {node.thinking && (
        <div>
          <button
            onClick={() => setThinkingOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs mb-2"
            style={{ color: '#6b7280' }}
          >
            <Brain size={12} />
            Thinking
            {thinkingOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          <AnimatePresence>
            {thinkingOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap"
                  style={{ background: '#f8f9fa', color: '#6b7280', border: '1px solid #e5e7eb' }}
                >
                  {node.thinking}
                  {node.status === 'running' && (
                    <span className="inline-block ml-1">
                      <ThinkingDots color="#9ca3af" />
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* tool uses */}
      {node.toolUses.length > 0 && (
        <div>
          <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: '#6b7280' }}>
            <Wrench size={12} />
            Tool Calls ({node.toolUses.length})
          </div>
          <div className="space-y-1.5">
            {node.toolUses.map((tu, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 rounded-lg"
                style={{ background: '#f8f9fa', border: '1px solid #e5e7eb' }}
              >
                <code
                  className="text-xs font-mono font-medium flex-shrink-0"
                  style={{ color: '#374151' }}
                >
                  {tu.toolName}
                </code>
                {tu.summary && (
                  <span className="text-xs" style={{ color: '#6b7280' }}>{tu.summary}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* text output */}
      {(node.text || node.status === 'running') && (
        <div>
          <div className="text-xs mb-2" style={{ color: '#6b7280' }}>Output</div>
          <div
            className="rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ background: 'white', border: '1px solid #e5e7eb', color: '#374151' }}
          >
            {node.text}
            {node.status === 'running' && !node.text && (
              <ThinkingDots color="#9ca3af" />
            )}
            {node.status === 'running' && node.text && (
              <span
                className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse"
                style={{ background: '#c9a227', verticalAlign: 'middle' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BudgetBar ─────────────────────────────────────────────────────────────────

function BudgetBar({
  budget,
}: {
  budget: { spentChildAgents: number; spentToolCalls: number; spentCostUsd: number }
}) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-xl"
      style={{ background: '#f8f9fa', border: '1px solid #e5e7eb' }}
    >
      <div className="flex items-center gap-1.5">
        <GitBranch size={12} style={{ color: '#9ca3af' }} />
        <span className="text-xs" style={{ color: '#6b7280' }}>
          <span className="font-medium text-gray-700">{budget.spentChildAgents}</span> agents
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Wrench size={12} style={{ color: '#9ca3af' }} />
        <span className="text-xs" style={{ color: '#6b7280' }}>
          <span className="font-medium text-gray-700">{budget.spentToolCalls}</span> tool calls
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <DollarSign size={12} style={{ color: '#9ca3af' }} />
        <span className="text-xs" style={{ color: '#6b7280' }}>
          <span className="font-medium text-gray-700">${budget.spentCostUsd.toFixed(4)}</span>
        </span>
      </div>
    </div>
  )
}

// ── Sample tasks ──────────────────────────────────────────────────────────────

const SAMPLE_TASKS = [
  'Analyze API latency spikes in the checkout service over the last 24h',
  'Review Q3 revenue forecast and identify growth risks',
  'Audit authentication flows for security vulnerabilities',
]

// ── RunPage ───────────────────────────────────────────────────────────────────

export default function RunPage() {
  const {
    running, status, nodes, order, claims, finalDelivery, budget, error, start,
    totalCostUsd, totalInputTokens, totalOutputTokens,
  } = useRunStore()

  const [task, setTask] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [order.length, claims.length, finalDelivery])

  // auto-select first node when run starts
  useEffect(() => {
    if (order.length > 0 && !selectedNodeId) {
      setSelectedNodeId(order[0])
    }
  }, [order.length])

  const handleRun = async () => {
    if (!task.trim() || running) return
    setSelectedNodeId(null)
    await start(task.trim())
  }

  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : null
  const isEmpty = order.length === 0 && !running && !error && !finalDelivery

  return (
    <div className="h-full flex overflow-hidden" style={{ background: '#f8f9fa' }}>
      {/* ── Left panel: input + graph + claims ── */}
      <div
        className="flex flex-col"
        style={{
          width: 400,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          background: 'white',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #f3f4f6' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Play size={14} style={{ color: '#c9a227' }} />
            <h1 className="font-semibold text-sm" style={{ color: '#111827' }}>
              Run
            </h1>
          </div>
          <p className="text-xs" style={{ color: '#9ca3af' }}>
            Start a multi-agent task and observe the reasoning graph
          </p>
        </div>

        {/* Task input */}
        <div className="px-4 pt-4 pb-3 flex-shrink-0">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleRun()
              }
            }}
            placeholder="Describe the task for the agent network..."
            rows={3}
            className="w-full px-3 py-2.5 text-sm rounded-xl resize-none outline-none"
            style={{
              background: '#f8f9fa',
              border: '1px solid #e5e7eb',
              color: '#374151',
              lineHeight: 1.6,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#c9a227')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
          />

          {/* Sample tasks */}
          <div className="mt-2 flex flex-wrap gap-1">
            {SAMPLE_TASKS.map((s) => (
              <button
                key={s}
                onClick={() => setTask(s)}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{
                  background: '#f3f4f6',
                  color: '#6b7280',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.color = '#374151'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent'
                  e.currentTarget.style.color = '#6b7280'
                }}
              >
                {s.length > 42 ? s.slice(0, 42) + '…' : s}
              </button>
            ))}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleRun}
            disabled={!task.trim() || running}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: task.trim() && !running ? '#111827' : '#f3f4f6',
              color: task.trim() && !running ? '#ffffff' : '#9ca3af',
              cursor: task.trim() && !running ? 'pointer' : 'not-allowed',
            }}
          >
            {running ? (
              <>
                <ThinkingDots color="#9ca3af" />
                Running…
              </>
            ) : (
              <>
                <Zap size={14} />
                Run
              </>
            )}
          </motion.button>
        </div>

        {/* Budget bar */}
        <AnimatePresence>
          {budget && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3 flex-shrink-0"
            >
              <BudgetBar budget={budget} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Run-level usage totals */}
        <AnimatePresence>
          {(totalInputTokens > 0 || totalOutputTokens > 0 || totalCostUsd > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3 flex-shrink-0"
            >
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: '#fffbeb', border: '1px solid #fef3c7' }}
              >
                <span className="text-xs font-medium" style={{ color: '#92400e', flexShrink: 0 }}>
                  Run total
                </span>
                <UsageStat
                  inputTokens={totalInputTokens > 0 ? totalInputTokens : undefined}
                  outputTokens={totalOutputTokens > 0 ? totalOutputTokens : undefined}
                  costUsd={totalCostUsd > 0 ? totalCostUsd : undefined}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* RunGraph */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          style={{ borderTop: order.length > 0 ? '1px solid #f3f4f6' : 'none' }}
        >
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#f3f4f6' }}
              >
                <GitBranch size={22} style={{ color: '#d1d5db' }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium mb-1" style={{ color: '#374151' }}>
                  No run yet
                </p>
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  Enter a task and click Run to see the agent graph
                </p>
              </div>
            </div>
          )}

          {order.length > 0 && (
            <div className="pt-3">
              <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: '#9ca3af' }}>
                <GitBranch size={11} />
                Agent Graph ({order.length} nodes)
              </div>
              <div className="space-y-1">
                {order.map((nodeId) => {
                  const node = nodes[nodeId]
                  if (!node) return null
                  return (
                    <NodeRow
                      key={nodeId}
                      node={node}
                      selected={selectedNodeId === nodeId}
                      onSelect={() =>
                        setSelectedNodeId(selectedNodeId === nodeId ? null : nodeId)
                      }
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Claims list */}
          {claims.length > 0 && (
            <div className="mt-5">
              <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: '#9ca3af' }}>
                <Brain size={11} />
                Claims ({claims.length})
              </div>
              <div className="space-y-3">
                {claims.map((claim, i) => (
                  <ClaimCard key={i} claim={claim} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-xl px-4 py-3 text-sm"
              style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              ⚠ {error}
            </motion.div>
          )}

          {/* Status done */}
          {status === 'done' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex items-center gap-2 text-xs"
              style={{ color: '#10b981' }}
            >
              <Check size={13} />
              Run completed
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Right panel: node detail + final delivery ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
        {/* Final delivery — prominent */}
        <AnimatePresence>
          {finalDelivery && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl"
              style={{ border: '2px solid #c9a227', background: 'white' }}
            >
              <div
                className="px-5 py-3 flex items-center gap-2"
                style={{ borderBottom: '1px solid #fef3c7', background: '#fffbeb' }}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: '#c9a227' }}
                >
                  <Check size={11} color="white" />
                </div>
                <span className="font-semibold text-sm" style={{ color: '#92400e' }}>
                  Final Delivery
                </span>
              </div>
              <pre
                className="px-5 py-4 text-sm leading-relaxed overflow-x-auto whitespace-pre-wrap"
                style={{ color: '#374151', fontFamily: 'inherit' }}
              >
                {finalDelivery}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Node detail */}
        {selectedNode && (
          <div className="card p-5">
            <NodeDetail node={selectedNode} />
          </div>
        )}

        {/* Empty right panel state */}
        {!selectedNode && !finalDelivery && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: '#f3f4f6' }}
            >
              <Brain size={24} style={{ color: '#d1d5db' }} />
            </div>
            <div className="text-center">
              {running ? (
                <>
                  <p className="font-medium text-sm mb-1" style={{ color: '#374151' }}>
                    Running…
                  </p>
                  <p className="text-xs" style={{ color: '#9ca3af' }}>
                    Click a node on the left to inspect its output
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-sm mb-1" style={{ color: '#374151' }}>
                    Node output
                  </p>
                  <p className="text-xs" style={{ color: '#9ca3af' }}>
                    Select a node from the graph to see thinking &amp; output
                  </p>
                </>
              )}
            </div>
            {running && (
              <div className="flex items-center gap-2">
                <ThinkingDots color="#c9a227" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
