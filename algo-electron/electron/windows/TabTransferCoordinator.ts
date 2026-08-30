import type { Rectangle } from 'electron'
import { BROWSER_LAYOUT } from '../browser/browserLayout'
import type { AppWindow } from './AppWindow'
import { errorName } from '../shared/errors'

export interface TabDragPoint {
  x: number
  y: number
}

export interface CreateTabTransferWindowOptions {
  source: AppWindow
  dropPoint?: TabDragPoint
}

export interface TabTransferCoordinatorOptions {
  createWindow(options: CreateTabTransferWindowOptions): Promise<AppWindow | null>
  getWindows(): AppWindow[]
  getMostRecentWindow?(): AppWindow | null
  onDiagnostic?(event: string, details: Record<string, unknown>): void
}

function containsPoint(bounds: Rectangle, point: TabDragPoint): boolean {
  return point.x >= bounds.x
    && point.x < bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y < bounds.y + BROWSER_LAYOUT.tabBarHeight
}

function isUsableWindow(appWindow: AppWindow): boolean {
  return !appWindow.isDestroyed() && !appWindow.browserWindow.webContents.isDestroyed()
}

export class TabTransferCoordinator {
  private readonly lockedTabIds = new Set<string>()

  constructor(private readonly options: TabTransferCoordinatorOptions) {}

  moveToNewWindow(source: AppWindow, tabId: string): Promise<boolean> {
    return this.withTabLock(tabId, () => this.transferToNewWindow(source, tabId))
  }

  finishDrag(
    source: AppWindow,
    tabId: string,
    targetIndex: number,
    screenX: number,
    screenY: number,
  ): Promise<boolean> {
    return this.withTabLock(tabId, async () => {
      if (!Number.isInteger(targetIndex) || !Number.isFinite(screenX) || !Number.isFinite(screenY)) {
        return false
      }
      const point = { x: screenX, y: screenY }
      const target = this.findTabStripAt(point)
      if (target?.id === source.id) {
        const ownsTab = source.tabManager.getTabList().some((tab) => tab.id === tabId)
        if (!ownsTab) return false
        source.tabManager.reorderTab(tabId, targetIndex)
        return true
      }
      if (target) {
        return this.transferTab(source, target, tabId, target.tabManager.getTabList().length)
      }
      return this.transferToNewWindow(source, tabId, point)
    })
  }

  private async transferToNewWindow(
    source: AppWindow,
    tabId: string,
    dropPoint?: TabDragPoint,
  ): Promise<boolean> {
    if (!isUsableWindow(source)) return false
    const target = await Promise.resolve()
      .then(() => this.options.createWindow({ source, dropPoint }))
      .catch((error: unknown) => {
        this.report('browser.tab-transfer-window-create-failed', source, tabId, error)
        return null
      })
    if (!target || !isUsableWindow(target)) {
      if (target) this.closeFailedTarget(target)
      return false
    }
    const moved = this.transferTab(source, target, tabId, 0)
    if (!moved) this.closeFailedTarget(target)
    return moved
  }

  private transferTab(
    source: AppWindow,
    target: AppWindow,
    tabId: string,
    targetIndex: number,
  ): boolean {
    if (source.id === target.id || !isUsableWindow(source) || !isUsableWindow(target)) return false
    const released = source.tabManager.releaseTab(tabId)
    if (!released) return false

    const adopted = target.tabManager.adoptTab(released, {
      activate: true,
      index: Math.max(0, Math.min(targetIndex, target.tabManager.getTabList().length)),
    })
    if (!adopted) {
      if (released.state === 'released') released.rollback()
      this.report('browser.tab-transfer-adopt-failed', source, tabId)
      return false
    }

    this.focusTarget(target)
    if (source.tabManager.getTabList().length === 0 && !source.isDestroyed()) {
      source.browserWindow.close()
    }
    return true
  }

  private findTabStripAt(point: TabDragPoint): AppWindow | null {
    const windows = this.options.getWindows().filter(isUsableWindow)
    const mostRecent = this.options.getMostRecentWindow?.() ?? null
    if (mostRecent && windows.includes(mostRecent) && containsPoint(mostRecent.browserWindow.getBounds(), point)) {
      return mostRecent
    }
    for (let index = windows.length - 1; index >= 0; index -= 1) {
      const candidate = windows[index]
      if (containsPoint(candidate.browserWindow.getBounds(), point)) return candidate
    }
    return null
  }

  private focusTarget(target: AppWindow): void {
    const window = target.browserWindow
    if (window.isMinimized()) window.restore()
    if (window.isVisible()) {
      window.focus()
      return
    }
    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return
      window.show()
      window.focus()
    })
  }

  private closeFailedTarget(target: AppWindow): void {
    try {
      if (!target.isDestroyed()) target.browserWindow.close()
    } catch {
      // A failed empty transfer window may already be closing.
    }
  }

  private async withTabLock(tabId: string, operation: () => Promise<boolean>): Promise<boolean> {
    if (!tabId || this.lockedTabIds.has(tabId)) return false
    this.lockedTabIds.add(tabId)
    try {
      return await operation()
    } finally {
      this.lockedTabIds.delete(tabId)
    }
  }

  private report(event: string, source: AppWindow, tabId: string, error?: unknown): void {
    try {
      this.options.onDiagnostic?.(event, {
        sourceWindowId: source.id,
        tabId,
        errorName: errorName(error),
      })
    } catch {
      // Diagnostics must never change transfer behavior.
    }
  }
}
