import { app, BrowserWindow, BrowserView, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const TOOLBAR_HEIGHT = 42
const DEFAULT_URL = 'https://codeforces.com'

let win: BrowserWindow | null
let view: BrowserView | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 创建 BrowserView
  view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.setBrowserView(view)

  // 设置 BrowserView 尺寸
  const [winWidth, winHeight] = win.getContentSize()
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: winWidth, height: winHeight - TOOLBAR_HEIGHT })
  view.setAutoResize({ width: true, height: true })

  // 加载默认 URL
  view.webContents.loadURL(DEFAULT_URL)

  // 监听页面导航，通知渲染进程 URL 变化
  view.webContents.on('did-navigate', (_event, url) => {
    win?.webContents.send('browser:url-changed', url)
  })
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    win?.webContents.send('browser:url-changed', url)
  })

  // 监听窗口 resize，重新设置 BrowserView 尺寸
  win.on('resize', () => {
    if (!win || !view) return
    const [w, h] = win.getContentSize()
    view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT })
  })

  // 加载渲染进程页面
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
    // 页面加载完成后，把当前 URL 发给渲染进程
    if (view) {
      win?.webContents.send('browser:url-changed', view.webContents.getURL())
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- IPC 处理 ---

ipcMain.on('browser:navigate', (_event, url: string) => {
  if (view) {
    view.webContents.loadURL(url)
  }
})

ipcMain.on('browser:go-back', () => {
  if (view?.webContents.canGoBack()) {
    view.webContents.goBack()
  }
})

ipcMain.on('browser:go-forward', () => {
  if (view?.webContents.canGoForward()) {
    view.webContents.goForward()
  }
})

ipcMain.on('browser:reload', () => {
  view?.webContents.reload()
})

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
    view = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
