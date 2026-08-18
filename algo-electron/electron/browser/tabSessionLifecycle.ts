import type { BrowserWindow } from 'electron'

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
    if (allowClose || !options.shouldFlush()) return
    event.preventDefault()
    if (flushPromise) return

    let requestedFlush: Promise<void>
    try {
      requestedFlush = options.flush()
    } catch (error) {
      requestedFlush = Promise.reject(error)
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
