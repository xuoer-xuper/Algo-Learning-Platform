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

  // Smoke owns a disposable userData directory. Exit before normal Electron
  // teardown so WebContentsView/protocol utility shutdown cannot stall CI.
  if (STARTUP_SMOKE_MODE) process.exit(exitCode)
  try { options.cleanup() } catch { /* ignore */ }
  app.exit(exitCode)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function triggerPopupScript(tabManager: TabManager, code: string): void {
  // Activating the popup detaches the opener view, so Electron may leave the
  // opener's executeJavaScript promise pending even though window.open ran.
  void tabManager.executeScript(code, true).catch(() => {})
}

async function waitForActiveWebContentsUrl(
  tabManager: TabManager,
  expectedUrl: string,
  timeoutMs: number,
): Promise<string> {
  const startedAt = Date.now()
  let lastUrl = ''

  while (Date.now() - startedAt <= timeoutMs) {
    const href = tabManager.getUrl()
    lastUrl = href
    if (href === expectedUrl) return href

    await delay(100)
  }

  throw new Error(
    `Timed out waiting for WebContentsView default URL load; currentUrl=${lastUrl}; tabs=${JSON.stringify(tabManager.getTabList())}`,
  )
}

async function waitForTabCount(tabManager: TabManager, expectedCount: number, timeoutMs = 10000): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (tabManager.getTabList().length === expectedCount) return
    await delay(50)
  }
  throw new Error(`Timed out waiting for ${expectedCount} tabs; tabs=${JSON.stringify(tabManager.getTabList())}`)
}

async function waitForScriptValue(
  tabManager: TabManager,
  url: string,
  code: string,
  expectedValue: unknown,
  timeoutMs = 10000,
): Promise<unknown> {
  const startedAt = Date.now()
  let lastValue: unknown
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      lastValue = await tabManager.executeScriptOnUrl(url, code)
      if (lastValue === expectedValue) return lastValue
    } catch { /* retry while the popup and opener settle */ }
    await delay(50)
  }
  throw new Error(`Timed out waiting for script value ${String(expectedValue)}; last=${String(lastValue)}`)
}

