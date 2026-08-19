import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  screen,
  session,
  type Input,
  type Rectangle,
  type WebContents,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TabManager } from './browser/TabManager'
import { BROWSER_LAYOUT } from './browser/browserLayout'
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
import { grantUserScriptHost } from './db/repositories/userScriptRuntimeRepository'
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
import {
  TabTransferCoordinator,
  type CreateTabTransferWindowOptions,
} from './windows/TabTransferCoordinator'
import {
  createApplicationSessionSnapshot,
  getApplicationWindowsInRestoreOrder,
  type ApplicationSessionSnapshot,
  type ApplicationWindowSessionSnapshot,
} from './windows/applicationSessionSnapshot'
import {
  ApplicationSessionPersistence,
  ApplicationSessionStore,
  type ApplicationSessionLoadResult,
} from './windows/applicationSessionStore'
import {
  MAIN_WINDOW_BOUNDS,
  WindowStateStore,
  normalizeWindowState,
  type WindowDisplayArea,
} from './windows/windowBounds'
import {
  installUserScriptRuntimeBridge,
  type UserScriptRuntimeBridge,
} from './scripts/userScriptRuntimeBridge'
import { USER_SCRIPT_BOOTSTRAP_PRELOAD_PATH } from './scripts/userScriptRuntimeConfig'
import { UserScriptHostPermissionBroker } from './scripts/UserScriptHostPermissionBroker'
import { UserScriptMenuRegistry } from './scripts/UserScriptMenuRegistry'
import { UserScriptNetworkProxy } from './scripts/UserScriptNetworkProxy'
import { CredentialVault } from './credentials/CredentialVault'
import { CredentialAutofillService } from './credentials/autofill/CredentialAutofillService'
import { CredentialCaptureService } from './credentials/CredentialCaptureService'

configureChromiumCommandLine()

applyStartupSmokeUserDataPath()

let services: MainServices | null = null
let userScriptRuntimeBridge: UserScriptRuntimeBridge | null = null
let userScriptHostPermissionBroker: UserScriptHostPermissionBroker | null = null
let userScriptMenuRegistry: UserScriptMenuRegistry | null = null
let removeUserScriptGenerationListener: (() => void) | null = null
let coachPetWindow: CoachPetWindow | null = null
let coachOrchestrator: CoachOrchestrator | null = null
let legacyTabSessionStore: TabSessionStore | null = null
let applicationSessionStore: ApplicationSessionStore | null = null
let applicationSessionPersistence: ApplicationSessionPersistence | null = null
let removeApplicationRecencyListener: (() => void) | null = null
let downloadManager: DownloadManager | null = null
let userScriptInstallRegistry: PendingUserScriptInstallRegistry | null = null
let credentialAutofillService: CredentialAutofillService | null = null
let credentialCaptureService: CredentialCaptureService | null = null
let windowStateStore: WindowStateStore | null = null
let isQuitting = false
let isQuitSessionFlushComplete = false
let quitSessionFlushPromise: Promise<void> | null = null

const viewRegistry = new ViewRegistry()
const windowManager = new WindowManager({ viewRegistry })
const windowCreationGate = new WindowCreationGate<AppWindow>()
const credentialVault = new CredentialVault()

function getMostRecentAppWindow(): AppWindow | null {
  return windowManager.getMostRecent()
}

function quitIfLastShellWindowClosed(): void {
  if (isQuitting || windowManager.getAll().length > 0) return
  coachPetWindow?.destroy()
  app.quit()
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
export const RENDERER_DIST = STARTUP_SMOKE_MODE && process.env.ALGO_ELECTRON_SMOKE_RENDERER_DIST
  ? process.env.ALGO_ELECTRON_SMOKE_RENDERER_DIST
  : path.join(process.env.APP_ROOT, 'dist')

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

function scheduleApplicationSession(): void {
  applicationSessionPersistence?.schedule()
}

function getCurrentApplicationSessionSnapshot(): ApplicationSessionSnapshot {
  const candidates = windowManager.getAll().flatMap((appWindow) => {
    if (appWindow.isDestroyed()) return []
    try {
      const tabSession = appWindow.tabManager.getSessionSnapshot()
      if (tabSession.tabs.length === 0) return []
      return [{
        id: appWindow.id,
        bounds: appWindow.browserWindow.getNormalBounds(),
        maximized: appWindow.browserWindow.isMaximized(),
        activeTabId: tabSession.activeTabId,
        tabs: tabSession.tabs,
      }]
    } catch {
      return []
    }
  })
  return createApplicationSessionSnapshot(
    candidates,
    windowManager.getMostRecent()?.id ?? null,
    { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) },
  )
}

