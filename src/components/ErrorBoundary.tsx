import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * React 只有 class 组件能捕获渲染期异常，用它兜住整个内容区，
 * 避免单个页面出错导致整窗白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[render-error]', error.message, info.componentStack)
  }

  private reset = (): void => {
    this.setState({ error: null })
    window.location.hash = '#/'
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ncm/15 text-ncm-light">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[16px] font-medium text-cloud-100">这个页面出了点问题</h2>
          <p className="mt-1.5 max-w-[420px] text-[12px] leading-relaxed text-cloud-500">
            {error.message || '发生了未知渲染错误'}
          </p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-[12px] text-cloud-200 transition hover:bg-white/15 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          返回首页
        </button>
      </div>
    )
  }
}
