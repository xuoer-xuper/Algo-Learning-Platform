import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'
import { BrowserHost } from './browser/BrowserHost'
import { initDb, closeDb, getDb } from './db/connection'
import { SiteRegistry } from './sites/siteRegistry'
import { parseUrl } from './parsers/registry'
import { CookieVault } from './cookies/CookieVault'

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

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  browserHost = new BrowserHost(win)

  browserHost.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)

    // 解析 URL，识别题目
    const identity = parseUrl(url)
    if (identity) {
      const now = new Date().toISOString()
      const db = getDb()

      // upsert problem
      db.prepare(`
        INSERT INTO problems (id, platform, platform_problem_id, canonical_url, status, first_seen_at, last_visited_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'visited', ?, ?, ?, ?)
        ON CONFLICT(platform, platform_problem_id) DO UPDATE SET
          last_visited_at = excluded.last_visited_at,
          updated_at = excluded.updated_at
      `).run(
        crypto.randomUUID(),
        identity.platform,
        identity.platformProblemId,
        identity.canonicalUrl,
        now, now, now, now,
      )

      win?.webContents.send('problem:detected', identity)
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

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
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
  createWindow()
})
