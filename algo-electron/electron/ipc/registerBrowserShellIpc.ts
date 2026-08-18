import { type BrowserWindow } from 'electron'
import { ipcMain } from './trustedSender'
import type { TabManager } from '../browser/TabManager'
import { resolveNavigateUrl } from '../parsers/navigateUrl'
import type { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'
import { isInternalPage } from '../browser/tabManagerTypes'
import { resolveOmniboxInput, type OmniboxBlockReason } from '../browser/omnibox'
import { getSearchConfig } from '../app/config'
import { getOmniboxSuggestions } from '../db/repositories/problemRepository'
import { isAppMenuAnchor, popupAppMenu } from '../contextMenus/appMenu'

interface RegisterBrowserShellIpcOptions {
  getWindow: () => BrowserWindow | null
  getTabManager: () => TabManager | null
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
  allowInsecureLocalhost?: boolean
}

function toNavigationBlockReason(
  reason: OmniboxBlockReason,
): 'invalid-url' | 'insecure-http' | 'unsupported-protocol' | null {
  if (reason === 'empty-input') return null
  if (reason === 'insecure-http' || reason === 'unsupported-protocol') return reason
  return 'invalid-url'
}

export function registerBrowserShellIpc(options: RegisterBrowserShellIpcOptions): void {
  ipcMain.handle('tab:create', (_event, url?: string) => {
    return options.getTabManager()?.createTab(url) ?? null
  })

  ipcMain.on('tab:close', (_event, tabId: string) => {
    options.getTabManager()?.closeTab(tabId)
  })

  ipcMain.handle('tab:reopenClosed', () => {
    return options.getTabManager()?.reopenClosedTab() ?? ''
  })

  ipcMain.on('tab:switch', (_event, tabId: string) => {
    options.getTabManager()?.switchTab(tabId)
  })

  ipcMain.handle('tab:reorder', (_event, tabId: unknown, targetIndex: unknown) => {
    if (typeof tabId !== 'string' || !Number.isInteger(targetIndex)) return false
    return options.getTabManager()?.reorderTab(tabId, targetIndex as number) ?? false
  })

  ipcMain.on('tab:detach', (_event, tabId: string) => {
    options.getTabManager()?.detachTab(tabId)
  })

  ipcMain.on('tab:reload', (_event, tabId: string) => {
    options.getTabManager()?.reloadTab(tabId)
  })

  ipcMain.on('tab:dismissUnresponsive', (_event, tabId: string) => {
    options.getTabManager()?.dismissUnresponsive(tabId)
  })

  ipcMain.handle('tab:openInternal', (_event, page: unknown) => {
    if (!isInternalPage(page)) return ''
    return options.getTabManager()?.openInternalTab(page) ?? ''
  })

  ipcMain.handle('tab:getList', () => {
    return options.getTabManager()?.getTabList() ?? []
  })

  ipcMain.on('browser:navigate', (_event, input: unknown) => {
    if (typeof input !== 'string') return
    const resolution = resolveOmniboxInput(input, {
      search: getSearchConfig(),
      allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
    })
    if (resolution.kind === 'blocked') {
      const reason = toNavigationBlockReason(resolution.reason)
      if (reason) options.getWindow()?.webContents.send('ui:command', { type: 'navigation-blocked', reason })
      return
    }
    if (resolution.kind === 'internal') {
      options.getTabManager()?.navigateInternal(resolution.page)
      return
    }
    options.getTabManager()?.navigate(resolveNavigateUrl(resolution.url))
  })

  ipcMain.handle('browser:omniboxSuggest', (_event, query: unknown) => {
    if (typeof query !== 'string' || query.length > 256) return []
    return getOmniboxSuggestions(query)
  })

  ipcMain.on('browser:setOmniboxOpen', (_event, open: unknown) => {
    if (typeof open !== 'boolean') return
    options.getTabManager()?.setOmniboxOpen(open)
  })

  ipcMain.on('browser:showAppMenu', (_event, anchor: unknown) => {
    if (!isAppMenuAnchor(anchor)) return
    const window = options.getWindow()
    const tabManager = options.getTabManager()
    if (!window || window.isDestroyed() || !tabManager) return
    popupAppMenu({
      window,
      anchor,
      openInternalPage: (page) => { tabManager.openInternalTab(page) },
    })
  })

  ipcMain.on('browser:goBack', () => {
    options.getTabManager()?.goBack()
  })

  ipcMain.on('browser:goForward', () => {
    options.getTabManager()?.goForward()
  })

  ipcMain.on('browser:reload', () => {
    options.getTabManager()?.reload()
  })

  ipcMain.on('browser:goHome', () => {
    options.getTabManager()?.openInternalTab({ type: 'home' }, { reuseExisting: true })
  })

  ipcMain.on('browser:setSidebarWidth', (_event, width: number) => {
    options.getTabManager()?.setLeftOffset(width)
  })

  ipcMain.handle('browser:getDiagnostics', () => {
    return options.getBrowserDiagnostics?.()?.getSnapshot() ?? { entries: [] }
  })

  ipcMain.on('window:minimize', () => {
    options.getWindow()?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    const win = options.getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', () => {
    options.getWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return options.getWindow()?.isMaximized() ?? false
  })
}
