import { app, BrowserWindow, dialog, Menu, type Input, type WebContents } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TabManager } from './browser/TabManager'
import { closeDb } from './db/connection'
import { loadCoachConfig } from './app/config'
import { configureChromiumCommandLine } from './app/chromiumFlags'
import { MAIN_WINDOW_BOUNDS } from './app/windowBounds'
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
import { registerShellProtocol, registerShellSchemeAsPrivileged, shellUrl } from './app/appProtocol'
import { registerShellWebContents, unregisterShellWebContents } from './ipc/trustedSender'
import { dispatchShortcut, resolveShortcut, type ShortcutActions } from './shortcuts/shortcutDispatcher'
import { evaluateBrowserNavigation, type NavigationBlockReason } from './browser/navigationPolicy'
import { appLogger, initializeAppLogger } from './shared/logger'
import { createFatalErrorReporter, installMainProcessErrorHandlers } from './app/mainProcessErrors'
import { installShellRendererRecovery } from './app/shellRendererRecovery'
import { installSingleInstanceLock } from './app/singleInstance'
import {
  TabSessionPersistence,
  TabSessionStore,
  type TabSessionLoadResult,
} from './browser/tabSessionStore'
import { installWindowSessionFlush } from './browser/tabSessionLifecycle'

configureChromiumCommandLine()

applyStartupSmokeUserDataPath()

let win: BrowserWindow | null = null
let tabManager: TabManager | null = null
let services: MainServices | null = null
let coachPetWindow: CoachPetWindow | null = null
let coachOrchestrator: CoachOrchestrator | null = null
let removeShellRendererRecovery: (() => void) | null = null
let tabSessionStore: TabSessionStore | null = null
let tabSessionPersistence: TabSessionPersistence | null = null
let removeTabSessionChangeListener: (() => void) | null = null
let isQuitting = false
let isQuitSessionFlushComplete = false
let quitSessionFlushPromise: Promise<void> | null = null

