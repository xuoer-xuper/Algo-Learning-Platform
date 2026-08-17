import type { Logger } from '../shared/logger'

interface RendererGoneDetails {
  reason?: string
  exitCode?: number
}

interface ShellWebContents {
  on(event: 'render-process-gone', listener: (event: unknown, details: RendererGoneDetails) => void): unknown
  on(event: 'unresponsive' | 'responsive', listener: () => void): unknown
  off(event: 'render-process-gone', listener: (event: unknown, details: RendererGoneDetails) => void): unknown
  off(event: 'unresponsive' | 'responsive', listener: () => void): unknown
  isDestroyed(): boolean
  reload(): void
}

export interface ShellRendererRecoveryOptions {
  logger: Logger
  shouldReload?: () => boolean
  schedule?: (callback: () => void) => void
}

export function installShellRendererRecovery(
  contents: ShellWebContents,
  options: ShellRendererRecoveryOptions,
): () => void {
  const shouldReload = options.shouldReload ?? (() => true)
  const schedule = options.schedule ?? ((callback) => { setTimeout(callback, 0) })

  const onRenderProcessGone = (_event: unknown, details: RendererGoneDetails): void => {
    options.logger.error('shell.renderer-gone', {
      reason: details.reason ?? 'unknown',
      exitCode: details.exitCode,
    })
    if (details.reason === 'clean-exit' || !shouldReload()) return

    schedule(() => {
      if (contents.isDestroyed() || !shouldReload()) return
      try {
        contents.reload()
        options.logger.info('shell.renderer-reload-requested')
      } catch (error) {
        options.logger.error('shell.renderer-reload-failed', error)
      }
    })
  }
  const onUnresponsive = (): void => {
    options.logger.warn('shell.renderer-unresponsive')
  }
  const onResponsive = (): void => {
    options.logger.info('shell.renderer-responsive')
  }

  contents.on('render-process-gone', onRenderProcessGone)
  contents.on('unresponsive', onUnresponsive)
  contents.on('responsive', onResponsive)

  return () => {
    contents.off('render-process-gone', onRenderProcessGone)
    contents.off('unresponsive', onUnresponsive)
    contents.off('responsive', onResponsive)
  }
}
