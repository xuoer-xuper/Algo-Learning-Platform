import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { BrowserHost } from './browser/BrowserHost'
import { initDb, closeDb } from './db/connection'
import { SiteRegistry } from './sites/siteRegistry'
import { CookieVault } from './cookies/CookieVault'
import { TrackingService } from './tracking/TrackingService'
import { getDefaultHomeUrl, saveConfig } from './app/config'
import { getRecentProblems, getOverviewStats } from './db/repositories/problemRepository'

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

ipcMain.handle('problem:listRecent', (_event, limit?: number) => {
  return getRecentProblems(limit)
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
  createWindow()
})
