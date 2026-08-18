export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: () => void): unknown
}

export interface FocusableMainWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export interface SingleInstanceLogger {
  info(message: string, ...data: unknown[]): void
  warn(message: string, ...data: unknown[]): void
}

export interface SingleInstanceOptions {
  logger?: SingleInstanceLogger
}

/**
 * Claims Electron's per-user lock and routes later launches to the existing
 * shell window. The callback stays lazy so the lock can be installed before
 * BrowserWindow creation without retaining a stale window reference.
 */
export function installSingleInstanceLock(
  electronApp: SingleInstanceApp,
  getMainWindow: () => FocusableMainWindow | null,
  options: SingleInstanceOptions = {},
): boolean {
  const hasLock = electronApp.requestSingleInstanceLock()
  if (!hasLock) {
    options.logger?.info('app.single-instance-denied')
    electronApp.quit()
    return false
  }

  options.logger?.info('app.single-instance-acquired')
  electronApp.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) {
      options.logger?.warn('app.second-instance-no-window')
      return
    }

    try {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      options.logger?.info('app.second-instance-focused')
    } catch (error) {
      options.logger?.warn('app.second-instance-focus-failed', error)
    }
  })

  return true
}
