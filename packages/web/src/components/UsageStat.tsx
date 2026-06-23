// ── UsageStat ─────────────────────────────────────────────────────────────────
// Reusable usage display: tokens ↑↓, cost, context-window progress bar.
// Missing fields are silently omitted.

export interface UsageStatProps {
  model?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  contextWindow?: number
}

function fmtK(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export function UsageStat({
  model,
  inputTokens,
  outputTokens,
  costUsd,
  contextWindow,
}: UsageStatProps) {
  const hasTokens = inputTokens !== undefined || outputTokens !== undefined
  const hasCost = costUsd !== undefined
  const contextPct =
    inputTokens !== undefined && contextWindow !== undefined && contextWindow > 0
      ? inputTokens / contextWindow
      : undefined

  if (!hasTokens && !hasCost && contextPct === undefined && !model) return null

  const barColor = contextPct !== undefined && contextPct > 0.8 ? '#ef4444' : '#c9a227'

  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
      {/* model label */}
      {model && (
        <span
          className="text-xs truncate"
          style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: '0.7rem' }}
          title={model}
        >
          {model}
        </span>
      )}

      {/* tokens row */}
      {hasTokens && (
        <div className="flex items-center gap-1.5" style={{ fontSize: '0.7rem', color: '#6b7280' }}>
          {inputTokens !== undefined && (
            <span title="Input tokens">
              <span style={{ color: '#9ca3af' }}>↑</span>
              {fmtK(inputTokens)}
            </span>
          )}
          {outputTokens !== undefined && (
            <span title="Output tokens">
              <span style={{ color: '#9ca3af' }}>↓</span>
              {fmtK(outputTokens)}
            </span>
          )}
        </div>
      )}

      {/* cost */}
      {hasCost && (
        <span
          title="Nominal cost (not invoiced)"
          style={{ fontSize: '0.68rem', color: '#9ca3af', cursor: 'default' }}
        >
          ${costUsd!.toFixed(4)}&nbsp;
          <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>名义</span>
        </span>
      )}

      {/* context progress bar */}
      {contextPct !== undefined && (
        <div className="flex items-center gap-1.5" style={{ minWidth: 64 }}>
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 3, background: '#f3f4f6', minWidth: 40 }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(contextPct * 100, 100).toFixed(1)}%`,
                background: barColor,
              }}
            />
          </div>
          <span
            style={{
              fontSize: '0.65rem',
              color: contextPct > 0.8 ? '#ef4444' : '#9ca3af',
              flexShrink: 0,
            }}
          >
            {(contextPct * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