async function closePopupAndRestore(
  tabManager: TabManager,
  openerTabId: string,
  expectedTabCount: number,
): Promise<void> {
  tabManager.closeActiveTab()
  await waitForTabCount(tabManager, expectedTabCount)
  tabManager.switchTab(openerTabId)
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
    const step = (name: string): void => { console.log(`[startup-smoke] step ${name}`) }
    const win = options.getWindow()
    const tabManager = options.getTabManager()

    if (!win) throw new Error('Main window was not created')
    if (!tabManager) throw new Error('TabManager was not initialized')
    if (BrowserWindow.getAllWindows().length === 0) throw new Error('No BrowserWindow exists')

    await waitForRendererLoad(win)
    step('shell-loaded')

    const shellLocation = await win.webContents.executeJavaScript(`({
      href: window.location.href,
      origin: window.location.origin,
    })`) as { href: string; origin: string }
    if (!shellLocation.href.startsWith('app://shell/') || shellLocation.origin !== 'app://shell') {
      throw new Error(`Unexpected shell origin: ${JSON.stringify(shellLocation)}`)
    }

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
    step('default-tab-loaded')

    const maximized = await win.webContents.executeJavaScript('window.electronAPI.isWindowMaximized()') as boolean
    if (typeof maximized !== 'boolean') throw new Error('Basic IPC did not return a boolean result')

    const activeTab = tabManager.getTabList().find((tab) => tab.isActive)
    if (!activeTab || activeTab.id !== tabId) throw new Error('Created default URL tab is not active')

    const shellPermissionState = await win.webContents.executeJavaScript(`
      navigator.permissions.query({ name: 'geolocation' }).then((result) => result.state)
    `) as string
    if (shellPermissionState !== 'denied') {
      throw new Error(`Default session permission check was not denied: ${shellPermissionState}`)
    }
    step('default-permission-check')

    const ojPermissionRequest = await tabManager.executeScript(`
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), 3000)
        navigator.geolocation.getCurrentPosition(
          () => { clearTimeout(timer); resolve('granted') },
          (error) => { clearTimeout(timer); resolve('denied:' + error.code) },
          { timeout: 1000 }
        )
      })
    `) as string
    if (ojPermissionRequest !== 'denied:1') {
      throw new Error(`OJ session permission request was not denied: ${ojPermissionRequest}`)
    }
    step('oj-permission-request')

    const openerTabId = activeTab.id
    const baseTabCount = tabManager.getTabList().length
    const baseUrl = new URL(expectedDefaultUrl)

    triggerPopupScript(tabManager, `window.open('about:blank', 'blank-popup')`)
    await waitForTabCount(tabManager, baseTabCount + 1)
    await waitForActiveWebContentsUrl(tabManager, 'about:blank', 10000)
    if (await tabManager.executeScript('Boolean(window.opener)') !== true) {
      throw new Error('about:blank popup lost its opener')
    }
    await closePopupAndRestore(tabManager, openerTabId, baseTabCount)
    step('about-blank-popup')

    const getUrl = new URL('/popup-get.html', baseUrl).toString()
    triggerPopupScript(tabManager, `window.open(${JSON.stringify(getUrl)}, 'get-popup')`)
    await waitForTabCount(tabManager, baseTabCount + 1)
    await waitForActiveWebContentsUrl(tabManager, getUrl, 10000)
    const getState = await tabManager.executeScript(`({
      opener: Boolean(window.opener),
      ready: document.body.textContent.includes('popup-get-ready'),
    })`) as { opener: boolean; ready: boolean }
    if (!getState.opener || !getState.ready) throw new Error(`GET popup state mismatch: ${JSON.stringify(getState)}`)
    await closePopupAndRestore(tabManager, openerTabId, baseTabCount)
    step('get-popup')

    const postUrl = new URL('/popup-post.html', baseUrl).toString()
    triggerPopupScript(tabManager, `
      (() => {
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = ${JSON.stringify(postUrl)}
        form.target = 'post-popup'
        const input = document.createElement('input')
        input.name = 'grant'
        input.value = 'accepted'
        form.appendChild(input)
        document.body.appendChild(form)
        form.submit()
        form.remove()
        return true
      })()
    `)
    await waitForTabCount(tabManager, baseTabCount + 1)
    await waitForActiveWebContentsUrl(tabManager, postUrl, 10000)
    const postBody = await tabManager.executeScript('document.body.textContent') as string
    if (!postBody.includes('post-body:grant=accepted')) {
      throw new Error(`POST popup body was not preserved: ${postBody}`)
    }
    await closePopupAndRestore(tabManager, openerTabId, baseTabCount)
    step('post-popup')

    const oauthUrl = new URL('/popup-oauth.html', baseUrl).toString()
    triggerPopupScript(tabManager, `
      window.__oauthSignal = null
      window.addEventListener('message', (event) => {
        if (event.origin === location.origin && event.data === 'oauth-complete') {
          window.__oauthSignal = event.data
        }
      }, { once: true })
      Boolean(window.open(${JSON.stringify(oauthUrl)}, 'oauth-popup'))
    `)
    await waitForTabCount(tabManager, baseTabCount + 1)
    await waitForActiveWebContentsUrl(tabManager, oauthUrl, 10000)
    await waitForScriptValue(tabManager, expectedDefaultUrl, 'window.__oauthSignal', 'oauth-complete')
    await closePopupAndRestore(tabManager, openerTabId, baseTabCount)
    step('oauth-popup')

    finishStartupSmoke(options, 0, `ok mainWindow=1 tab=${tabId} url=${loadedDefaultUrl || activeTab.url || tabManager.getUrl()}`)
  } catch (error) {
    finishStartupSmoke(options, 1, 'failed', error)
  }
}
