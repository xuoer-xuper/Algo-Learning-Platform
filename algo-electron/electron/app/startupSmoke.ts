import { app, BrowserWindow } from 'electron'
import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'

export const STARTUP_SMOKE_MODE = process.env.ALGO_ELECTRON_SMOKE === '1'

interface RunStartupSmokeOptions {
  getWindow: () => ElectronBrowserWindow | null
  getTabManager: () => TabManager | null
  getDefaultHomeUrl: () => string
  cleanup: () => void
}

export function applyStartupSmokeUserDataPath(): void {
  const userDataPath = process.env.ALGO_ELECTRON_SMOKE_USER_DATA
  if (STARTUP_SMOKE_MODE && userDataPath) {
    app.setPath('userData', userDataPath)
  }
}

function finishStartupSmoke(options: RunStartupSmokeOptions, exitCode: number, message: string, error?: unknown): void {
  if (exitCode === 0) {
    console.log(`[startup-smoke] ${message}`)
  } else {
    console.error(`[startup-smoke] ${message}`)
    if (error) console.error(error)
  }

  try { options.cleanup() } catch { /* ignore */ }
  app.exit(exitCode)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForActiveWebContentsUrl(
  tabManager: TabManager,
  expectedUrl: string,
  timeoutMs: number,
): Promise<string> {
  const startedAt = Date.now()
  let lastUrl = ''
  let lastError: unknown

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const href = await tabManager.executeScript('window.location.href')
      if (typeof href === 'string') {
        lastUrl = href
        if (href === expectedUrl || href.includes('default-home.html')) {
          return href
        }
      }
    } catch (error) {
      lastError = error
    }

    await delay(100)
  }

  throw new Error(
    `Timed out waiting for WebContentsView default URL load; scriptUrl=${lastUrl}; lastError=${String(lastError)}; tabs=${JSON.stringify(tabManager.getTabList())}`,
  )
}

async function waitForRendererLoad(browserWindow: ElectronBrowserWindow): Promise<void> {
  if (!browserWindow.webContents.isLoadingMainFrame()) return

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for renderer load')), 10000)
    browserWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

// Electron-only startup smoke runner. Production calls this only when ALGO_ELECTRON_SMOKE=1.
export async function runStartupSmokeTest(options: RunStartupSmokeOptions): Promise<void> {
  try {
    const win = options.getWindow()
    const tabManager = options.getTabManager()

    if (!win) throw new Error('Main window was not created')
    if (!tabManager) throw new Error('TabManager was not initialized')
    if (BrowserWindow.getAllWindows().length === 0) throw new Error('No BrowserWindow exists')

    await waitForRendererLoad(win)

    const hasBasicIpc = await win.webContents.executeJavaScript(`
      Boolean(
        window.electronAPI
        && typeof window.electronAPI.getDefaultHomeUrl === 'function'
        && typeof window.electronAPI.createTab === 'function'
        && typeof window.electronAPI.isWindowMaximized === 'function'
      )
    `) as boolean
    if (!hasBasicIpc) throw new Error('Preload electronAPI is not available')

    const expectedDefaultUrl = process.env.ALGO_ELECTRON_SMOKE_DEFAULT_URL || options.getDefaultHomeUrl()
    const defaultHomeUrl = await win.webContents.executeJavaScript('window.electronAPI.getDefaultHomeUrl()') as string
    if (defaultHomeUrl !== expectedDefaultUrl) {
      throw new Error(`Default home URL mismatch: expected ${expectedDefaultUrl}, got ${defaultHomeUrl}`)
    }

    if (!win.isVisible()) {
      win.showInactive()
    }

    const tabId = await win.webContents.executeJavaScript(
      `window.electronAPI.createTab(${JSON.stringify(defaultHomeUrl)})`,
    ) as string
    if (!tabId) throw new Error('createTab IPC returned an empty tab id')

    const loadedDefaultUrl = await waitForActiveWebContentsUrl(tabManager, defaultHomeUrl, 10000)

    const maximized = await win.webContents.executeJavaScript('window.electronAPI.isWindowMaximized()') as boolean
    if (typeof maximized !== 'boolean') throw new Error('Basic IPC did not return a boolean result')

    const activeTab = tabManager.getTabList().find((tab) => tab.isActive)
    if (!activeTab || activeTab.id !== tabId) throw new Error('Created default URL tab is not active')

    finishStartupSmoke(options, 0, `ok mainWindow=1 tab=${tabId} url=${loadedDefaultUrl || activeTab.url || tabManager.getUrl()}`)
  } catch (error) {
    finishStartupSmoke(options, 1, 'failed', error)
  }
}
