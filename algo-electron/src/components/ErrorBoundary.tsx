import { Component, ErrorInfo, ReactNode } from 'react'

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
        <div className="flex flex-col items-center justify-center h-full w-full p-8 bg-red-50 text-red-900">
          <h2 className="text-2xl font-bold mb-4">应用崩溃了 (React Error)</h2>
          <div className="bg-white p-4 rounded shadow-sm w-full max-w-4xl overflow-auto border border-red-200">
            <h3 className="font-semibold text-lg">{this.state.error?.toString()}</h3>
            <pre className="text-sm mt-4 text-left whitespace-pre-wrap font-mono">
              {this.state.errorInfo?.componentStack}
            </pre>
            <pre className="text-sm mt-4 text-left whitespace-pre-wrap font-mono opacity-70">
              {this.state.error?.stack}
            </pre>
          </div>
          <button 
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => {
              this.setState({ hasError: false, error: null, errorInfo: null })
              window.location.reload()
            }}
          >
            刷新页面重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
