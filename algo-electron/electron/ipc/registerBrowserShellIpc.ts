import { type BrowserWindow } from 'electron'
import { ipcMain } from './trustedSender'
import type { TabManager } from '../browser/TabManager'
import { resolveNavigateUrl } from '../parsers/navigateUrl'
import type { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'

interface RegisterBrowserShellIpcOptions {
  getWindow: () => BrowserWindow | null
  getTabManager: () => TabManager | null
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
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

  ipcMain.on('tab:detach', (_event, tabId: string) => {
    options.getTabManager()?.detachTab(tabId)
  })

  ipcMain.handle('tab:getList', () => {
    return options.getTabManager()?.getTabList() ?? []
  })

  ipcMain.on('browser:navigate', (_event, url: string) => {
    const resolvedUrl = resolveNavigateUrl(url)
    options.getTabManager()?.navigate(resolvedUrl)
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
    options.getTabManager()?.hideView()
  })

  ipcMain.on('browser:hideView', () => {
    options.getTabManager()?.hideView()
  })

  ipcMain.on('browser:showView', () => {
    options.getTabManager()?.showView()
  })

  ipcMain.on('browser:setSidebarWidth', (_event, width: number) => {
    options.getTabManager()?.setLeftOffset(width)
  })

  ipcMain.handle('browser:capturePreview', async () => {
    return options.getTabManager()?.capturePreview() ?? null
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
