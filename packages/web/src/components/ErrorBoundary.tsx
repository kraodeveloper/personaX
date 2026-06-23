import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center h-full"
          style={{ background: '#f8f9fa' }}
        >
          <div
            className="rounded-xl p-8 max-w-md w-full mx-4"
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: '#fef2f2' }}
              >
                <span style={{ color: '#dc2626', fontSize: 18 }}>!</span>
              </div>
              <h2 className="font-semibold text-base" style={{ color: '#111827' }}>
                页面渲染出错
              </h2>
            </div>
            <p
              className="text-sm mb-6 font-mono break-all"
              style={{ color: '#6b7280', lineHeight: 1.6 }}
            >
              {this.state.error?.message ?? '未知错误'}
            </p>
            <button
              type="button"
              onClick={() => location.reload()}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: '#c9a227',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#b8911f' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#c9a227' }}
            >
              重试（刷新页面）
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
