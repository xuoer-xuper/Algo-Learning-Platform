import { app, BrowserWindow, dialog, Menu, screen, session, type Input, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TabManager } from './browser/TabManager'
import { closeDb } from './db/connection'
import {
  getSearchConfig,
  getZoomFactorForUrl,
  loadCoachConfig,
  saveZoomFactorForUrl,
} from './app/config'
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
import { registerShellProtocol, registerShellSchemeAsPrivileged, shellUrl } from './app/appProtocol'
import { registerShellWebContents, unregisterShellWebContents } from './ipc/trustedSender'
import { dispatchShortcut, resolveShortcut, type ShortcutActions } from './shortcuts/shortcutDispatcher'
import { evaluateBrowserNavigation, type NavigationBlockReason } from './browser/navigationPolicy'
import { buildSearchUrl } from './browser/omnibox'
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
import {
  DownloadManager,
  PendingUserScriptInstallRegistry,
  getManagedDownloadDirectory,
} from './downloads'
import { AppWindow } from './windows/AppWindow'
import { ViewRegistry } from './windows/ViewRegistry'
import { WindowCreationGate } from './windows/WindowCreationGate'
import { WindowManager } from './windows/WindowManager'
import { WindowSessionRegistry } from './windows/WindowSessionRegistry'
import {
  MAIN_WINDOW_BOUNDS,
  WindowStateStore,
  installWindowStatePersistence,
  type WindowDisplayArea,
} from './windows/windowBounds'

configureChromiumCommandLine()

applyStartupSmokeUserDataPath()

let services: MainServices | null = null
let coachPetWindow: CoachPetWindow | null = null
let coachOrchestrator: CoachOrchestrator | null = null
let tabSessionStore: TabSessionStore | null = null
let downloadManager: DownloadManager | null = null
let userScriptInstallRegistry: PendingUserScriptInstallRegistry | null = null
let windowStateStore: WindowStateStore | null = null
let isQuitting = false
let isQuitSessionFlushComplete = false
let quitSessionFlushPromise: Promise<void> | null = null

const viewRegistry = new ViewRegistry()
const windowManager = new WindowManager({ viewRegistry })
const windowCreationGate = new WindowCreationGate<AppWindow>()
const windowSessionRuntimes = new WindowSessionRegistry()

function getMostRecentAppWindow(): AppWindow | null {
  return windowManager.getMostRecent()
}

const hasSingleInstanceLock = installSingleInstanceLock(
  app,
  () => getMostRecentAppWindow()?.browserWindow ?? null,
  { logger: appLogger },
)

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

function disposeWindowTabSessionPersistence(windowId: string): Promise<void> {
  return windowSessionRuntimes.dispose(windowId)
}

function disposeAllTabSessionPersistence(): Promise<void> {
  return windowSessionRuntimes.disposeAll()
}

