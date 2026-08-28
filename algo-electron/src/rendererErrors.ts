import { errorMessage } from './shared/errors'

/**
 * Renderer 侧未处理错误的收集与分发。
 *
 * 主进程侧对应 `electron/app/mainProcessErrors.ts`，但两侧策略相反：主进程遇到
 * 未处理 rejection 视为致命并退出，renderer 只做提示——一次读取失败不该让整个
 * 界面消失。React `ErrorBoundary` 捕获不到 promise rejection，因此需要本模块。
 *
 * 监听在入口（`main.tsx`）安装，早于 React 挂载；App 挂载后再订阅。挂载前发生的
 * rejection 会保留在 `current` 里，等 App 订阅时补发，否则启动阶段的失败（最值得
 * 报的一类）会丢。
 */
export interface RendererErrorReport {
  /** 出错的界面区域，用于让通知能定位。全局兜底用 `'应用'`。 */
  scope: string
  message: string
  /** 同一批错误的累计次数：并发读取常常一起失败，不逐条弹。 */
  count: number
}

type RendererErrorListener = (report: RendererErrorReport | null) => void

const listeners = new Set<RendererErrorListener>()
let current: RendererErrorReport | null = null

function emit(): void {
  for (const listener of listeners) listener(current)
}

/**
 * 记录一处 renderer 错误：写 console 保留可诊断性，并推给已订阅的界面。
 *
 * 传入的是原始 error 对象而非字符串，console 里能展开 stack。
 */
export function reportRendererError(scope: string, error: unknown): void {
  console.error(`[renderer] ${scope} 失败:`, error)
  const message = errorMessage(error)
  current = current && current.message === message && current.scope === scope
    ? { scope, message, count: current.count + 1 }
    : { scope, message, count: 1 }
  emit()
}

export function dismissRendererError(): void {
  if (!current) return
  current = null
  emit()
}

/** 订阅错误；订阅时若已有未读错误立即补发（挂载前发生的那些）。 */
export function subscribeRendererErrors(listener: RendererErrorListener): () => void {
  listeners.add(listener)
  if (current) listener(current)
  return () => {
    listeners.delete(listener)
  }
}

interface RendererErrorEventTarget {
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void
  removeEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void
}

/**
 * 安装全局 `unhandledrejection` 兜底。
 *
 * 不调用 `preventDefault()`：浏览器默认的 rejection 输出对定位调用栈仍有用，
 * 这里只是在它之上补一条带区域标注的记录和一次用户可见提示。
 */
export function installRendererErrorHandlers(target: RendererErrorEventTarget): () => void {
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    reportRendererError('应用', event.reason)
  }

  target.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

/** 仅供测试：清空模块级状态，避免用例之间互相污染。 */
export function resetRendererErrorsForTest(): void {
  listeners.clear()
  current = null
}
