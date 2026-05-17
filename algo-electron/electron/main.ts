import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BrowserHost } from './browser/BrowserHost'
import { initDb, closeDb } from './db/connection'
import { SiteRegistry } from './sites/siteRegistry'
import { CookieVault } from './cookies/CookieVault'
import { TrackingService } from './tracking/TrackingService'
import { getDefaultHomeUrl, saveConfig } from './app/config'
import { getRecentProblems, getOverviewStats, updateProblemTitleByUrl, getProblemDetail, deleteProblem } from './db/repositories/problemRepository'
import { resolveNavigateUrl } from './parsers/navigateUrl'
import { SyncService } from './submissions/syncService'
import { EXTRACT_PROBLEM_TITLE_SCRIPT } from './parsers/extractProblemTitleScript'
import { isValidScrapedTitle } from './parsers/titleValidation'

// 删除默认菜单栏
Menu.setApplicationMenu(null)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let browserHost: BrowserHost | null
let trackingService: TrackingService | null
let syncService: SyncService | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 创建浏览器宿主（不自动加载任何页面，显示 React 首页）
  browserHost = new BrowserHost(win)
  syncService?.setBrowserHost(browserHost)

  browserHost.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)
  })

  const scheduleTitleExtraction = (url: string) => {
    if (!url || url === 'about:blank') return
    const extract = () => {
      browserHost?.executeScript(EXTRACT_PROBLEM_TITLE_SCRIPT)
        .then((domTitle: string | null) => {
          if (isValidScrapedTitle(domTitle)) {
            updateProblemTitleByUrl(url, domTitle!)
            win?.webContents.send('problems:updated')
          }
        })
        .catch(() => { /* ignore */ })
    }
    setTimeout(extract, 2000)
    setTimeout(extract, 4500)
  }

  browserHost.setNavigateCallback((url) => {
    const identity = trackingService?.handleNavigation(url)
    if (identity) {
      win?.webContents.send('problem:detected', identity)
      win?.webContents.send('problems:updated')
      scheduleTitleExtraction(url)
    }
  })

  browserHost.setTitleChangeCallback((title, url) => {
    if (!url) return

    // CF Gym 题目页会显示 "Illegal contest ID"，自动跳 attachments
    if (title.includes('Illegal contest ID') && url.includes('codeforces.com')) {
      const match = url.match(/codeforces\.com\/(?:gym|problemset\/problem|contest)\/(\d+)/)
      if (match) {
        browserHost?.navigate(`https://codeforces.com/gym/${match[1]}/attachments`)
        return
      }
    }

    scheduleTitleExtraction(url)
  })

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

  win.once('ready-to-show', () => {
    win?.show()
  })

  win.on('maximize', () => {
    win?.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window:maximized', false)
  })

  win.on('closed', () => {
    trackingService?.endCurrentVisit()
    browserHost?.destroy()
    browserHost = null
    win = null
  })
}

// --- IPC ---

ipcMain.on('browser:navigate', (_event, url: string) => {
  browserHost?.navigate(resolveNavigateUrl(url))
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

ipcMain.on('browser:goHome', () => {
  browserHost?.hideView()
})

ipcMain.on('browser:hideView', () => {
  browserHost?.hideView()
})

ipcMain.on('browser:showView', () => {
  browserHost?.showView()
})

ipcMain.on('browser:setSidebarWidth', (_event, width: number) => {
  browserHost?.setLeftOffset(width)
})

ipcMain.handle('browser:capturePreview', async () => {
  return browserHost?.capturePreview() ?? null
})

ipcMain.on('window:minimize', () => {
  win?.minimize()
})

ipcMain.on('window:maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

ipcMain.on('window:close', () => {
  win?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return win?.isMaximized() ?? false
})

ipcMain.handle('problem:listRecent', (_event, limit?: number, platform?: string, status?: string) => {
  return getRecentProblems(limit, platform, status)
})

ipcMain.handle('problem:getDetail', (_event, problemId: string) => {
  return getProblemDetail(problemId)
})

ipcMain.handle('problem:delete', (_event, problemId: string) => {
  const ok = deleteProblem(problemId)
  if (ok) {
    win?.webContents.send('problems:updated')
  }
  return ok
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
  new SiteRegistry()
  new CookieVault()
  trackingService = new TrackingService()
  syncService = new SyncService()
  createWindow()
})
