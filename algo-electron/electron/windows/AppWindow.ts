import type { BrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'

export interface AppWindowOptions {
  id: string
  browserWindow: BrowserWindow
  tabManager: TabManager
  flushWindowState?: () => Promise<void>
}

export class AppWindow {
  readonly id: string
  readonly browserWindow: BrowserWindow
  readonly tabManager: TabManager
  private readonly flushWindowStateCallback: () => Promise<void>

  constructor(options: AppWindowOptions) {
    this.id = options.id
    this.browserWindow = options.browserWindow
    this.tabManager = options.tabManager
    this.flushWindowStateCallback = options.flushWindowState ?? (() => Promise.resolve())
  }

  isDestroyed(): boolean {
    return this.browserWindow.isDestroyed()
  }

  send(channel: string, ...args: unknown[]): boolean {
    try {
      if (this.isDestroyed() || this.browserWindow.webContents.isDestroyed()) return false
      this.browserWindow.webContents.send(channel, ...args)
      return true
    } catch {
      return false
    }
  }

  flushWindowState(): Promise<void> {
    return this.flushWindowStateCallback()
  }
}