async function loadStartupApplicationSession(): Promise<{
  result: ApplicationSessionLoadResult
  migratedLegacy: boolean
}> {
  if (!applicationSessionStore) {
    return { result: { kind: 'fallback', reason: 'missing' }, migratedLegacy: false }
  }
  const result = await applicationSessionStore.load()
  if (result.kind === 'restore' || result.reason !== 'missing' || !legacyTabSessionStore || !windowStateStore) {
    return { result, migratedLegacy: false }
  }

  const legacyTabs: TabSessionLoadResult = await legacyTabSessionStore.load()
  if (legacyTabs.kind !== 'restore' || legacyTabs.snapshot.tabs.length === 0) {
    return { result, migratedLegacy: false }
  }
  const primaryDisplayArea: WindowDisplayArea = { ...screen.getPrimaryDisplay().workArea }
  const displayAreas: WindowDisplayArea[] = screen.getAllDisplays().map((display) => ({ ...display.workArea }))
  const legacyWindowState = await windowStateStore.load(displayAreas, primaryDisplayArea)
  const windowId = randomUUID()
  return {
    result: {
      kind: 'restore',
      snapshot: createApplicationSessionSnapshot([{
        id: windowId,
        bounds: legacyWindowState.bounds,
        maximized: legacyWindowState.maximized,
        activeTabId: legacyTabs.snapshot.activeTabId,
        tabs: legacyTabs.snapshot.tabs,
      }], windowId, { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) }),
    },
    migratedLegacy: true,
  }
}

interface CreateWindowOptions {
  initialBounds?: Rectangle
  restoreSnapshot?: ApplicationWindowSessionSnapshot
  ensureInitialTab?: boolean
  activateOnShow?: boolean
}

async function createWindowOnce(
  isCancelled: () => boolean,
  options: CreateWindowOptions = {},
): Promise<AppWindow | null> {
  if (isCancelled()) return null
  if (!windowStateStore) throw new Error('Window state store is not initialized')
  const primaryDisplayArea: WindowDisplayArea = { ...screen.getPrimaryDisplay().workArea }
  const displayAreas: WindowDisplayArea[] = screen.getAllDisplays().map((display) => ({ ...display.workArea }))
  const restoredWindowState = options.restoreSnapshot
    ? normalizeWindowState(
        {
          version: 1,
          bounds: options.restoreSnapshot.bounds,
          maximized: options.restoreSnapshot.maximized,
        },
        displayAreas,
        primaryDisplayArea,
      )
    : options.initialBounds
    ? normalizeWindowState(
        { version: 1, bounds: options.initialBounds, maximized: false },
        displayAreas,
        primaryDisplayArea,
      )
    : await windowStateStore.load(displayAreas, primaryDisplayArea)
  if (isCancelled()) return null
  const windowId = options.restoreSnapshot?.id ?? randomUUID()
  const win = new BrowserWindow({
    ...restoredWindowState.bounds,
    minWidth: MAIN_WINDOW_BOUNDS.minWidth,
    minHeight: MAIN_WINDOW_BOUNDS.minHeight,
    show: false,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: STARTUP_SMOKE_MODE && process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH
        ? process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH
        : path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
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
    getUserScriptMenuCommands: webContentsId => userScriptMenuRegistry?.getForWebContents(webContentsId) ?? [],
  })
  const appWindow = new AppWindow({
    id: windowId,
    browserWindow: win,
    tabManager,
  })
  windowManager.register(appWindow)
  win.once('closed', () => userScriptHostPermissionBroker?.cancelWindow(windowId))
  coachOrchestrator?.attachAppWindow(appWindow)
  registerShellWebContents(win.webContents, appWindow)
  tabManager.setNavigationBlockedHandler(notifyNavigationBlocked)
  tabManager.setTabLimitReachedHandler((limit) => {
    appWindow.send('ui:command', { type: 'tab-limit-reached', limit })
  })
  tabManager.setTabDetachHandler((tabId) => {
    void tabTransferCoordinator.moveToNewWindow(appWindow, tabId)
  })
  tabManager.setLastTabClosedHandler(() => {
    if (!win.isDestroyed()) win.close()
  })
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
      if (!VITE_DEV_SERVER_URL && !STARTUP_SMOKE_MODE) return
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
    notifyProblemsUpdated: () => { windowManager.sendToAll('problems:updated') },
    diagnostics: services?.browserDiagnostics,
  })

  tabManager.setTabListChangedCallback((tabs) => {
    appWindow.send('tab:listChanged', tabs)
  })

  const removeTabSessionListener = tabManager.addSessionChangeListener(scheduleApplicationSession)
  win.on('move', scheduleApplicationSession)
  win.on('resize', scheduleApplicationSession)
  win.on('maximize', scheduleApplicationSession)
  win.on('unmaximize', scheduleApplicationSession)

  if (options.restoreSnapshot) {
    const restored = tabManager.restoreSession({
      version: 1,
      activeTabId: options.restoreSnapshot.activeTabId,
      tabs: options.restoreSnapshot.tabs,
    })
    if (restored) {
      appLogger.info('browser.session-window-restored', {
        windowId,
        tabCount: tabManager.getTabList().length,
      })
    } else {
      appLogger.warn('browser.session-window-restore-rejected', { windowId })
      tabManager.ensureInitialTab()
    }
  } else if (options.ensureInitialTab !== false) {
    tabManager.ensureInitialTab()
  }

  win.webContents.on('did-finish-load', () => {
    tabManager.setOmniboxOpen(false)
    tabManager.setDownloadNoticeVisible(false)
    appWindow.send('browser:urlChanged', tabManager.getUrl())
    appWindow.send('tab:listChanged', tabManager.getTabList())
    const zoomState = tabManager.getActiveZoomState()
    if (zoomState) appWindow.send('browser:zoomChanged', zoomState)
    coachOrchestrator?.syncContestModeState(appWindow)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(shellUrl('/index.html'))
  }

  win.once('ready-to-show', () => {
    if (restoredWindowState.maximized) win.maximize()
    if (!STARTUP_SMOKE_MODE) {
      if (options.activateOnShow === false) win.showInactive()
      else win.show()
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
      && applicationSessionPersistence !== null
    ),
    flush: async () => {
      await applicationSessionPersistence?.flush()
    },
    onFailure: () => {
      appLogger.warn('browser.session-window-flush-failed')
    },
  })

  win.on('closed', () => {
    removeWindowSessionFlush()
    removeTabSessionListener()
    win.off('move', scheduleApplicationSession)
    win.off('resize', scheduleApplicationSession)
    win.off('maximize', scheduleApplicationSession)
    win.off('unmaximize', scheduleApplicationSession)
    removeShellRendererRecovery()
    unregisterShellWebContents(shellWebContents)
    try {
      services?.trackingService.endVisitForWindow(windowId)
    } catch (error) {
      appLogger.warn('tracking.window-close-failed', error)
    }
    services?.realtimeSubmissionService.detachTabManager(tabManager)
    tabManager.setTabDetachHandler(null)
    tabManager.setLastTabClosedHandler(null)
    tabManager.destroy()
    if (!isQuitting && windowManager.getAll().length > 0) {
      void applicationSessionPersistence?.flush()
    }
    quitIfLastShellWindowClosed()
  })

  return appWindow
}

