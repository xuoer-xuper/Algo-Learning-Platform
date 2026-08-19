import { getShellWindowOwner, ipcMain } from './trustedSender'
import { resolveNavigateUrl } from '../parsers/navigateUrl'
import type { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'
import { isInternalPage } from '../browser/tabManagerTypes'
import { resolveOmniboxInput, type OmniboxBlockReason } from '../browser/omnibox'
import { getSearchConfig } from '../app/config'
import { getOmniboxSuggestions } from '../db/repositories/problemRepository'
import { isAppMenuAnchor, popupAppMenu } from '../contextMenus/appMenu'
import { popupShellContextMenu, readClipboardText } from '../contextMenus/browserContextMenu'
import { isZoomCommand } from '../browser/zoomPreferences'
import type { PendingUserScriptInstallRegistry } from '../downloads/userScriptNavigation'

interface RegisterBrowserShellIpcOptions {
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
  getUserScriptInstallRegistry?: () => PendingUserScriptInstallRegistry | null
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
  ipcMain.handle('tab:create', (event, url?: string) => {
    return getShellWindowOwner(event)?.tabManager.createTab(url) ?? null
  })

  ipcMain.on('tab:close', (event, tabId: string) => {
    getShellWindowOwner(event)?.tabManager.closeTab(tabId)
  })

  ipcMain.handle('tab:reopenClosed', (event) => {
    return getShellWindowOwner(event)?.tabManager.reopenClosedTab() ?? ''
  })

  ipcMain.on('tab:switch', (event, tabId: string) => {
    getShellWindowOwner(event)?.tabManager.switchTab(tabId)
  })

  ipcMain.handle('tab:reorder', (event, tabId: unknown, targetIndex: unknown) => {
    if (typeof tabId !== 'string' || !Number.isInteger(targetIndex)) return false
    return getShellWindowOwner(event)?.tabManager.reorderTab(tabId, targetIndex as number) ?? false
  })

  ipcMain.on('tab:reload', (event, tabId: string) => {
    getShellWindowOwner(event)?.tabManager.reloadTab(tabId)
  })

  ipcMain.on('tab:dismissUnresponsive', (event, tabId: string) => {
    getShellWindowOwner(event)?.tabManager.dismissUnresponsive(tabId)
  })

  ipcMain.handle('tab:openInternal', (event, page: unknown) => {
    if (!isInternalPage(page)) return ''
    return getShellWindowOwner(event)?.tabManager.openInternalTab(page) ?? ''
  })

  ipcMain.handle('tab:getList', (event) => {
    return getShellWindowOwner(event)?.tabManager.getTabList() ?? []
  })

  ipcMain.on('browser:navigate', (event, input: unknown) => {
    if (typeof input !== 'string') return
    const owner = getShellWindowOwner(event)
    if (!owner) return
    const resolution = resolveOmniboxInput(input, {
      search: getSearchConfig(),
      allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
    })
    if (resolution.kind === 'blocked') {
      const reason = toNavigationBlockReason(resolution.reason)
      if (reason) owner.send('ui:command', { type: 'navigation-blocked', reason })
      return
    }
    if (resolution.kind === 'internal') {
      owner.tabManager.navigateInternal(resolution.page)
      return
    }
    owner.tabManager.navigate(resolveNavigateUrl(resolution.url))
  })

  ipcMain.handle('browser:omniboxSuggest', (_event, query: unknown) => {
    if (typeof query !== 'string' || query.length > 256) return []
    return getOmniboxSuggestions(query)
  })

  ipcMain.on('browser:setOmniboxOpen', (event, open: unknown) => {
    if (typeof open !== 'boolean') return
    getShellWindowOwner(event)?.tabManager.setOmniboxOpen(open)
  })

  ipcMain.handle('browser:findInPage', (event, tabId: unknown, command: unknown) => {
    if (typeof tabId !== 'string') return null
    return getShellWindowOwner(event)?.tabManager.findInPage(tabId, command) ?? null
  })

  ipcMain.handle('browser:setZoom', (event, tabId: unknown, command: unknown) => {
    if (typeof tabId !== 'string' || !isZoomCommand(command)) return null
    return getShellWindowOwner(event)?.tabManager.setZoom(tabId, command) ?? null
  })

  ipcMain.on('browser:setDownloadNoticeVisible', (event, visible: unknown) => {
    if (typeof visible !== 'boolean') return
    getShellWindowOwner(event)?.tabManager.setDownloadNoticeVisible(visible)
  })

  ipcMain.handle('browser:getUserScriptInstall', (_event, installId: unknown) => {
    if (typeof installId !== 'string') return null
    return options.getUserScriptInstallRegistry?.()?.get(installId) ?? null
  })

  ipcMain.handle('browser:cancelUserScriptInstall', (_event, installId: unknown) => {
    if (typeof installId !== 'string') return false
    return options.getUserScriptInstallRegistry?.()?.consume(installId) !== null
  })

  ipcMain.on('browser:showAppMenu', (event, anchor: unknown) => {
    if (!isAppMenuAnchor(anchor)) return
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    const zoomState = tabManager.getActiveZoomState()
    popupAppMenu({
      window,
      anchor,
      openInternalPage: (page) => { tabManager.openInternalTab(page) },
      zoom: zoomState ? {
        factor: zoomState.factor,
        set: (command) => { tabManager.setZoom(zoomState.tabId, command) },
      } : undefined,
    })
  })

  ipcMain.on('browser:showTabContextMenu', (event, tabId: unknown) => {
    if (typeof tabId !== 'string' || tabId.length === 0 || tabId.length > 200) return
    getShellWindowOwner(event)?.tabManager.showTabContextMenu(tabId)
  })

  ipcMain.on('browser:showShellContextMenu', (event, kind: unknown) => {
    if (kind !== 'omnibox' && kind !== 'editor' && kind !== 'page') return
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    popupShellContextMenu({
      window,
      params: { isEditable: kind !== 'page' },
      canGoBack: tabManager.canGoBack(),
      goBack: () => tabManager.goBack(),
      reload: () => tabManager.reload(),
      pasteAndGo: kind === 'omnibox'
        ? () => {
            const value = readClipboardText()
            if (!value) return
            const resolution = resolveOmniboxInput(value, {
              search: getSearchConfig(),
              allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
            })
            if (resolution.kind === 'internal') tabManager.navigateInternal(resolution.page)
            else if (resolution.kind === 'url' || resolution.kind === 'search') tabManager.navigate(resolveNavigateUrl(resolution.url))
          }
        : undefined,
    })
  })

  ipcMain.on('browser:goBack', (event) => {
    getShellWindowOwner(event)?.tabManager.goBack()
  })

  ipcMain.on('browser:goForward', (event) => {
    getShellWindowOwner(event)?.tabManager.goForward()
  })

  ipcMain.on('browser:reload', (event) => {
    getShellWindowOwner(event)?.tabManager.reload()
  })

  ipcMain.on('browser:goHome', (event) => {
    getShellWindowOwner(event)?.tabManager.openInternalTab({ type: 'home' }, { reuseExisting: true })
  })

  ipcMain.on('browser:setSidebarWidth', (event, width: number) => {
    getShellWindowOwner(event)?.tabManager.setLeftOffset(width)
  })

  ipcMain.handle('browser:getDiagnostics', () => {
    return options.getBrowserDiagnostics?.()?.getSnapshot() ?? { entries: [] }
  })

  ipcMain.on('window:minimize', (event) => {
    getShellWindowOwner(event)?.browserWindow.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = getShellWindowOwner(event)?.browserWindow
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    getShellWindowOwner(event)?.browserWindow.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return getShellWindowOwner(event)?.browserWindow.isMaximized() ?? false
  })
}
