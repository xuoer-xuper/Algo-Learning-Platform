import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BrowserHost } from './browser/BrowserHost'
import { initDb, closeDb } from './db/connection'
import { SiteRegistry } from './sites/siteRegistry'
import { CookieVault } from './cookies/CookieVault'
import { TrackingService } from './tracking/TrackingService'
import { getDefaultHomeUrl, saveConfig } from './app/config'
import { getRecentProblems, getOverviewStats, updateProblemTitleByUrl, getProblemDetail } from './db/repositories/problemRepository'
import { SyncService } from './submissions/syncService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let browserHost: BrowserHost | null
let siteRegistry: SiteRegistry | null
let cookieVault: CookieVault | null
let trackingService: TrackingService | null
let syncService: SyncService | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  browserHost = new BrowserHost(win, getDefaultHomeUrl())
  syncService?.setBrowserHost(browserHost)

  browserHost.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)
  })

  browserHost.setNavigateCallback((url) => {
    const identity = trackingService?.handleNavigation(url)
    if (identity) {
      win?.webContents.send('problem:detected', identity)
      win?.webContents.send('problems:updated')
    }
  })

  // 页面标题变化时更新题目标题
  browserHost.setTitleChangeCallback((title, url) => {
    if (title && url) {
      updateProblemTitleByUrl(url, title)
      win?.webContents.send('problems:updated')
    }
  })

  browserHost.loadDefaultUrl()

  win.webContents.on('did-finish-load', () => {
    if (browserHost) {
      win?.webContents.send('browser:urlChanged', browserHost.getUrl())
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('closed', () => {
    trackingService?.endCurrentVisit()
    browserHost?.destroy()
    browserHost = null
    win = null
  })
}

// --- IPC ---

ipcMain.on('browser:navigate', (_event, url: string) => {
  browserHost?.navigate(url)
})

ipcMain.on('browser:goBack', () => {
  browserHost?.goBack()
})

ipcMain.on('browser:goForward', () => {
  browserHost?.goForward()
})

ipcMain.on('browser:reload', () => {
  browserHost?.reload()
})

ipcMain.on('browser:setSidebarWidth', (_event, width: number) => {
  browserHost?.setLeftOffset(width)
})

ipcMain.on('browser:hideView', () => {
  browserHost?.hideView()
})

ipcMain.on('browser:showView', () => {
  browserHost?.showView()
})

ipcMain.handle('problem:listRecent', (_event, limit?: number, platform?: string, status?: string) => {
  return getRecentProblems(limit, platform, status)
})

ipcMain.handle('problem:getDetail', (_event, problemId: string) => {
  return getProblemDetail(problemId)
})

ipcMain.handle('stats:getOverview', () => {
  return getOverviewStats()
})

ipcMain.handle('config:getDefaultHomeUrl', () => {
  return getDefaultHomeUrl()
})

ipcMain.on('config:setDefaultHomeUrl', (_event, url: string) => {
  saveConfig({ defaultHomeUrl: url })
})

ipcMain.handle('submissions:syncCodeforces', async (_event, handle: string) => {
  if (!syncService) return { platform: 'codeforces', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncCodeforces(handle)
})

ipcMain.handle('submissions:syncVjudge', async () => {
  if (!syncService) return { platform: 'vjudge', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncVjudge()
})

ipcMain.handle('submissions:syncCurrentPage', async () => {
  if (!syncService) return { platform: 'unknown', fetched: 0, inserted: 0, error: 'SyncService not ready' }
  return syncService.syncCurrentPage()
})

ipcMain.handle('debug:pageStructure', async () => {
  if (!browserHost) return { error: 'no browser' }
  return browserHost.executeScript(`
    (() => {
      const tables = document.querySelectorAll('table')
      const result = []
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll('thead th, thead td')).map(c => c.textContent.trim())
        const rowCount = t.querySelectorAll('tbody tr').length
        result.push({ headers, rowCount })
      }
      // 找翻页元素
      const paginationEls = document.querySelectorAll('[class*="pagination"], [class*="pager"], [class*="page"]')
      const pagination = Array.from(paginationEls).slice(0, 5).map(el => ({
        tag: el.tagName,
        cls: el.className.slice(0, 100),
        text: el.textContent.trim().slice(0, 60)
      }))
      return { url: location.href, tables: result, pagination }
    })()
  `)
})

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    trackingService?.endCurrentVisit()
    closeDb()
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  initDb()
  siteRegistry = new SiteRegistry()
  cookieVault = new CookieVault()
  trackingService = new TrackingService()
  syncService = new SyncService()
  createWindow()
})
