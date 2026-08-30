import { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from './ui'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="crash-screen">
          <h2 className="crash-title">应用崩溃了 (React Error)</h2>
          <div className="crash-detail">
            <h3 className="crash-message">{this.state.error?.toString()}</h3>
            <pre className="crash-stack">
              {this.state.errorInfo?.componentStack}
            </pre>
            <pre className="crash-stack crash-stack-raw">
              {this.state.error?.stack}
            </pre>
          </div>
          {/* 刷新是恢复动作而非破坏动作，用 primary；危险语义已由底色与标题承担 */}
          <Button
            variant="primary"
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null })
              window.location.reload()
            }}
          >
            刷新页面重试
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