async function createWindowOnce(isCancelled: () => boolean): Promise<AppWindow | null> {
  if (isCancelled()) return null
  const loadedSession = await loadWindowTabSession()
  if (isCancelled()) return null
  if (!windowStateStore) throw new Error('Window state store is not initialized')
  const primaryDisplayArea: WindowDisplayArea = { ...screen.getPrimaryDisplay().workArea }
  const displayAreas: WindowDisplayArea[] = screen.getAllDisplays().map((display) => ({ ...display.workArea }))
  const restoredWindowState = await windowStateStore.load(displayAreas, primaryDisplayArea)
  if (isCancelled()) return null
  const windowId = randomUUID()
  const win = new BrowserWindow({
    ...restoredWindowState.bounds,
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
  const windowStatePersistence = installWindowStatePersistence(win, windowStateStore)
  const shellWebContents = win.webContents
  const removeShellRendererRecovery = installShellRendererRecovery(win.webContents, {
    logger: appLogger,
    shouldReload: () => !isQuitting,
  })

  const allowInsecureLocalhost = Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE)
  let tabManager: TabManager
  const notifyNavigationBlocked = (reason: NavigationBlockReason): void => {
    if (!win.isDestroyed()) win.webContents.send('ui:command', { type: 'navigation-blocked', reason })
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
    tabManager.createTab(url)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openInManagedTab(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win.webContents.getURL()
    if (!currentUrl || url === currentUrl) return
    event.preventDefault()
    openInManagedTab(url)
  })

  // 创建多标签页宿主
  tabManager = new TabManager(win, {
    allowInsecureLocalhost,
    getZoomFactorForUrl,
    saveZoomFactorForUrl,
    userScriptInstallRegistry: userScriptInstallRegistry ?? undefined,
    buildSearchUrlForQuery: (query) => buildSearchUrl(query, getSearchConfig()),
    windowId,
    viewRegistry,
  })
  const appWindow = new AppWindow({
    id: windowId,
    browserWindow: win,
    tabManager,
    flushWindowState: () => windowStatePersistence.flush(),
  })
  windowManager.register(appWindow)
  coachOrchestrator?.attachAppWindow(appWindow)
  registerShellWebContents(win.webContents, appWindow)
  tabManager.setNavigationBlockedHandler(notifyNavigationBlocked)
  tabManager.setTabLimitReachedHandler((limit) => {
    appWindow.send('ui:command', { type: 'tab-limit-reached', limit })
  })
  services?.syncService.setScrapeHost(tabManager)
  services?.realtimeSubmissionService.attachTabManager(tabManager)

  const shortcutActions: ShortcutActions = {
    newTab: () => { tabManager.createTab() },
    closeTab: () => { tabManager.closeActiveTab() },
    reopenClosedTab: () => { tabManager.reopenClosedTab() },
    nextTab: () => { tabManager.switchRelative(1) },
    previousTab: () => { tabManager.switchRelative(-1) },
    switchTab: (index) => { tabManager.switchTabByIndex(index) },
    focusAddressBar: () => { appWindow.send('ui:command', { type: 'focus-address-bar' }) },
    findInPage: () => {
      if (tabManager.openFindInPage()) {
        appWindow.send('ui:command', { type: 'focus-find-in-page' })
      }
    },
    reload: () => { tabManager.reload() },
    zoomIn: () => { tabManager.adjustZoom(1) },
    zoomOut: () => { tabManager.adjustZoom(-1) },
    resetZoom: () => { tabManager.resetZoom() },
    back: () => { tabManager.goBack() },
    forward: () => { tabManager.goForward() },
    toggleDevTools: () => {
      const target = win.webContents
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
    handleShortcut(event, input, win.webContents)
  })
  tabManager.setShortcutHandler(handleShortcut)

  tabManager.setUrlChangeCallback((url) => {
    appWindow.send('browser:urlChanged', url)
  })

  tabManager.setFindInPageStateChangedHandler((state) => {
    appWindow.send('browser:findInPageResult', state)
  })

  tabManager.setZoomChangedHandler((state) => {
    appWindow.send('browser:zoomChanged', state)
  })

  installProblemTitleTracking({
    tabManager,
    getTrackingService: () => services?.trackingService ?? null,
    notifyProblemsUpdated: () => { appWindow.send('problems:updated') },
    diagnostics: services?.browserDiagnostics,
  })

  tabManager.setTabListChangedCallback((tabs) => {
    appWindow.send('tab:listChanged', tabs)
  })

  installUserScriptInjection({
    tabManager,
    getUserScriptService: () => services?.userScriptService ?? null,
    diagnostics: services?.browserDiagnostics,
  })

  if (!STARTUP_SMOKE_MODE && tabSessionStore) {
    const manager = tabManager
    const persistence = new TabSessionPersistence(
      tabSessionStore,
      () => manager.getSessionSnapshot(),
      {
        onDiagnostic: (reason) => {
          appLogger.warn('browser.session-persistence-failed', { reason })
        },
      },
    )
    const removeChangeListener = manager.addSessionChangeListener(() => {
      persistence.schedule()
    })
    windowSessionRuntimes.register(windowId, { persistence, removeChangeListener })

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
    tabManager.setOmniboxOpen(false)
    tabManager.setDownloadNoticeVisible(false)
    appWindow.send('browser:urlChanged', tabManager.getUrl())
    appWindow.send('tab:listChanged', tabManager.getTabList())
    const zoomState = tabManager.getActiveZoomState()
    if (zoomState) appWindow.send('browser:zoomChanged', zoomState)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(shellUrl('/index.html'))
  }

  win.once('ready-to-show', () => {
    if (restoredWindowState.maximized) win.maximize()
    if (!STARTUP_SMOKE_MODE) {
      win.show()
    }
  })

  win.on('maximize', () => {
    appWindow.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    appWindow.send('window:maximized', false)
  })

  const removeWindowSessionFlush = installWindowSessionFlush(win, {
    shouldFlush: () => (
      !STARTUP_SMOKE_MODE
      && !isQuitSessionFlushComplete
      && windowSessionRuntimes.has(windowId)
    ),
    flush: async () => {
      await Promise.all([
        disposeWindowTabSessionPersistence(windowId),
        appWindow.flushWindowState(),
      ])
    },
    onFailure: () => {
      appLogger.warn('browser.session-window-flush-failed')
    },
  })

  win.on('closed', () => {
    removeWindowSessionFlush()
    void disposeWindowTabSessionPersistence(windowId)
    void windowStatePersistence.dispose().catch(() => {
      appLogger.warn('window.state-dispose-failed', { windowId })
    })
    removeShellRendererRecovery()
    unregisterShellWebContents(shellWebContents)
    try {
      services?.trackingService.endVisitForWindow(windowId)
    } catch (error) {
      appLogger.warn('tracking.window-close-failed', error)
    }
    services?.realtimeSubmissionService.detachTabManager(tabManager)
    tabManager.destroy()
  })

  return appWindow
}

function createWindow(): Promise<AppWindow | null> {
  return windowCreationGate.run(createWindowOnce)
}

registerMainIpc({
  getSyncService: () => services?.syncService ?? null,
  getCoachPetWindow: () => coachPetWindow,
  getCoachOrchestrator: () => coachOrchestrator,
  getBrowserDiagnostics: () => services?.browserDiagnostics ?? null,
  getUserScriptInstallRegistry: () => userScriptInstallRegistry,
  allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE),
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
  const hasPendingWindowCreation = windowCreationGate.isRunning
  windowCreationGate.stop()
  const hasPendingWindowState = windowManager.getAll().length > 0
  if (
    !STARTUP_SMOKE_MODE
    && !isQuitSessionFlushComplete
    && (hasPendingWindowCreation || windowSessionRuntimes.size > 0 || hasPendingWindowState)
  ) {
    event.preventDefault()
    if (!quitSessionFlushPromise) {
      quitSessionFlushPromise = windowCreationGate.waitForIdle()
        .then(async () => {
          await Promise.all([
            disposeAllTabSessionPersistence(),
            windowManager.flushWindowStates(),
          ])
        })
        .finally(() => {
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
  downloadManager?.destroy()
  downloadManager = null
  userScriptInstallRegistry?.clear()
  userScriptInstallRegistry = null
  try {
    coachOrchestrator?.stop()
  } catch (error) {
    appLogger.warn('coach.stop-failed', error)
  }
  coachOrchestrator = null
  coachPetWindow?.destroy()
  coachPetWindow = null
})

app.on('activate', () => {
  if (!isQuitting && windowManager.getAll().length === 0) {
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
  userScriptInstallRegistry = new PendingUserScriptInstallRegistry()
  windowStateStore = new WindowStateStore(path.join(app.getPath('userData'), 'browser-window-state.json'))
  downloadManager = new DownloadManager({
    downloadDirectory: getManagedDownloadDirectory(app.getPath('userData')),
    interceptDownload: ({ sourceUrl }, source) => {
      const sourceContents = source as WebContents | null | undefined
      const owner = windowManager.resolveDownloadSource(sourceContents)
      return owner?.tabManager.routeUserScriptDownload(sourceUrl, sourceContents ?? null) ?? false
    },
    captureResultContext: (source) => (
      windowManager.resolveDownloadSource(source as WebContents | null | undefined)?.id
    ),
  })
  downloadManager.attachSession(session.defaultSession)
  downloadManager.attachSession(session.fromPartition('persist:oj-main'))
  downloadManager.addResultListener((result, windowId) => {
    const owner = typeof windowId === 'string' ? windowManager.get(windowId) : null
    if (!owner) return
    owner.tabManager.setDownloadNoticeVisible(true)
    owner.send('download:result', result)
  })
  configureOjSession({ getSiteById })

  registerNoteAssetProtocol()
  services = await initializeMainServices(() => getMostRecentAppWindow()?.browserWindow ?? null)
  // Only preconnect sites the user actually visited recently to avoid noisy cold-start timeouts.
  preconnectRecentSiteOrigins()

  if (!STARTUP_SMOKE_MODE) {
    tabSessionStore = new TabSessionStore(
      path.join(app.getPath('userData'), 'browser-session.json'),
      { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) },
    )
  }

  windowCreationGate.enable()
  const initialWindow = await createWindow()
  if (!initialWindow || isQuitting) return

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
        const activeWindow = getMostRecentAppWindow()
        if (activeWindow && services) {
          coachOrchestrator = new CoachOrchestrator({
            getAppWindows: () => windowManager.getAll(),
            getMostRecentAppWindow,
            addMostRecentWindowChangeListener: (listener) => (
              windowManager.addMostRecentWindowChangeListener(listener)
            ),
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
      getWindow: () => getMostRecentAppWindow()?.browserWindow ?? null,
      getTabManager: () => getMostRecentAppWindow()?.tabManager ?? null,
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
