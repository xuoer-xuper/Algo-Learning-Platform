import { ipcMain, type BrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'
import { resolveNavigateUrl } from '../parsers/navigateUrl'
import type { TrackingService } from '../tracking/TrackingService'

interface RegisterBrowserShellIpcOptions {
  getWindow: () => BrowserWindow | null
  getTabManager: () => TabManager | null
  getTrackingService: () => TrackingService | null
}

function notifyDetectedProblem(options: RegisterBrowserShellIpcOptions, url: string): void {
  const identity = options.getTrackingService()?.handleNavigation(url)
  if (!identity) return

  const win = options.getWindow()
  win?.webContents.send('problem:detected', identity)
  win?.webContents.send('problems:updated')
}

export function registerBrowserShellIpc(options: RegisterBrowserShellIpcOptions): void {
  ipcMain.handle('tab:create', (_event, url?: string) => {
    return options.getTabManager()?.createTab(url) ?? null
  })

  ipcMain.on('tab:close', (_event, tabId: string) => {
    options.getTabManager()?.closeTab(tabId)
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
    if (resolvedUrl !== url) {
      notifyDetectedProblem(options, url)
    }
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
