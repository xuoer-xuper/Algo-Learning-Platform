import type { BrowserWindow } from 'electron'
import { toRejectionError } from '../shared/errors'

export interface WindowSessionFlushOptions {
  shouldFlush(): boolean
  flush(): Promise<void>
  onFailure?(): void
}

export function installWindowSessionFlush(
  window: BrowserWindow,
  options: WindowSessionFlushOptions,
): () => void {
  let allowClose = false
  let flushPromise: Promise<void> | null = null

  const handleClose = (event: Electron.Event): void => {
    if (allowClose) return
    if (flushPromise) {
      event.preventDefault()
      return
    }
    if (!options.shouldFlush()) return
    event.preventDefault()

    let requestedFlush: Promise<void>
    try {
      requestedFlush = options.flush()
    } catch (error) {
      // 同步抛出的原因不一定已经是 Error：包一层，保留原始描述供 onFailure 排查。
      requestedFlush = Promise.reject(toRejectionError(error))
    }
    flushPromise = requestedFlush
      .catch(() => {
        try {
          options.onFailure?.()
        } catch {
          // Diagnostics must not block the close path.
        }
      })
      .finally(() => {
        allowClose = true
        if (!window.isDestroyed()) window.close()
      })
  }

  window.on('close', handleClose)
  return () => {
    window.off('close', handleClose)
  }
}