function createWindow(options: CreateWindowOptions = {}): Promise<AppWindow | null> {
  return windowCreationGate.run((isCancelled) => createWindowOnce(isCancelled, options))
}

function getTransferWindowBounds(options: CreateTabTransferWindowOptions): Rectangle {
  const sourceBounds = options.source.browserWindow.getBounds()
  if (!options.dropPoint) {
    return { ...sourceBounds, x: sourceBounds.x + 24, y: sourceBounds.y + 24 }
  }
  return {
    ...sourceBounds,
    x: Math.round(options.dropPoint.x - Math.min(240, sourceBounds.width / 4)),
    y: Math.round(options.dropPoint.y - BROWSER_LAYOUT.tabBarHeight / 2),
  }
}

const tabTransferCoordinator = new TabTransferCoordinator({
  createWindow: (options) => createWindowOnce(
    () => isQuitting,
    {
      initialBounds: getTransferWindowBounds(options),
      ensureInitialTab: false,
    },
  ),
  getWindows: () => windowManager.getAll(),
  getMostRecentWindow: () => windowManager.getMostRecent(),
  onDiagnostic: (event, details) => {
    appLogger.warn(event, details)
  },
})

registerMainIpc({
  credentialVault,
  getCredentialAutofillService: () => credentialAutofillService,
  getCredentialCaptureService: () => credentialCaptureService,
  getSyncService: () => services?.syncService ?? null,
  getUserScriptRuntime: () => services?.userScriptRuntime ?? null,
  getCoachPetWindow: () => coachPetWindow,
  getCoachOrchestrator: () => coachOrchestrator,
  getBrowserDiagnostics: () => services?.browserDiagnostics ?? null,
  getUserScriptInstallRegistry: () => userScriptInstallRegistry,
  allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE),
  notifyProblemsUpdated: () => { windowManager.sendToAll('problems:updated') },
  moveTabToNewWindow: (source, tabId) => tabTransferCoordinator.moveToNewWindow(source, tabId),
  finishTabDrag: (source, tabId, targetIndex, screenX, screenY) => (
    tabTransferCoordinator.finishDrag(source, tabId, targetIndex, screenX, screenY)
  ),
  getUserScriptHostPermissionPrompt: owner => userScriptHostPermissionBroker?.getCurrent(owner.id) ?? null,
  respondUserScriptHostPermission: (owner, promptId, allow) => (
    userScriptHostPermissionBroker?.respond(owner.id, promptId, allow) ?? Promise.resolve('stale')
  ),
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
  try {
    credentialCaptureService?.dispose()
    credentialCaptureService = null
  } catch (error) {
    appLogger.warn('credentials.capture-dispose-failed', error)
  }
  const hasPendingWindowCreation = windowCreationGate.isRunning
  windowCreationGate.stop()
  const hasOpenShellWindows = windowManager.getAll().length > 0
  if (
    !STARTUP_SMOKE_MODE
    && !isQuitSessionFlushComplete
    && (hasPendingWindowCreation || (applicationSessionPersistence !== null && hasOpenShellWindows))
  ) {
    event.preventDefault()
    if (!quitSessionFlushPromise) {
      quitSessionFlushPromise = windowCreationGate.waitForIdle()
        .then(async () => {
          await applicationSessionPersistence?.dispose()
        })
        .finally(() => {
          isQuitSessionFlushComplete = true
          app.quit()
        })
    }
    return
  }
  try {
    credentialAutofillService?.dispose()
    credentialAutofillService = null
  } catch (error) {
    appLogger.warn('credentials.autofill-dispose-failed', error)
  }
  try {
    userScriptRuntimeBridge?.dispose()
    userScriptRuntimeBridge = null
  } catch (error) {
    appLogger.warn('userscript.runtime-dispose-failed', error)
  }
  removeUserScriptGenerationListener?.()
  removeUserScriptGenerationListener = null
  userScriptHostPermissionBroker?.dispose()
  userScriptHostPermissionBroker = null
  userScriptMenuRegistry?.clear()
  userScriptMenuRegistry = null
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
  removeApplicationRecencyListener?.()
  removeApplicationRecencyListener = null
  applicationSessionPersistence = null
  applicationSessionStore = null
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
  const ojSession = configureOjSession({ getSiteById })
  credentialAutofillService = new CredentialAutofillService(
    { ojSession },
    {
      vault: credentialVault,
      selectionHost: {
        getWindowId: contents => windowManager.resolveWebContents(contents.id)?.id ?? null,
        showPrompt: (windowId, prompt) => windowManager.get(windowId)?.send('credentials:autofillPrompt', prompt) ?? false,
        setNoticeVisible: (windowId, visible) => {
          windowManager.get(windowId)?.tabManager.setCredentialAutofillNoticeVisible(visible)
        },
      },
    },
  )
  credentialAutofillService.attach()
  credentialCaptureService = new CredentialCaptureService(
    { ojSession },
    {
      vault: credentialVault,
      captureHost: {
        getWindowId: contents => windowManager.resolveWebContents(contents.id)?.id ?? null,
        showPrompt: (windowId, prompt) => windowManager.get(windowId)?.send('credentials:capturePrompt', prompt) ?? false,
        setNoticeVisible: (windowId, visible) => {
          windowManager.get(windowId)?.tabManager.setCredentialCaptureNoticeVisible(visible)
        },
        sendResult: (windowId, result) => windowManager.get(windowId)?.send('credentials:captureResult', result),
      },
    },
  )
  credentialCaptureService.attach()

  registerNoteAssetProtocol()
  services = await initializeMainServices(() => { windowManager.sendToAll('problems:updated') })
  userScriptMenuRegistry = new UserScriptMenuRegistry()
  userScriptHostPermissionBroker = new UserScriptHostPermissionBroker({
    grantUserScriptHost,
    send: (windowId, prompt) => windowManager.get(windowId)?.send('userscript:hostPermissionRequested', prompt) ?? false,
    show: (windowId) => { windowManager.get(windowId)?.tabManager.setUserScriptPermissionNoticeVisible(true) },
    hide: (windowId) => { windowManager.get(windowId)?.tabManager.setUserScriptPermissionNoticeVisible(false) },
    validate: (request) => {
      if (request.generation !== services?.userScriptRuntime.generation || request.webContentsId === undefined) return false
      return windowManager.resolveWebContents(request.webContentsId)?.id === request.windowId
    },
  })
  let permissionGeneration = services.userScriptRuntime.generation
  removeUserScriptGenerationListener = services.userScriptRuntime.addGenerationChangeListener((generation) => {
    userScriptHostPermissionBroker?.cancelGeneration(permissionGeneration)
    permissionGeneration = generation
  })
  const userScriptNetworkProxy = new UserScriptNetworkProxy({
    fetch: ojSession.fetch.bind(ojSession),
    allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE),
    requestPermission: (context, target) => {
      const owner = windowManager.resolveWebContents(context.webContentsId)
      if (!owner || !userScriptHostPermissionBroker || !services) return Promise.resolve(false)
      let sourceHost: string
      try { sourceHost = new URL(context.frameUrl).hostname.toLowerCase() }
      catch { return Promise.resolve(false) }
      return userScriptHostPermissionBroker.request({
        windowId: owner.id,
        generation: services.userScriptRuntime.generation,
        scriptId: context.scriptId,
        scriptName: context.scriptName,
        targetHost: target.permissionHost,
        sourceHost,
        webContentsId: context.webContentsId,
      })
    },
  })
  userScriptRuntimeBridge = installUserScriptRuntimeBridge({
    runtime: services.userScriptRuntime,
    session: ojSession,
    preloadPath: USER_SCRIPT_BOOTSTRAP_PRELOAD_PATH,
    catalogPreloadPath: path.join(app.getPath('userData'), 'userscript-runtime-catalog.mjs'),
    allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL || STARTUP_SMOKE_MODE),
    networkProxy: userScriptNetworkProxy,
    menuRegistry: userScriptMenuRegistry,
  })
  // Only preconnect sites the user actually visited recently to avoid noisy cold-start timeouts.
  preconnectRecentSiteOrigins()

  let startupSession: ApplicationSessionLoadResult | null = null
  let migratedLegacySession = false
  if (!STARTUP_SMOKE_MODE) {
    legacyTabSessionStore = new TabSessionStore(
      path.join(app.getPath('userData'), 'browser-session.json'),
      { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) },
    )
    applicationSessionStore = new ApplicationSessionStore(
      path.join(app.getPath('userData'), 'browser-application-session.json'),
      { allowInsecureLocalhost: Boolean(VITE_DEV_SERVER_URL) },
    )
    const loadedStartupSession = await loadStartupApplicationSession()
    startupSession = loadedStartupSession.result
    migratedLegacySession = loadedStartupSession.migratedLegacy
  }

  windowCreationGate.enable()
  const restoredSessionSnapshot = startupSession?.kind === 'restore' ? startupSession.snapshot : null
  const restorableWindows = restoredSessionSnapshot
    ? getApplicationWindowsInRestoreOrder(restoredSessionSnapshot)
        .filter((window) => window.tabs.length > 0)
    : []
  let initialWindow: AppWindow | null = null
  for (const snapshot of restorableWindows) {
    try {
      const restoredWindow = await createWindow({
        restoreSnapshot: snapshot,
        activateOnShow: snapshot.id === restoredSessionSnapshot?.mostRecentWindowId,
      })
      initialWindow ??= restoredWindow
    } catch {
      appLogger.warn('browser.application-session-window-restore-failed', {
        windowId: snapshot.id,
      })
    }
    if (isQuitting) break
  }
  if (!initialWindow && !isQuitting) initialWindow = await createWindow()
  if (!initialWindow || isQuitting) return

  if (restoredSessionSnapshot) {
    windowManager.markRecent(restoredSessionSnapshot.mostRecentWindowId ?? '')
    appLogger.info('browser.application-session-restored', {
      windowCount: restorableWindows.length,
      migratedLegacy: migratedLegacySession,
    })
  } else if (startupSession?.kind === 'fallback') {
    appLogger.info('browser.application-session-fallback', { reason: startupSession.reason })
  }

  if (applicationSessionStore) {
    applicationSessionPersistence = new ApplicationSessionPersistence(
      applicationSessionStore,
      getCurrentApplicationSessionSnapshot,
      {
        onDiagnostic: (reason) => {
          appLogger.warn('browser.application-session-persistence-failed', { reason })
        },
      },
    )
    removeApplicationRecencyListener = windowManager.addMostRecentWindowChangeListener(() => {
      scheduleApplicationSession()
    })
    void applicationSessionPersistence.flush()
  }

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
          preloadPath: STARTUP_SMOKE_MODE && process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH
            ? process.env.ALGO_ELECTRON_SMOKE_PRELOAD_PATH
            : path.join(__dirname, 'preload.mjs'),
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
            isAnyAppWindowFocused: () => windowManager.hasFocusedWindow(),
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
      getAppWindows: () => windowManager.getAll(),
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
