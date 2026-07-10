import { app, BrowserWindow, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TabManager } from './browser/TabManager'
import { closeDb } from './db/connection'
import { getDefaultHomeUrl, loadCoachConfig } from './app/config'
import { configureChromiumCommandLine } from './app/chromiumFlags'
import { preconnectRecentSiteOrigins } from './app/recentSitePreconnect'
import { initializeMainServices, type MainServices } from './app/mainServices'
import { getSiteById } from './db/repositories/siteRepository'
import { installUserScriptInjection } from './scripts/userScriptInjector'
import { installProblemTitleTracking } from './tracking/problemTitleTracking'
import { registerNoteAssetProtocol, registerNoteAssetSchemeAsPrivileged } from './notes/noteAssetProtocol'
import { ensureTodaySnapshot } from './db/repositories/aiContextSnapshotRepository'
import { configureOjSession } from './browser/ojSession'
import { STARTUP_SMOKE_MODE, applyStartupSmokeUserDataPath, runStartupSmokeTest } from './app/startupSmoke'
import { registerMainIpc } from './ipc/registerMainIpc'
import { CoachPetWindow } from './coach/CoachPetWindow'
import { CoachOrchestrator } from './coach/CoachOrchestrator'

configureChromiumCommandLine()

applyStartupSmokeUserDataPath()

registerNoteAssetSchemeAsPrivileged()

// 删除默认菜单栏
Menu.setApplicationMenu(null)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tabManager: TabManager | null
let services: MainServices | null = null
let coachPetWindow: CoachPetWindow | null = null
let coachOrchestrator: CoachOrchestrator | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH || path.join(__dirname, 'preload.mjs'),
    },
  })

  // 创建多标签页宿主
  tabManager = new TabManager(win)
  services?.syncService.setBrowserHost(tabManager)
  services?.realtimeSubmissionService.attachTabManager(tabManager)

  // 注册 DevTools 快捷键（Ctrl+Shift+I / F12）
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    const isShift = input.shift
    const keyCode = input.key
    // Ctrl+Shift+I 或 F12 打开/关闭 DevTools（undocked 独立窗口，避免被网页标签页遮挡）
    if ((input.control && isShift && keyCode === 'I') || keyCode === 'F12') {
      const wc = win?.webContents
      if (!wc) return
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools()
      } else {
        wc.openDevTools({ mode: 'undocked' })
      }
    }
  })

  tabManager.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)
  })

  installProblemTitleTracking({
    tabManager,
    getTrackingService: () => services?.trackingService ?? null,
    notifyProblemDetected: (identity) => win?.webContents.send('problem:detected', identity),
    notifyProblemsUpdated: () => win?.webContents.send('problems:updated'),
  })

  tabManager.setTabListChangedCallback((tabs) => {
    win?.webContents.send('tab:listChanged', tabs)
  })

  installUserScriptInjection({
    tabManager,
    getUserScriptService: () => services?.userScriptService ?? null,
  })

  win.webContents.on('did-finish-load', () => {
    if (tabManager) {
      win?.webContents.send('browser:urlChanged', tabManager.getUrl())
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.once('ready-to-show', () => {
    if (!STARTUP_SMOKE_MODE) {
      win?.show()
    }
    if (!STARTUP_SMOKE_MODE) {
      tabManager?.warmup()
    }
  })

  win.on('maximize', () => {
    win?.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window:maximized', false)
  })

  win.on('closed', () => {
    services?.trackingService.endCurrentVisit()
    // 阶段 2：停止 Coach 服务（关当前会话 + 解绑监听）
    try { coachOrchestrator?.stop() } catch { /* ignore */ }
    coachOrchestrator = null
    tabManager?.destroy()
    tabManager = null
    // 主窗口关闭时同步销毁桌宠窗口（生命周期绑定）
    coachPetWindow?.destroy()
    coachPetWindow = null
    win = null
  })
}

registerMainIpc({
  getWindow: () => win,
  getTabManager: () => tabManager,
  getTrackingService: () => services?.trackingService ?? null,
  getSyncService: () => services?.syncService ?? null,
  getCoachPetWindow: () => coachPetWindow,
  getCoachOrchestrator: () => coachOrchestrator,
})

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在应用真正退出前清理资源，覆盖 macOS 关窗不退出、直关窗口等场景
app.on('before-quit', () => {
  try { services?.trackingService.endCurrentVisit() } catch { /* ignore */ }
  try { closeDb() } catch { /* ignore */ }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  configureOjSession({ getSiteById })

  registerNoteAssetProtocol()
  services = initializeMainServices(() => win)
  // Only preconnect sites the user actually visited recently to avoid noisy cold-start timeouts.
  preconnectRecentSiteOrigins()

  createWindow()

  // 每日首次启动时生成 AI 上下文快照存库（供阶段总结/复习计划等 AI 模块消费）
  // 失败不阻塞启动，仅记录日志
  try {
    ensureTodaySnapshot()
  } catch (err) {
    console.error('[AI] 每日快照生成失败:', err)
  }

  // 初始化 Coach 桌宠窗口（仅在非 smoke 模式且配置启用时）
  if (!STARTUP_SMOKE_MODE) {
    try {
      const coachCfg = loadCoachConfig()
      if (coachCfg.enabled) {
        coachPetWindow = new CoachPetWindow({
          preloadPath: process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH || path.join(__dirname, 'preload.mjs'),
          devServerUrl: VITE_DEV_SERVER_URL ?? undefined,
          rendererDist: RENDERER_DIST,
        })
        coachPetWindow.create()

        // 阶段 2：初始化 Coach 编排服务（规则引擎 + 比赛模式 + 事件桥）
        // 需要 TabManager / TrackingService / RealtimeSubmissionService 全部就绪
        if (tabManager && services) {
          coachOrchestrator = new CoachOrchestrator({
            getMainWindow: () => win,
            getTabManager: () => tabManager,
            getTrackingService: () => services?.trackingService ?? null,
            getRealtimeSubmissionService: () => services?.realtimeSubmissionService ?? null,
            getCoachPetWindow: () => coachPetWindow,
          })
          coachOrchestrator.start()
        }
      }
    } catch (err) {
      console.error('[coach] 桌宠窗口初始化失败:', err)
    }
  }

  if (STARTUP_SMOKE_MODE) {
    runStartupSmokeTest({
      getWindow: () => win,
      getTabManager: () => tabManager,
      getDefaultHomeUrl,
      cleanup: () => {
        try { services?.trackingService.endCurrentVisit() } catch { /* ignore */ }
        try { closeDb() } catch { /* ignore */ }
      },
    }).catch((error) => {
      console.error('[startup-smoke] failed')
      console.error(error)
      app.exit(1)
    })
  }
})
