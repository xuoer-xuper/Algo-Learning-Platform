import type { Logger } from '../shared/logger'

export type FatalErrorSource = 'uncaughtException' | 'unhandledRejection' | 'startup'

interface ProcessEventSource {
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
  off?(event: 'uncaughtException', listener: (error: Error) => void): unknown
  off?(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown
}

export interface FatalErrorReporterOptions {
  logger: Logger
  showErrorBox: (title: string, content: string) => void
  exit: (code: number) => void
  showDialog?: boolean
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function createFatalErrorReporter(options: FatalErrorReporterOptions) {
  let reported = false

  return (source: FatalErrorSource, error: unknown): void => {
    options.logger.fatal('main-process.fatal', { source, error })
    if (reported) return
    reported = true

    const logPath = options.logger.getLogFilePath()
    if (options.showDialog !== false) {
      const detail = [
        '应用遇到无法恢复的主进程错误，将立即退出。',
        '',
        `来源：${source}`,
        `错误：${errorMessage(error)}`,
        logPath ? `日志：${logPath}` : '日志：文件日志尚未初始化',
      ].join('\n')
      try {
        options.showErrorBox('Algo Learning Platform', detail)
      } catch (dialogError) {
        options.logger.error('main-process.fatal-dialog-failed', dialogError)
      }
    }

    options.exit(1)
  }
}

export function installMainProcessErrorHandlers(
  processEvents: ProcessEventSource,
  reportFatalError: (source: FatalErrorSource, error: unknown) => void,
): () => void {
  const onUncaughtException = (error: Error): void => {
    reportFatalError('uncaughtException', error)
  }
  const onUnhandledRejection = (reason: unknown): void => {
    reportFatalError('unhandledRejection', reason)
  }

  processEvents.on('uncaughtException', onUncaughtException)
  processEvents.on('unhandledRejection', onUnhandledRejection)

  return () => {
    processEvents.off?.('uncaughtException', onUncaughtException)
    processEvents.off?.('unhandledRejection', onUnhandledRejection)
  }
}