const hasSingleInstanceLock = installSingleInstanceLock(app, () => win, { logger: appLogger })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = process.env.ALGO_ELECTRON_SMOKE_RENDERER_DIST || path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// The losing process has already requested app.quit(). Keep every protocol,
// IPC, lifecycle, and database-backed service registration behind this gate.
if (hasSingleInstanceLock) {
  initializeAppLogger(path.join(app.getPath('userData'), 'logs'))
  const reportFatalError = createFatalErrorReporter({
    logger: appLogger,
    showErrorBox: (title, content) => dialog.showErrorBox(title, content),
    exit: (code) => app.exit(code),
    showDialog: !STARTUP_SMOKE_MODE,
  })
  installMainProcessErrorHandlers(process, reportFatalError)

  registerNoteAssetSchemeAsPrivileged()
  registerShellSchemeAsPrivileged()

// The frameless renderer owns the visible browser chrome. An explicit empty
// native menu prevents Electron's default_app accelerators from hijacking it.
Menu.setApplicationMenu(Menu.buildFromTemplate([]))

async function loadWindowTabSession(): Promise<TabSessionLoadResult | null> {
  if (!tabSessionStore) return null
  return tabSessionStore.load()
}

function disposeTabSessionPersistence(): Promise<void> {
  removeTabSessionChangeListener?.()
  removeTabSessionChangeListener = null
  const persistence = tabSessionPersistence
  tabSessionPersistence = null
  return persistence?.dispose() ?? Promise.resolve()
}

async function createWindow() {
  const loadedSession = await loadWindowTabSession()
  win = new BrowserWindow({
    width: MAIN_WINDOW_BOUNDS.defaultWidth,
    height: MAIN_WINDOW_BOUNDS.defaultHeight,
    minWidth: MAIN_WINDOW_BOUNDS.minWidth,
    minHeight: MAIN_WINDOW_BOUNDS.minHeight,
    show: false,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH || path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  registerShellWebContents(win.webContents)
  const shellWebContents = win.webContents
  removeShellRendererRecovery = installShellRendererRecovery(win.webContents, {
    logger: appLogger,
    shouldReload: () => !isQuitting,
  })

  const allowInsecureLocalhost = Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE)
  const notifyNavigationBlocked = (reason: NavigationBlockReason): void => {
    win?.webContents.send('ui:command', { type: 'navigation-blocked', reason })
  }
  const openInManagedTab = (url: string): void => {
    const decision = evaluateBrowserNavigation(url, {
      allowAboutBlank: true,
      allowInsecureLocalhost,
    })
    if (!decision.allowed) {
      notifyNavigationBlocked(decision.reason!)
      return
    }
    tabManager?.createTab(url)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openInManagedTab(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win?.webContents.getURL()
    if (!currentUrl || url === currentUrl) return
    event.preventDefault()
    openInManagedTab(url)
  })

  // 创建多标签页宿主
  tabManager = new TabManager(win, { allowInsecureLocalhost })
  tabManager.setNavigationBlockedHandler(notifyNavigationBlocked)
  tabManager.setTabLimitReachedHandler((limit) => {
    win?.webContents.send('ui:command', { type: 'tab-limit-reached', limit })
  })
  services?.syncService.setScrapeHost(tabManager)
  services?.realtimeSubmissionService.attachTabManager(tabManager)

  const shortcutActions: ShortcutActions = {
    newTab: () => { tabManager?.createTab() },
    closeTab: () => { tabManager?.closeActiveTab() },
    reopenClosedTab: () => { tabManager?.reopenClosedTab() },
    nextTab: () => { tabManager?.switchRelative(1) },
    previousTab: () => { tabManager?.switchRelative(-1) },
    switchTab: (index) => { tabManager?.switchTabByIndex(index) },
    focusAddressBar: () => { win?.webContents.send('ui:command', { type: 'focus-address-bar' }) },
    reload: () => { tabManager?.reload() },
    zoomIn: () => { tabManager?.adjustZoom(0.1) },
    zoomOut: () => { tabManager?.adjustZoom(-0.1) },
    resetZoom: () => { tabManager?.resetZoom() },
    back: () => { tabManager?.goBack() },
    forward: () => { tabManager?.goForward() },
    toggleDevTools: () => {
      const target = win?.webContents
      if (!target) return
      if (target.isDevToolsOpened()) target.closeDevTools()
      else target.openDevTools({ mode: 'undocked' })
    },
  }

  const handleShortcut = (event: Electron.Event, input: Input, _source: WebContents): void => {
    const command = resolveShortcut(input)
    if (!command) return
    event.preventDefault()
    dispatchShortcut(command, shortcutActions)
  }

  win.webContents.on('before-input-event', (event, input) => {
    handleShortcut(event, input, win!.webContents)
  })
  tabManager.setShortcutHandler(handleShortcut)

  tabManager.setUrlChangeCallback((url) => {
    win?.webContents.send('browser:urlChanged', url)
  })

  installProblemTitleTracking({
    tabManager,
    getTrackingService: () => services?.trackingService ?? null,
    notifyProblemsUpdated: () => win?.webContents.send('problems:updated'),
    diagnostics: services?.browserDiagnostics,
  })

  tabManager.setTabListChangedCallback((tabs) => {
    win?.webContents.send('tab:listChanged', tabs)
  })

  installUserScriptInjection({
    tabManager,
    getUserScriptService: () => services?.userScriptService ?? null,
    diagnostics: services?.browserDiagnostics,
  })

  if (!STARTUP_SMOKE_MODE && tabSessionStore) {
    const manager = tabManager
    tabSessionPersistence = new TabSessionPersistence(
      tabSessionStore,
      () => manager.getSessionSnapshot(),
      {
        onDiagnostic: (reason) => {
          appLogger.warn('browser.session-persistence-failed', { reason })
        },
      },
    )
    removeTabSessionChangeListener = manager.addSessionChangeListener(() => {
      tabSessionPersistence?.schedule()
    })

    const restored = loadedSession?.kind === 'restore'
      ? manager.restoreSession(loadedSession.snapshot)
      : false
    if (restored) {
      appLogger.info('browser.session-restored', { tabCount: manager.getTabList().length })
    } else {
      const fallbackReason = loadedSession?.kind === 'fallback'
        ? loadedSession.reason
        : loadedSession?.kind === 'restore'
          ? 'restore-rejected'
          : 'store-unavailable'
      appLogger.info('browser.session-fallback', { reason: fallbackReason })
      manager.ensureInitialTab()
    }
  } else if (STARTUP_SMOKE_MODE) {
    tabManager.ensureInitialTab()
  }

  win.webContents.on('did-finish-load', () => {
    if (tabManager) {
      win?.webContents.send('browser:urlChanged', tabManager.getUrl())
      win?.webContents.send('tab:listChanged', tabManager.getTabList())
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(shellUrl('/index.html'))
  }

  win.once('ready-to-show', () => {
    if (!STARTUP_SMOKE_MODE) {
      win?.show()
    }
  })

  win.on('maximize', () => {
    win?.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window:maximized', false)
  })

  const removeWindowSessionFlush = installWindowSessionFlush(win, {
    shouldFlush: () => (
      !STARTUP_SMOKE_MODE
      && !isQuitSessionFlushComplete
      && tabSessionPersistence !== null
    ),
    flush: disposeTabSessionPersistence,
    onFailure: () => {
      appLogger.warn('browser.session-window-flush-failed')
    },
  })

  win.on('closed', () => {
    removeWindowSessionFlush()
    void disposeTabSessionPersistence()
    win = null
    removeShellRendererRecovery?.()
    removeShellRendererRecovery = null
    unregisterShellWebContents(shellWebContents)
    try {
      services?.trackingService.endCurrentVisit()
    } catch (error) {
      appLogger.warn('tracking.window-close-failed', error)
    }
    // 阶段 2：停止 Coach 服务（关当前会话 + 解绑监听）
    try {
      coachOrchestrator?.stop()
    } catch (error) {
      appLogger.warn('coach.stop-failed', error)
    }
    coachOrchestrator = null
    tabManager?.destroy()
    tabManager = null
    // 主窗口关闭时同步销毁桌宠窗口（生命周期绑定）
    coachPetWindow?.destroy()
    coachPetWindow = null
  })
}

registerMainIpc({
  getWindow: () => win,
  getTabManager: () => tabManager,
  getSyncService: () => services?.syncService ?? null,
  getCoachPetWindow: () => coachPetWindow,
  getCoachOrchestrator: () => coachOrchestrator,
  getBrowserDiagnostics: () => services?.browserDiagnostics ?? null,
})

// --- App 生命周期 ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在应用真正退出前清理资源，覆盖 macOS 关窗不退出、直关窗口等场景
app.on('before-quit', (event) => {
  isQuitting = true
  if (!STARTUP_SMOKE_MODE && !isQuitSessionFlushComplete && tabSessionPersistence) {
    event.preventDefault()
    if (!quitSessionFlushPromise) {
      quitSessionFlushPromise = disposeTabSessionPersistence().finally(() => {
        isQuitSessionFlushComplete = true
        app.quit()
      })
    }
    return
  }
  try {
    services?.trackingService.endCurrentVisit()
  } catch (error) {
    appLogger.warn('tracking.shutdown-failed', error)
  }
  try {
    closeDb()
  } catch (error) {
    appLogger.warn('db.close-failed', error)
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().catch((error) => {
      reportFatalError('startup', error)
    })
  }
})

void app.whenReady().then(async () => {
  appLogger.info('app.ready')
  if (!VITE_DEV_SERVER_URL) {
    registerShellProtocol(RENDERER_DIST)
  }
  configureOjSession({ getSiteById })

  registerNoteAssetProtocol()
  services = await initializeMainServices(() => win)
  // Only preconnect sites the user actually visited recently to avoid noisy cold-start timeouts.
  preconnectRecentSiteOrigins()

  if (!STARTUP_SMOKE_MODE) {
    tabSessionStore = new TabSessionStore(
      path.join(app.getPath('userData'), 'browser-session.json'),
      { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) },
    )
  }

  await createWindow()

  // 每日首次启动时生成 AI 上下文快照存库（供阶段总结/复习计划等 AI 模块消费）
  // 失败不阻塞启动，仅记录日志
  try {
    ensureTodaySnapshot()
  } catch (err) {
    appLogger.error('ai.daily-snapshot-failed', err)
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
      appLogger.error('coach.startup-failed', err)
    }
  }

  if (STARTUP_SMOKE_MODE) {
    runStartupSmokeTest({
      getWindow: () => win,
      getTabManager: () => tabManager,
      cleanup: () => {
        try {
          services?.trackingService.endCurrentVisit()
        } catch (error) {
          appLogger.warn('tracking.smoke-cleanup-failed', error)
        }
        try {
          closeDb()
        } catch (error) {
          appLogger.warn('db.smoke-cleanup-failed', error)
        }
      },
    }).catch((error) => {
      reportFatalError('startup', error)
    })
  }
}).catch((error) => {
  reportFatalError('startup', error)
})
}
