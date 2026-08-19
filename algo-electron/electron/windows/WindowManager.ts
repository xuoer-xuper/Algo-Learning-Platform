import type { WebContents } from 'electron'
import type { AppWindow } from './AppWindow'
import type { ViewRegistry } from './ViewRegistry'

interface WindowListeners {
  onFocus: () => void
  onClosed: () => void
}

export interface WindowManagerOptions {
  viewRegistry: ViewRegistry
}

export class WindowManager {
  private readonly windows = new Map<string, AppWindow>()
  private readonly listeners = new Map<string, WindowListeners>()
  private readonly mostRecentWindowChangeListeners = new Set<(window: AppWindow | null) => void>()
  private readonly windowRecency: string[] = []
  private mostRecentWindowId: string | null = null
  readonly viewRegistry: ViewRegistry

  constructor(options: WindowManagerOptions) {
    this.viewRegistry = options.viewRegistry
  }

  register(appWindow: AppWindow): void {
    if (this.windows.has(appWindow.id)) {
      throw new Error(`Window ${appWindow.id} is already registered`)
    }
    this.viewRegistry.registerShell(appWindow.id, appWindow.browserWindow.webContents)
    this.windows.set(appWindow.id, appWindow)
    this.markWindowRecent(appWindow.id)

    const onFocus = (): void => {
      if (this.windows.has(appWindow.id)) this.markWindowRecent(appWindow.id)
    }
    const onClosed = (): void => {
      this.unregister(appWindow.id)
    }
    this.listeners.set(appWindow.id, { onFocus, onClosed })
    appWindow.browserWindow.on('focus', onFocus)
    appWindow.browserWindow.once('closed', onClosed)
  }

  unregister(windowId: string): AppWindow | null {
    const appWindow = this.windows.get(windowId)
    if (!appWindow) return null
    const listeners = this.listeners.get(windowId)
    if (listeners) {
      appWindow.browserWindow.off('focus', listeners.onFocus)
      appWindow.browserWindow.off('closed', listeners.onClosed)
      this.listeners.delete(windowId)
    }
    this.windows.delete(windowId)
    const recencyIndex = this.windowRecency.indexOf(windowId)
    if (recencyIndex >= 0) this.windowRecency.splice(recencyIndex, 1)
    this.viewRegistry.unregisterWindow(windowId)
    if (this.mostRecentWindowId === windowId) {
      const nextWindow = [...this.windowRecency]
        .reverse()
        .map((candidateId) => this.windows.get(candidateId) ?? null)
        .find((candidate) => candidate !== null && !candidate.isDestroyed()) ?? null
      this.setMostRecentWindowId(nextWindow?.id ?? null)
    }
    return appWindow
  }

  get(windowId: string): AppWindow | null {
    return this.windows.get(windowId) ?? null
  }

  getAll(): AppWindow[] {
    return [...this.windows.values()]
  }

  getMostRecent(): AppWindow | null {
    if (this.mostRecentWindowId) {
      const recent = this.windows.get(this.mostRecentWindowId)
      if (recent && !recent.isDestroyed()) return recent
    }
    return this.getAll().find((candidate) => !candidate.isDestroyed()) ?? null
  }

  markRecent(windowId: string): boolean {
    const appWindow = this.windows.get(windowId)
    if (!appWindow || appWindow.isDestroyed()) return false
    this.markWindowRecent(windowId)
    return true
  }

  hasFocusedWindow(): boolean {
    return this.getAll().some((candidate) => {
      try {
        return !candidate.isDestroyed() && candidate.browserWindow.isFocused()
      } catch {
        return false
      }
    })
  }

  addMostRecentWindowChangeListener(listener: (window: AppWindow | null) => void): () => void {
    this.mostRecentWindowChangeListeners.add(listener)
    return () => {
      this.mostRecentWindowChangeListeners.delete(listener)
    }
  }

  resolveWebContents(webContents: Pick<WebContents, 'id'> | number | null | undefined): AppWindow | null {
    const entry = this.viewRegistry.get(webContents)
    return entry ? this.get(entry.windowId) : null
  }

  resolveDownloadSource(webContents: Pick<WebContents, 'id'> | number | null | undefined): AppWindow | null {
    if (webContents !== null && webContents !== undefined) return this.resolveWebContents(webContents)
    const candidates = this.getAll().filter((candidate) => !candidate.isDestroyed())
    return candidates.length === 1 ? candidates[0] : null
  }

  sendToAll(channel: string, ...args: unknown[]): void {
    for (const appWindow of this.windows.values()) appWindow.send(channel, ...args)
  }

  private setMostRecentWindowId(windowId: string | null): void {
    if (windowId === this.mostRecentWindowId) return
    this.mostRecentWindowId = windowId
    const appWindow = windowId ? this.windows.get(windowId) ?? null : null
    for (const listener of this.mostRecentWindowChangeListeners) listener(appWindow)
  }

  private markWindowRecent(windowId: string): void {
    const existingIndex = this.windowRecency.indexOf(windowId)
    if (existingIndex >= 0) this.windowRecency.splice(existingIndex, 1)
    this.windowRecency.push(windowId)
    this.setMostRecentWindowId(windowId)
  }
}
