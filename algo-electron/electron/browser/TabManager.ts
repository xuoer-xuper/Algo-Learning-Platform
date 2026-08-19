import {
  clipboard,
  WebContentsView,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Input,
  type WebContents,
  type WebPreferences,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { STEALTH_SCRIPT } from './stealthScript'
import { MAX_CLOSED_TABS, MAX_TABS, OJ_PRELOAD_PATH } from './tabManagerConfig'
import type {
  ClosedTabSnapshot,
  InternalPage,
  ManagedInternalTab,
  ManagedTab,
  ManagedWebTab,
  TabInfo,
  TabSessionSnapshot,
  TabSnapshot,
} from './tabManagerTypes'
import { executeScriptAcrossFrames } from './tabScriptExecution'
import { safeCloseWebContents, safeRemoveChildView, setTabViewBounds } from './tabViewLayout'
import { samePageUrl } from './urlMatching'
import { registerOjWebContents, unregisterOjWebContents } from '../ipc/trustedSender'
import { evaluateBrowserNavigation, type NavigationBlockReason } from './navigationPolicy'
import { appLogger } from '../shared/logger'
import { createTabSessionSnapshot, parseTabSessionSnapshot } from './tabSessionSnapshot'
import { BROWSER_LAYOUT } from './browserLayout'
import { getInternalPageTitle, getInternalPageUrl, sameInternalPage } from './internalPage'
import {
  INITIAL_FIND_IN_PAGE_STATE,
  applyFindInPageResult,
  parseFindInPageCommand,
  reduceFindInPageCommand,
  registerFindInPageRequest,
  type FindInPageState,
  type FindInPageViewState,
} from './findInPage'
import {
  DEFAULT_ZOOM_FACTOR,
  getAdjacentZoomFactor,
  normalizeZoomFactor,
  type ZoomCommand,
  type ZoomState,
} from './zoomPreferences'
import {
  resolveUserScriptNavigation,
  type PendingUserScriptInstallRegistry,
  type UserScriptInstallRoute,
} from '../downloads/userScriptNavigation'
import { popupPageContextMenu, popupTabContextMenu } from '../contextMenus/browserContextMenu'
import type { ViewRegistry } from '../windows/ViewRegistry'

export type { TabInfo } from './tabManagerTypes'

export interface TabManagerOptions {
  allowInsecureLocalhost?: boolean
  getZoomFactorForUrl?: (url: string) => number
  saveZoomFactorForUrl?: (url: string, factor: number) => number | null
  userScriptInstallRegistry?: PendingUserScriptInstallRegistry
  buildSearchUrlForQuery?: (query: string) => string
  windowId?: string
  viewRegistry?: ViewRegistry
}

export interface WebContentsUrlSnapshot {
  webContentsId: number
  /** A null URL means the webContents was destroyed and must be removed. */
  url: string | null
}

type PopupWindowOptions = BrowserWindowConstructorOptions & {
  webContents?: WebContents
}

interface AddManagedTabOptions {
  activate?: boolean
  id?: string
  title?: string
}

interface OpenInternalTabOptions {
  activate?: boolean
  reuseExisting?: boolean
  id?: string
  title?: string
}

const MAX_REMOTE_FAVICON_URL_LENGTH = 4_096
const MAX_DATA_FAVICON_URL_LENGTH = 64 * 1_024
const SAFE_DATA_FAVICON_PATTERN = /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,/i

function isAllowedFaviconUrl(value: string): boolean {
  if (value.length > MAX_DATA_FAVICON_URL_LENGTH) return false
  if (SAFE_DATA_FAVICON_PATTERN.test(value)) return true
  if (value.length > MAX_REMOTE_FAVICON_URL_LENGTH) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

export class TabManager {
  private tabs: ManagedTab[] = []
  private activeTabId: string | null = null
  private window: BrowserWindow
  private leftOffset = 0
  private onUrlChange: ((url: string) => void) | null = null
  private onNavigate: ((url: string) => void) | null = null
  private onTitleChange: ((title: string, url: string) => void) | null = null
  private onDomReady: ((url: string) => void) | null = null
  private onPageLoaded: ((url: string) => void) | null = null
  private onTabListChanged: ((tabs: TabInfo[]) => void) | null = null
  private navigateListeners = new Set<(url: string) => void>()
  private domReadyListeners = new Set<(url: string) => void>()
  private activeTabChangeListeners = new Set<(url: string) => void>()
  private webContentsUrlListeners = new Set<(snapshot: WebContentsUrlSnapshot) => void>()
  private sessionChangeListeners = new Set<() => void>()
  private webContentsUrls = new Map<number, string>()
  private shortcutHandler: ((event: Electron.Event, input: Input, source: WebContents) => void) | null = null
  private navigationBlockedHandler: ((reason: NavigationBlockReason) => void) | null = null
  private tabLimitReachedHandler: ((limit: number) => void) | null = null
  private findInPageStateChangedHandler: ((state: FindInPageViewState) => void) | null = null
  private zoomChangedHandler: ((state: ZoomState) => void) | null = null
  private readonly allowInsecureLocalhost: boolean
  private readonly getZoomFactorForUrl: (url: string) => number
  private readonly saveZoomFactorForUrl: (url: string, factor: number) => number | null
  private readonly userScriptInstallRegistry: PendingUserScriptInstallRegistry | null
  private readonly buildSearchUrlForQuery: (query: string) => string
  private readonly windowId: string | null
  private readonly viewRegistry: ViewRegistry | null
  private closedTabs: ClosedTabSnapshot[] = []
  private isDestroying = false
  private isRestoringSession = false
  private isOmniboxOpen = false
  private isDownloadNoticeVisible = false
  private findInPageTabId: string | null = null
  private findInPageState: FindInPageState = { ...INITIAL_FIND_IN_PAGE_STATE }
  private recoveryPendingViews = new Set<WebContentsView>()

  constructor(window: BrowserWindow, options: TabManagerOptions = {}) {
    this.window = window
    this.allowInsecureLocalhost = options.allowInsecureLocalhost ?? false
    this.getZoomFactorForUrl = options.getZoomFactorForUrl ?? (() => DEFAULT_ZOOM_FACTOR)
    this.saveZoomFactorForUrl = options.saveZoomFactorForUrl ?? ((_url, factor) => factor)
    this.userScriptInstallRegistry = options.userScriptInstallRegistry ?? null
    this.buildSearchUrlForQuery = options.buildSearchUrlForQuery ?? ((query) => query)
    this.windowId = options.windowId ?? null
    this.viewRegistry = options.viewRegistry ?? null
    this.window.on('resize', () => this.updateBounds())
  }

  private registerTabView(tabId: string, view: WebContentsView): void {
    if (!this.windowId || !this.viewRegistry) return
    this.viewRegistry.registerTab(this.windowId, tabId, view)
  }

  private unregisterTabView(viewOrId: WebContentsView | number): void {
    if (!this.windowId || !this.viewRegistry) return
    if (typeof viewOrId === 'number') {
      this.viewRegistry.unregister(viewOrId, this.windowId)
      return
    }
    try {
      this.viewRegistry.unregister(viewOrId.webContents.id, this.windowId)
    } catch {
      // A destroyed WebContentsView may no longer expose webContents.
    }
  }

  private getFindInPageViewState(): FindInPageViewState {
    return {
      open: this.findInPageTabId !== null,
      tabId: this.findInPageTabId,
      ...this.findInPageState,
    }
  }

  private emitFindInPageState(): void {
    this.findInPageStateChangedHandler?.(this.getFindInPageViewState())
  }

  private stopFindInPage(tab: ManagedWebTab | null, action: 'clearSelection' | 'keepSelection'): void {
    if (!tab || tab.isCrashed) return
    try {
      tab.view.webContents.stopFindInPage(action)
    } catch {
      // Navigation, crashes, and tab teardown can invalidate webContents mid-command.
    }
  }

  private clearFindInPage(
    action: 'clearSelection' | 'keepSelection' = 'clearSelection',
    notify = true,
  ): void {
    const tab = this.findInPageTabId ? this.findTab(this.findInPageTabId) : null
    this.stopFindInPage(this.isWebTab(tab) ? tab : null, action)
    this.findInPageTabId = null
    this.findInPageState = { ...INITIAL_FIND_IN_PAGE_STATE }
    this.updateBounds()
    if (notify) this.emitFindInPageState()
  }

  openFindInPage(): boolean {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab) || tab.isCrashed) return false
    if (this.findInPageTabId && this.findInPageTabId !== tab.id) this.clearFindInPage('clearSelection', false)
    this.findInPageTabId = tab.id
    this.updateBounds()
    this.emitFindInPageState()
    return true
  }

  findInPage(tabId: string, value: unknown): FindInPageViewState | null {
    const command = parseFindInPageCommand(value)
    const tab = this.findTab(tabId)
    if (!command || !this.isWebTab(tab) || tab.isCrashed || tabId !== this.activeTabId) return null
    if (this.findInPageTabId !== tabId) this.findInPageTabId = tabId

    const transition = reduceFindInPageCommand(this.findInPageState, command)
    this.findInPageState = transition.state
    if (transition.effect.type === 'stop') {
      this.stopFindInPage(tab, transition.effect.action)
      if (command.type === 'close') {
        this.findInPageTabId = null
        this.updateBounds()
      }
      this.emitFindInPageState()
      return this.getFindInPageViewState()
    }
    if (transition.effect.type === 'find') {
      try {
        const requestId = tab.view.webContents.findInPage(
          transition.effect.query,
          transition.effect.options,
        )
        this.findInPageState = registerFindInPageRequest(this.findInPageState, requestId)
      } catch (error) {
        appLogger.warn('browser.find-in-page-failed', { errorName: getErrorName(error) })
      }
    }
    this.emitFindInPageState()
    return this.getFindInPageViewState()
  }

  private applyZoomToView(view: WebContentsView, url: string): number {
    let factor = DEFAULT_ZOOM_FACTOR
    try {
      factor = normalizeZoomFactor(this.getZoomFactorForUrl(url)) ?? DEFAULT_ZOOM_FACTOR
    } catch (error) {
      appLogger.warn('browser.zoom-read-failed', { errorName: getErrorName(error) })
    }
    try {
      view.webContents.setZoomFactor(factor)
    } catch (error) {
      appLogger.warn('browser.zoom-apply-failed', { errorName: getErrorName(error) })
    }
    return factor
  }

  private emitZoomState(tab: ManagedWebTab, factor?: number): void {
    if (tab.id !== this.activeTabId) return
    let resolvedFactor = factor
    if (resolvedFactor === undefined) {
      try {
        resolvedFactor = normalizeZoomFactor(tab.view.webContents.getZoomFactor())
          ?? DEFAULT_ZOOM_FACTOR
      } catch {
        resolvedFactor = DEFAULT_ZOOM_FACTOR
      }
    }
    this.zoomChangedHandler?.({ tabId: tab.id, factor: resolvedFactor })
  }

  private resolveUserScriptInstall(url: string): UserScriptInstallRoute | 'blocked' | null {
    const navigation = resolveUserScriptNavigation(url, {
      allowInsecureLocalhost: this.allowInsecureLocalhost,
    })
    if (!navigation) return null
    if (!this.userScriptInstallRegistry) return 'blocked'
    try {
      return this.userScriptInstallRegistry.register(url, {
        allowInsecureLocalhost: this.allowInsecureLocalhost,
      }) ?? 'blocked'
    } catch (error) {
      appLogger.warn('browser.userscript-install-route-failed', {
        errorName: getErrorName(error),
      })
      return 'blocked'
    }
  }

  private findTab(tabId: string): ManagedTab | null {
    return this.tabs.find((tab) => tab.id === tabId) ?? null
  }

  private isWebTab(tab: ManagedTab | null): tab is ManagedWebTab {
    return tab?.kind === 'web'
  }

  private findTabIndex(tabId: string): number {
    return this.tabs.findIndex((tab) => tab.id === tabId)
  }

  private getTabIds(): string[] {
    return this.tabs.map((tab) => tab.id)
  }

  private getAdjacentTabId(tabIndex: number): string | null {
    return this.tabs[tabIndex + 1]?.id ?? this.tabs[tabIndex - 1]?.id ?? null
  }

  private createTabId(): string {
    let id: string
    do {
      id = randomUUID().slice(0, 8)
    } while (this.findTab(id))
    return id
  }

  private notifyTabListChanged(): void {
    this.onTabListChanged?.(this.getTabList())
  }

  private emitSessionChange(): void {
    if (this.isDestroying || this.isRestoringSession) return
    for (const listener of this.sessionChangeListeners) listener()
  }

  private detachTabView(tab: ManagedWebTab): void {
    safeRemoveChildView(this.window, tab.view)
  }

  private attachTabView(tab: ManagedWebTab): void {
    if (tab.isCrashed || this.isOmniboxOpen) return
    try {
      this.window.contentView.addChildView(tab.view)
      this.updateBounds()
    } catch {
      // A view can disappear while a renderer process is recovering.
    }
  }

  private updateTabHealth(tab: ManagedWebTab): void {
    if (tab.id === this.activeTabId) this.updateBounds()
    this.notifyTabListChanged()
  }

  private handleRenderProcessGone(
    view: WebContentsView,
    details: Electron.RenderProcessGoneDetails,
  ): void {
    if (this.isDestroying) return
    const tab = this.findTabByView(view)
    if (!tab) return
    if (tab.id === this.findInPageTabId) this.clearFindInPage()
    this.recoveryPendingViews.delete(view)
    tab.isCrashed = true
    tab.isLoading = false
    tab.isUnresponsive = false
    tab.isUnresponsiveNoticeDismissed = false
    this.detachTabView(tab)
    this.updateTabHealth(tab)
    appLogger.warn('browser.tab-render-process-gone', {
      tabId: tab.id,
      reason: details.reason,
      exitCode: details.exitCode,
    })
  }

  private handleTabUnresponsive(view: WebContentsView): void {
    if (this.isDestroying) return
    const tab = this.findTabByView(view)
    if (!tab || tab.isCrashed) return
    if (tab.isUnresponsive && !tab.isUnresponsiveNoticeDismissed) return
    tab.isUnresponsive = true
    tab.isUnresponsiveNoticeDismissed = false
    this.updateTabHealth(tab)
    appLogger.warn('browser.tab-unresponsive', { tabId: tab.id })
  }

  private handleTabResponsive(view: WebContentsView): void {
    if (this.isDestroying) return
    const tab = this.findTabByView(view)
    if (!tab || !tab.isUnresponsive) return
    tab.isUnresponsive = false
    tab.isUnresponsiveNoticeDismissed = false
    this.updateTabHealth(tab)
  }

  private failTabRecovery(tab: ManagedWebTab, view: WebContentsView): boolean {
    if (!this.recoveryPendingViews.delete(view)) return false
    if (tab.view !== view || !this.findTab(tab.id)) return false
    tab.isCrashed = true
    tab.isLoading = false
    this.detachTabView(tab)
    this.updateTabHealth(tab)
    return true
  }

  private createView(
    inheritedWebPreferences?: WebPreferences,
    existingWebContents?: WebContents,
  ): WebContentsView {
    const view = existingWebContents
      ? new WebContentsView({ webContents: existingWebContents })
      : new WebContentsView({
          webPreferences: {
            ...inheritedWebPreferences,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: OJ_PRELOAD_PATH,
            partition: 'persist:oj-main',
          },
        })
    const contents = view.webContents
    const contentsId = contents.id
    registerOjWebContents(contents)
    this.updateWebContentsUrl(contentsId, contents.getURL())
    this.applyZoomToView(view, contents.getURL())

    contents.on('before-input-event', (event, input) => {
      this.shortcutHandler?.(event, input, contents)
    })

    const guardNavigation = (event: Electron.Event, url: string): void => {
      const installRoute = this.resolveUserScriptInstall(url)
      if (installRoute) {
        event.preventDefault()
        if (installRoute !== 'blocked') {
          const tab = this.findTabByView(view)
          if (tab) queueMicrotask(() => this.replaceWebTabWithInternal(tab, installRoute.page))
        }
        return
      }
      const decision = this.evaluateNavigation(url, true)
      if (decision.allowed) return
      event.preventDefault()
      this.notifyNavigationBlocked(decision.reason!)
    }
    contents.on('will-navigate', guardNavigation)
    contents.on('will-redirect', guardNavigation)

    contents.on('did-navigate', (_event, url) => {
      this.updateWebContentsUrl(contentsId, url)
      const zoomFactor = this.applyZoomToView(view, url)
      const tab = this.findTabByView(view)
      if (tab) {
        const urlChanged = tab.url !== url
        if (urlChanged && tab.id === this.findInPageTabId) this.clearFindInPage()
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
          this.emitZoomState(tab, zoomFactor)
        }
        if (urlChanged) this.emitSessionChange()
      }
    })

    contents.on('did-navigate-in-page', (_event, url) => {
      this.updateWebContentsUrl(contentsId, url)
      const zoomFactor = this.applyZoomToView(view, url)
      const tab = this.findTabByView(view)
      if (tab) {
        const urlChanged = tab.url !== url
        if (urlChanged && tab.id === this.findInPageTabId) this.clearFindInPage()
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
          this.emitZoomState(tab, zoomFactor)
        }
        if (urlChanged) this.emitSessionChange()
      }
    })

    contents.on('did-start-loading', () => {
      const tab = this.findTabByView(view)
      if (!tab) return
      if (tab.isCrashed && !this.recoveryPendingViews.has(view)) return
      if (tab.isLoading) return
      tab.isLoading = true
      this.notifyTabListChanged()
    })

    contents.on('did-stop-loading', () => {
      const tab = this.findTabByView(view)
      if (!tab) return
      if (!tab.isLoading) return
      tab.isLoading = false
      this.notifyTabListChanged()
    })

    contents.on('page-favicon-updated', (_event, favicons: string[]) => {
      const tab = this.findTabByView(view)
      if (!tab) return
      const favicon = favicons.find(isAllowedFaviconUrl) ?? null
      if (tab.favicon === favicon) return
      tab.favicon = favicon
      this.notifyTabListChanged()
    })

    contents.on('context-menu', (_event, params) => {
      if (this.isDestroying || contents.isDestroyed()) return
      popupPageContextMenu({
        window: this.window,
        contents,
        params,
        openUrlInNewTab: (url) => { this.createTab(url) },
        searchSelectionInNewTab: (query) => {
          this.createTab(this.buildSearchUrlForQuery(query))
        },
      })
    })

    contents.on('found-in-page', (_event, result) => {
      const tab = this.findTabByView(view)
      if (!tab || tab.id !== this.findInPageTabId) return
      const nextState = applyFindInPageResult(this.findInPageState, result)
      if (!nextState) return
      this.findInPageState = nextState
      this.emitFindInPageState()
    })

    contents.on('zoom-changed', (event, direction) => {
      const tab = this.findTabByView(view)
      if (!tab) return
      event.preventDefault()
      this.setZoom(tab.id, direction)
    })

    contents.setWindowOpenHandler((details) => {
      const userScriptNavigation = resolveUserScriptNavigation(details.url, {
        allowInsecureLocalhost: this.allowInsecureLocalhost,
      })
      if (userScriptNavigation) {
        if (!this.canCreateTab()) return { action: 'deny' }
        const installRoute = this.resolveUserScriptInstall(details.url)
        if (installRoute && installRoute !== 'blocked') {
          this.openInternalTab(installRoute.page, {
            activate: details.disposition !== 'background-tab',
          })
        }
        return { action: 'deny' }
      }
      const decision = this.evaluateNavigation(details.url, true)
      if (!decision.allowed) {
        this.notifyNavigationBlocked(decision.reason!)
        return { action: 'deny' }
      }
      if (!this.canCreateTab()) return { action: 'deny' }

      return {
        action: 'allow',
        createWindow: (options) => this.createPopupTab(options, details.url, details.disposition),
      }
    })

    contents.on('render-process-gone', (_event, details) => {
      this.handleRenderProcessGone(view, details)
    })

    contents.on('unresponsive', () => {
      this.handleTabUnresponsive(view)
    })

    contents.on('responsive', () => {
      this.handleTabResponsive(view)
    })

    contents.on('destroyed', () => {
      this.removeWebContentsUrl(contentsId)
      this.handleViewDestroyed(view, contentsId)
    })

    contents.on('page-title-updated', (_event, title) => {
      const tab = this.findTabByView(view)
      if (tab) {
        const titleChanged = tab.title !== title
        tab.title = title
        if (tab.id === this.activeTabId) {
          const url = contents.getURL()
          this.onTitleChange?.(title, url)
        }
        if (titleChanged) {
          this.notifyTabListChanged()
          this.emitSessionChange()
        }
      }
    })

    contents.on('dom-ready', () => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.url = contents.getURL()
        this.emitDomReady(tab.url)
      }
    })

    contents.on('did-frame-finish-load', (_event, isMainFrame) => {
      if (isMainFrame) return
      const tab = this.findTabByView(view)
      if (tab && tab.id === this.activeTabId) {
        tab.url = contents.getURL()
        this.emitDomReady(tab.url)
      }
    })

    contents.on('did-finish-load', () => {
      const tab = this.findTabByView(view)
      if (tab && this.recoveryPendingViews.delete(view)) {
        tab.isCrashed = false
        tab.isLoading = false
        tab.isUnresponsive = false
        tab.isUnresponsiveNoticeDismissed = false
        if (tab.id === this.activeTabId) this.attachTabView(tab)
        this.updateTabHealth(tab)
      }
      if (!tab || tab.isCrashed) return
      if (tab && tab.id === this.activeTabId) {
        const url = contents.getURL()
        this.onPageLoaded?.(url)
      }
      // 注入反检测脚本到主世界（绕过 contextIsolation），每个页面及 iframe 加载后执行
      contents.executeJavaScript(STEALTH_SCRIPT).catch(() => {})
    })

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (errorCode !== -3) {
        const tab = this.findTabByView(view)
        if (tab) this.failTabRecovery(tab, view)
      }
      appLogger.warn('browser.did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL,
      })
    })

    contents.on('login', (event, details, authInfo, callback) => {
      const url = details.url || ''
      const host = authInfo.host || ''
      if (url.includes('luogu.com.cn') || host.includes('luogu.com.cn')) {
        event.preventDefault()
        callback()
      }
    })

    return view
  }

  private createPopupTab(
    options: BrowserWindowConstructorOptions,
    url: string,
    disposition: Electron.HandlerDetails['disposition'],
  ): WebContents {
    const suppliedWebContents = (options as PopupWindowOptions).webContents
    if (!suppliedWebContents) {
      throw new Error('Electron did not supply popup webContents')
    }

    const popupView = this.createView(undefined, suppliedWebContents)
    const activate = disposition !== 'background-tab'
    this.addManagedTab(popupView, url, { activate })
    return popupView.webContents
  }

  private addManagedTab(
    view: WebContentsView,
    url: string,
    options: AddManagedTabOptions = {},
  ): string {
    const id = options.id ?? this.createTabId()
    this.tabs.push({
      id,
      kind: 'web',
      view,
      url,
      title: options.title ?? '',
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isUnresponsive: false,
      isUnresponsiveNoticeDismissed: false,
    })
    this.registerTabView(id, view)
    this.applyZoomToView(view, url)

    if (options.activate !== false || !this.activeTabId) {
      this.switchTab(id)
    } else {
      this.notifyTabListChanged()
      this.emitSessionChange()
    }

    return id
  }

  openInternalTab(
    page: InternalPage,
    options: OpenInternalTabOptions = {},
  ): string {
    if (options.reuseExisting) {
      const existing = this.tabs.find(
        (tab): tab is ManagedInternalTab => tab.kind === 'internal' && sameInternalPage(tab.page, page),
      )
      if (existing) {
        if (options.activate !== false) this.switchTab(existing.id)
        return existing.id
      }
    }
    if (!this.canCreateTab()) return ''

    const id = options.id ?? this.createTabId()
    const tab: ManagedInternalTab = {
      id,
      kind: 'internal',
      page,
      url: getInternalPageUrl(page),
      title: options.title ?? getInternalPageTitle(page),
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isUnresponsive: false,
      isUnresponsiveNoticeDismissed: false,
    }
    this.tabs.push(tab)

    if (options.activate !== false || !this.activeTabId) {
      this.switchTab(id)
    } else {
      this.notifyTabListChanged()
      this.emitSessionChange()
    }
    return id
  }

  private evaluateNavigation(url: string, allowAboutBlank = false) {
    return evaluateBrowserNavigation(url, {
      allowAboutBlank,
      allowInsecureLocalhost: this.allowInsecureLocalhost,
    })
  }

  private notifyNavigationBlocked(reason: NavigationBlockReason): void {
    this.navigationBlockedHandler?.(reason)
  }

  private canCreateTab(): boolean {
    if (this.tabs.length < MAX_TABS) return true
    this.tabLimitReachedHandler?.(MAX_TABS)
    return false
  }

  private rememberClosedTab(tab: ManagedTab): void {
    if (tab.kind === 'web') {
      if (!tab.url) return
      this.closedTabs.push({ kind: 'web', url: tab.url, title: tab.title })
    } else {
      if (tab.page.type === 'script-install') return
      this.closedTabs.push({ kind: 'internal', page: tab.page, title: tab.title })
    }
    if (this.closedTabs.length > MAX_CLOSED_TABS) this.closedTabs.shift()
  }

  private handleViewDestroyed(view: WebContentsView, contentsId: number): void {
    unregisterOjWebContents({ id: contentsId })
    this.unregisterTabView(contentsId)
    this.recoveryPendingViews.delete(view)
    const tab = this.findTabByView(view)
    if (!tab) return
    if (tab.id === this.findInPageTabId) this.clearFindInPage()

    if (!this.isDestroying && tab.isCrashed) {
      try {
        tab.view = this.createView()
        this.registerTabView(tab.id, tab.view)
        this.applyZoomToView(tab.view, tab.url)
        tab.isLoading = false
        tab.isUnresponsive = false
        tab.isUnresponsiveNoticeDismissed = false
        this.notifyTabListChanged()
        return
      } catch (error) {
        appLogger.warn('browser.crashed-tab-replacement-failed', {
          tabId: tab.id,
          errorName: getErrorName(error),
        })
        this.updateTabHealth(tab)
        return
      }
    }

    const wasActive = tab.id === this.activeTabId
    const tabIndex = this.findTabIndex(tab.id)
    const nextTabId = wasActive ? this.getAdjacentTabId(tabIndex) : null
    if (!this.isDestroying) this.rememberClosedTab(tab)
    if (wasActive) safeRemoveChildView(this.window, tab.view)
    if (tabIndex >= 0) this.tabs.splice(tabIndex, 1)

    if (this.isDestroying) return
    if (wasActive) {
      this.activeTabId = null
      if (nextTabId) this.switchTab(nextTabId)
      else this.createTab()
      return
    }
    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  private findTabByView(view: WebContentsView): ManagedWebTab | null {
    for (const tab of this.tabs) {
      if (tab.kind === 'web' && tab.view === view) return tab
    }
    return null
  }

  routeUserScriptDownload(url: string, source: WebContents | null): boolean {
    const installRoute = this.resolveUserScriptInstall(url)
    if (!installRoute) return false
    if (installRoute === 'blocked') return true
    const sourceTab = source
      ? this.tabs.find((tab): tab is ManagedWebTab => (
          tab.kind === 'web' && tab.view.webContents === source
        )) ?? null
      : null
    if (sourceTab) queueMicrotask(() => this.replaceWebTabWithInternal(sourceTab, installRoute.page))
    else this.openInternalTab(installRoute.page)
    return true
  }

  createTab(url?: string): string {
    if (!url) return this.openInternalTab({ type: 'home' })
    if (!this.canCreateTab()) return ''

    const installRoute = this.resolveUserScriptInstall(url)
    if (installRoute) {
      return installRoute === 'blocked' ? '' : this.openInternalTab(installRoute.page)
    }

    const decision = this.evaluateNavigation(url, true)
    if (!decision.allowed) {
      this.notifyNavigationBlocked(decision.reason!)
      return ''
    }

    const view = this.createView()
    const id = this.addManagedTab(view, url)

    void view.webContents.loadURL(url).catch((error) => {
      appLogger.error('browser.load-url-failed', { url, error })
    })

    return id
  }

  closeTab(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return

    const tabIndex = this.findTabIndex(tabId)
    const wasActive = tabId === this.activeTabId
    const nextTabId = wasActive ? this.getAdjacentTabId(tabIndex) : null

    if (tabId === this.findInPageTabId) this.clearFindInPage()
    if (tab.kind === 'internal' && tab.page.type === 'script-install') {
      this.userScriptInstallRegistry?.consume(tab.page.installId)
    }

    if (wasActive && tab.kind === 'web') this.detachTabView(tab)

    this.rememberClosedTab(tab)
    this.tabs.splice(tabIndex, 1)
    if (tab.kind === 'web') {
      this.recoveryPendingViews.delete(tab.view)
      try {
        unregisterOjWebContents(tab.view.webContents)
      } catch {
        // A crashed view may already have lost its webContents object.
      }
      this.unregisterTabView(tab.view)
      safeCloseWebContents(tab.view)
    }

    if (wasActive) {
      this.activeTabId = null
      if (nextTabId) {
        this.switchTab(nextTabId)
      } else {
        this.createTab()
      }
      return
    }

    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  closeActiveTab(): void {
    if (this.activeTabId) this.closeTab(this.activeTabId)
  }

  reopenClosedTab(): string {
    const snapshot = this.closedTabs.at(-1)
    if (!snapshot) return ''
    if (!this.canCreateTab()) return ''
    this.closedTabs.pop()

    const id = snapshot.kind === 'web'
      ? this.createTab(snapshot.url)
      : this.openInternalTab(snapshot.page, { title: snapshot.title })
    const tab = this.findTab(id)
    if (tab) {
      tab.title = snapshot.title
      this.notifyTabListChanged()
      this.emitSessionChange()
    }
    return id
  }

  switchTab(tabId: string): void {
    if (tabId === this.activeTabId) return

    const newTab = this.findTab(tabId)
    if (!newTab) return

    if (this.findInPageTabId && this.findInPageTabId !== tabId) this.clearFindInPage()

    if (this.activeTabId) {
      const currentTab = this.findTab(this.activeTabId)
      if (currentTab?.kind === 'web') this.detachTabView(currentTab)
    }

    this.activeTabId = tabId
    if (newTab.kind === 'web') {
      const zoomFactor = this.applyZoomToView(newTab.view, newTab.url)
      this.attachTabView(newTab)
      this.emitZoomState(newTab, zoomFactor)
    }

    this.onUrlChange?.(newTab.url)
    this.emitActiveTabChange(newTab.url)
    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  switchRelative(offset: number): void {
    const tabIds = this.getTabIds()
    if (tabIds.length === 0 || !this.activeTabId) return
    const activeIndex = tabIds.indexOf(this.activeTabId)
    if (activeIndex < 0) return
    const nextIndex = (activeIndex + offset + tabIds.length) % tabIds.length
    this.switchTab(tabIds[nextIndex])
  }

  switchTabByIndex(index: number): void {
    const tabId = this.getTabIds()[index]
    if (tabId) this.switchTab(tabId)
  }

  reorderTab(tabId: string, targetIndex: number): boolean {
    if (!Number.isInteger(targetIndex)) return false
    const sourceIndex = this.findTabIndex(tabId)
    if (sourceIndex < 0 || this.tabs.length < 2) return false

    const destinationIndex = Math.max(0, Math.min(targetIndex, this.tabs.length - 1))
    if (sourceIndex === destinationIndex) return false

    const [tab] = this.tabs.splice(sourceIndex, 1)
    this.tabs.splice(destinationIndex, 0, tab)
    this.notifyTabListChanged()
    this.emitSessionChange()
    return true
  }

  private replaceWebTabWithInternal(tab: ManagedWebTab, page: InternalPage): void {
    const tabIndex = this.findTabIndex(tab.id)
    if (tabIndex < 0 || this.findTab(tab.id) !== tab) return
    const wasActive = tab.id === this.activeTabId
    if (tab.id === this.findInPageTabId) this.clearFindInPage()
    if (wasActive) this.detachTabView(tab)
    this.recoveryPendingViews.delete(tab.view)
    try {
      unregisterOjWebContents(tab.view.webContents)
    } catch {
      // A redirect can race with renderer teardown.
    }
    this.unregisterTabView(tab.view)
    const internalTab: ManagedInternalTab = {
      id: tab.id,
      kind: 'internal',
      page,
      url: getInternalPageUrl(page),
      title: getInternalPageTitle(page),
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isUnresponsive: false,
      isUnresponsiveNoticeDismissed: false,
    }
    this.tabs[tabIndex] = internalTab
    safeCloseWebContents(tab.view)
    if (wasActive) {
      this.onUrlChange?.(internalTab.url)
      this.emitActiveTabChange(internalTab.url)
    }
    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  private replaceInternalTabWithWeb(tab: ManagedInternalTab, url: string): void {
    const tabIndex = this.findTabIndex(tab.id)
    if (tabIndex < 0) return

    let view: WebContentsView
    try {
      view = this.createView()
    } catch (error) {
      appLogger.warn('browser.internal-tab-navigation-view-failed', {
        tabId: tab.id,
        errorName: getErrorName(error),
      })
      return
    }

    const webTab: ManagedWebTab = {
      id: tab.id,
      kind: 'web',
      view,
      url,
      title: '',
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isUnresponsive: false,
      isUnresponsiveNoticeDismissed: false,
    }
    if (tab.page.type === 'script-install') {
      this.userScriptInstallRegistry?.consume(tab.page.installId)
    }
    this.tabs[tabIndex] = webTab
    this.registerTabView(webTab.id, view)
    this.applyZoomToView(view, url)
    this.attachTabView(webTab)
    this.onUrlChange?.(url)
    this.emitActiveTabChange(url)
    this.notifyTabListChanged()
    this.emitSessionChange()

    void view.webContents.loadURL(url).catch((error) => {
      appLogger.error('browser.navigate-failed', { url, error })
    })
  }

  navigateInternal(page: InternalPage): void {
    if (!this.activeTabId) {
      this.openInternalTab(page)
      return
    }

    const tabIndex = this.findTabIndex(this.activeTabId)
    if (tabIndex < 0) {
      this.openInternalTab(page)
      return
    }

    const currentTab = this.tabs[tabIndex]
    const internalTab: ManagedInternalTab = {
      id: currentTab.id,
      kind: 'internal',
      page,
      url: getInternalPageUrl(page),
      title: getInternalPageTitle(page),
      favicon: null,
      isLoading: false,
      isCrashed: false,
      isUnresponsive: false,
      isUnresponsiveNoticeDismissed: false,
    }

    if (currentTab.kind === 'web') {
      if (currentTab.id === this.findInPageTabId) this.clearFindInPage()
      this.detachTabView(currentTab)
      this.recoveryPendingViews.delete(currentTab.view)
      try {
        unregisterOjWebContents(currentTab.view.webContents)
      } catch {
        // A crashed view may already have lost its webContents object.
      }
      this.unregisterTabView(currentTab.view)
      this.tabs[tabIndex] = internalTab
      safeCloseWebContents(currentTab.view)
    } else {
      if (currentTab.page.type === 'script-install') {
        this.userScriptInstallRegistry?.consume(currentTab.page.installId)
      }
      this.tabs[tabIndex] = internalTab
    }

    this.onUrlChange?.(internalTab.url)
    this.emitActiveTabChange(internalTab.url)
    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  navigate(url: string) {
    const installRoute = this.resolveUserScriptInstall(url)
    if (installRoute) {
      if (installRoute !== 'blocked') this.navigateInternal(installRoute.page)
      return
    }
    const decision = this.evaluateNavigation(url, true)
    if (!decision.allowed) {
      this.notifyNavigationBlocked(decision.reason!)
      return
    }
    if (!this.activeTabId || !this.findTab(this.activeTabId)) {
      this.createTab(url)
      return
    }
    const tab = this.findTab(this.activeTabId)!
    if (tab.kind === 'internal') {
      this.replaceInternalTabWithWeb(tab, url)
      return
    }
    if (tab.isCrashed) {
      this.recoverCrashedTab(tab, url)
      return
    }
    if (tab.id === this.findInPageTabId) this.clearFindInPage()
    void tab.view.webContents.loadURL(url).catch((error) => {
      appLogger.error('browser.navigate-failed', { url, error })
    })
  }

  goBack() {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (this.isWebTab(tab) && !tab.isCrashed && tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
      return
    }
    if (tab?.kind === 'internal' && tab.page.type !== 'home') {
      this.navigateInternal({ type: 'home' })
    }
  }

  canGoBack(): boolean {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (this.isWebTab(tab) && !tab.isCrashed) {
      return tab.view.webContents.navigationHistory.canGoBack()
    }
    return tab?.kind === 'internal' && tab.page.type !== 'home'
  }

  goForward() {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (this.isWebTab(tab) && !tab.isCrashed && tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  reload() {
    if (!this.activeTabId) return
    const tab = this.findTab(this.activeTabId)
    if (tab?.kind === 'internal') {
      this.window.webContents.reload()
      return
    }
    this.reloadTab(this.activeTabId)
  }

  private reloadTabFromContext(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!tab) return
    if (tab.kind === 'internal') {
      if (tab.id === this.activeTabId) this.window.webContents.reload()
      return
    }
    this.reloadTab(tabId)
  }

  private duplicateTab(tabId: string): string {
    const tab = this.findTab(tabId)
    if (!tab || !this.canCreateTab()) return ''
    if (tab.kind === 'internal') {
      return this.openInternalTab(tab.page, { title: tab.title })
    }
    return this.createTab(tab.url)
  }

  private closeOtherTabs(tabId: string): void {
    const ids = this.tabs.map((tab) => tab.id).filter((id) => id !== tabId)
    for (const id of ids) this.closeTab(id)
  }

  private closeTabsToRight(tabId: string): void {
    const index = this.findTabIndex(tabId)
    if (index < 0) return
    const ids = this.tabs.slice(index + 1).map((tab) => tab.id)
    for (const id of ids) this.closeTab(id)
  }

  showTabContextMenu(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!tab || this.isDestroying) return
    const tabIndex = this.findTabIndex(tabId)
    popupTabContextMenu({
      window: this.window,
      tabId,
      title: tab.title || '首页',
      url: tab.url,
      canReload: tab.kind === 'web' || tab.id === this.activeTabId,
      canDetach: false,
      canCloseOthers: this.tabs.length > 1,
      canCloseToRight: tabIndex >= 0 && tabIndex < this.tabs.length - 1,
      canReopenClosed: this.closedTabs.length > 0,
      reload: () => this.reloadTabFromContext(tabId),
      duplicate: () => { this.duplicateTab(tabId) },
      detach: () => undefined,
      close: () => { this.closeTab(tabId) },
      closeOthers: () => { this.closeOtherTabs(tabId) },
      closeToRight: () => { this.closeTabsToRight(tabId) },
      reopenClosed: () => { this.reopenClosedTab() },
      copyUrl: () => clipboard.writeText(tab.url),
    })
  }

  reloadTab(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!this.isWebTab(tab)) return
    if (tab.isCrashed) {
      this.recoverCrashedTab(tab)
      return
    }
    if (tab.id === this.findInPageTabId) this.clearFindInPage()
    const healthChanged = tab.isUnresponsive || tab.isUnresponsiveNoticeDismissed
    tab.isUnresponsive = false
    tab.isUnresponsiveNoticeDismissed = false
    if (healthChanged) this.updateTabHealth(tab)
    tab.view.webContents.reload()
  }

  dismissUnresponsive(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!this.isWebTab(tab) || !tab.isUnresponsive) return
    tab.isUnresponsiveNoticeDismissed = true
    this.updateTabHealth(tab)
  }

  private recoverCrashedTab(tab: ManagedWebTab, nextUrl?: string): void {
    if (this.recoveryPendingViews.has(tab.view) && !nextUrl) return
    let needsReplacement: boolean
    try {
      needsReplacement = tab.view.webContents.isDestroyed()
    } catch {
      needsReplacement = true
    }
    if (needsReplacement) {
      try {
        tab.view = this.createView()
        this.registerTabView(tab.id, tab.view)
        this.applyZoomToView(tab.view, nextUrl ?? tab.url)
      } catch (error) {
        appLogger.warn('browser.crashed-tab-recovery-failed', {
          tabId: tab.id,
          errorName: getErrorName(error),
        })
        return
      }
    }

    const recoveryView = tab.view
    tab.isLoading = true
    tab.isUnresponsive = false
    tab.isUnresponsiveNoticeDismissed = false
    this.recoveryPendingViews.add(recoveryView)
    this.attachTabView(tab)
    this.updateTabHealth(tab)
    try {
      const recoveryUrl = nextUrl ?? (recoveryView.webContents.getURL() ? undefined : tab.url)
      const load = recoveryUrl
        ? recoveryView.webContents.loadURL(recoveryUrl)
        : recoveryView.webContents.reload()
      if (load && typeof (load as Promise<void>).catch === 'function') {
        void (load as Promise<void>).catch((error) => {
          if (!this.failTabRecovery(tab, recoveryView)) return
          appLogger.warn('browser.crashed-tab-recovery-failed', {
            tabId: tab.id,
            errorName: getErrorName(error),
          })
        })
      }
    } catch (error) {
      if (!this.failTabRecovery(tab, recoveryView)) return
      appLogger.warn('browser.crashed-tab-recovery-failed', {
        tabId: tab.id,
        errorName: getErrorName(error),
      })
    }
  }

  setZoom(tabId: string, command: ZoomCommand): ZoomState | null {
    const tab = this.findTab(tabId)
    if (!this.isWebTab(tab) || tab.isCrashed) return null
    let current: number
    let url: string
    try {
      current = normalizeZoomFactor(tab.view.webContents.getZoomFactor()) ?? DEFAULT_ZOOM_FACTOR
      url = tab.view.webContents.getURL()
    } catch {
      return null
    }
    const next = command === 'reset'
      ? DEFAULT_ZOOM_FACTOR
      : getAdjacentZoomFactor(current, command)
    let persisted: number | null
    try {
      persisted = this.saveZoomFactorForUrl(url, next)
    } catch (error) {
      appLogger.warn('browser.zoom-save-failed', { errorName: getErrorName(error) })
      return null
    }
    if (persisted === null) return null
    const factor = normalizeZoomFactor(persisted)
    if (factor === null) return null
    try {
      tab.view.webContents.setZoomFactor(factor)
    } catch (error) {
      appLogger.warn('browser.zoom-apply-failed', { errorName: getErrorName(error) })
      return null
    }
    const state = { tabId, factor }
    if (tabId === this.activeTabId) this.zoomChangedHandler?.(state)
    return state
  }

  adjustZoom(delta: number): void {
    if (!this.activeTabId || delta === 0) return
    this.setZoom(this.activeTabId, delta > 0 ? 'in' : 'out')
  }

  resetZoom(): void {
    if (this.activeTabId) this.setZoom(this.activeTabId, 'reset')
  }

  getActiveZoomState(): ZoomState | null {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab) || tab.isCrashed) return null
    try {
      return {
        tabId: tab.id,
        factor: normalizeZoomFactor(tab.view.webContents.getZoomFactor()) ?? DEFAULT_ZOOM_FACTOR,
      }
    } catch {
      return null
    }
  }

  getUrl(): string {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    return tab?.url ?? ''
  }

  getTitleForUrl(url: string): string | undefined {
    for (const tab of this.tabs) {
      if (tab.kind !== 'web') continue
      let currentUrl = ''
      if (!tab.isCrashed) {
        try {
          currentUrl = tab.view.webContents.getURL()
        } catch {
          currentUrl = ''
        }
      }
      if (tab.url === url || currentUrl === url || samePageUrl(tab.url, url) || samePageUrl(currentUrl, url)) {
        if (tab.title || tab.isCrashed) return tab.title || undefined
        return tab.view.webContents.getTitle()
      }
    }
    return undefined
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  isViewVisible(): boolean {
    if (!this.activeTabId) return false
    const tab = this.findTab(this.activeTabId)
    return this.isWebTab(tab) && !tab.isCrashed && !this.isOmniboxOpen
  }

  setOmniboxOpen(open: boolean): void {
    if (this.isOmniboxOpen === open) return
    this.isOmniboxOpen = open
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab)) return
    if (open) this.detachTabView(tab)
    else this.attachTabView(tab)
  }

  getTabList(): TabInfo[] {
    const list: TabInfo[] = []
    for (const tab of this.tabs) {
      const base = {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        isLoading: tab.isLoading,
        isCrashed: tab.isCrashed,
        isUnresponsive: tab.isUnresponsive,
        isUnresponsiveNoticeDismissed: tab.isUnresponsiveNoticeDismissed,
        isActive: tab.id === this.activeTabId,
      }
      list.push(tab.kind === 'web'
        ? { ...base, kind: 'web' }
        : { ...base, kind: 'internal', page: tab.page })
    }
    return list
  }

  getSessionSnapshot(): TabSessionSnapshot {
    const tabs: TabSnapshot[] = []
    for (const tab of this.tabs) {
      if (tab.kind === 'web') {
        tabs.push({ id: tab.id, kind: 'web', url: tab.url, title: tab.title })
      } else if (tab.page.type !== 'script-install') {
        tabs.push({ id: tab.id, kind: 'internal', page: tab.page, title: tab.title })
      }
    }
    const activeTabId = tabs.some((tab) => tab.id === this.activeTabId)
      ? this.activeTabId
      : tabs[0]?.id ?? null
    return createTabSessionSnapshot(tabs, activeTabId, {
      allowInsecureLocalhost: this.allowInsecureLocalhost,
    })
  }

  restoreSession(snapshot: TabSessionSnapshot): boolean {
    if (this.tabs.length > 0) return false
    const parsed = parseTabSessionSnapshot(snapshot, {
      allowInsecureLocalhost: this.allowInsecureLocalhost,
    })
    if (!parsed.ok || parsed.snapshot.tabs.length === 0) return false

    const restoredTabs: ManagedTab[] = []
    this.isRestoringSession = true
    try {
      for (const tab of parsed.snapshot.tabs) {
        if (tab.kind === 'web') {
          const view = this.createView()
          restoredTabs.push({
            id: tab.id,
            kind: 'web',
            view,
            url: tab.url,
            title: tab.title,
            favicon: null,
            isLoading: false,
            isCrashed: false,
            isUnresponsive: false,
            isUnresponsiveNoticeDismissed: false,
          })
        } else {
          if (tab.page.type === 'script-install') continue
          restoredTabs.push({
            id: tab.id,
            kind: 'internal',
            page: tab.page,
            url: getInternalPageUrl(tab.page),
            title: tab.title || getInternalPageTitle(tab.page),
            favicon: null,
            isLoading: false,
            isCrashed: false,
            isUnresponsive: false,
            isUnresponsiveNoticeDismissed: false,
          })
        }
      }

      if (restoredTabs.length === 0) return false

      this.tabs = restoredTabs
      this.activeTabId = null
      for (const tab of restoredTabs) {
        if (tab.kind !== 'web') continue
        this.registerTabView(tab.id, tab.view)
        this.applyZoomToView(tab.view, tab.url)
        void tab.view.webContents.loadURL(tab.url).catch((error) => {
          appLogger.warn('browser.session-tab-load-failed', {
            tabId: tab.id,
            errorName: getErrorName(error),
          })
        })
      }
      const activeTabId = restoredTabs.some((tab) => tab.id === parsed.snapshot.activeTabId)
        ? parsed.snapshot.activeTabId!
        : restoredTabs[0].id
      this.switchTab(activeTabId)
      return true
    } catch (error) {
      this.tabs = []
      this.activeTabId = null
      const wasDestroying = this.isDestroying
      this.isDestroying = true
      for (const tab of restoredTabs) {
        if (tab.kind !== 'web') continue
        try {
          unregisterOjWebContents(tab.view.webContents)
          this.unregisterTabView(tab.view)
          safeRemoveChildView(this.window, tab.view)
          safeCloseWebContents(tab.view)
        } catch { /* ignore rollback failures */ }
      }
      this.isDestroying = wasDestroying
      appLogger.warn('browser.session-restore-failed', { errorName: getErrorName(error) })
      return false
    } finally {
      this.isRestoringSession = false
    }
  }

  setLeftOffset(offset: number) {
    this.leftOffset = offset
    this.updateBounds()
  }

  private updateBounds() {
    if (!this.activeTabId) return
    const tab = this.findTab(this.activeTabId)
    if (!this.isWebTab(tab)) return
    const [width, height] = this.window.getContentSize()
    let topInset = 0
    if (tab.isUnresponsive && !tab.isUnresponsiveNoticeDismissed) {
      topInset += BROWSER_LAYOUT.noticeBarHeight
    }
    if (this.isDownloadNoticeVisible) topInset += BROWSER_LAYOUT.noticeBarHeight
    if (tab.id === this.findInPageTabId) topInset += BROWSER_LAYOUT.findBarHeight
    setTabViewBounds(tab.view, { width, height }, this.leftOffset, topInset)
  }

  setDownloadNoticeVisible(visible: boolean): void {
    if (this.isDownloadNoticeVisible === visible) return
    this.isDownloadNoticeVisible = visible
    this.updateBounds()
  }

  async executeScript(code: string, userGesture = false): Promise<any> {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab) || tab.isCrashed) return null
    return tab.view.webContents.executeJavaScript(code, userGesture)
  }

  async executeScriptOnUrl(url: string, code: string): Promise<any> {
    for (const tab of this.tabs) {
      if (tab.kind !== 'web') continue
      if (tab.isCrashed) continue
      const currentUrl = tab.view.webContents.getURL()
      if (tab.url === url || currentUrl === url || samePageUrl(tab.url, url) || samePageUrl(currentUrl, url)) {
        return executeScriptAcrossFrames(tab, url, code)
      }
    }
    return Promise.reject(new Error('Tab not found'))
  }

  ensureInitialTab(): string {
    if (this.tabs.length === 0) return this.createTab()
    if (!this.activeTabId) this.switchTab(this.tabs[0].id)
    return this.activeTabId ?? ''
  }

  setUrlChangeCallback(callback: (url: string) => void) {
    this.onUrlChange = callback
  }

  setShortcutHandler(handler: (event: Electron.Event, input: Input, source: WebContents) => void): void {
    this.shortcutHandler = handler
  }

  setNavigationBlockedHandler(handler: (reason: NavigationBlockReason) => void): void {
    this.navigationBlockedHandler = handler
  }

  setTabLimitReachedHandler(handler: (limit: number) => void): void {
    this.tabLimitReachedHandler = handler
  }

  setFindInPageStateChangedHandler(handler: (state: FindInPageViewState) => void): void {
    this.findInPageStateChangedHandler = handler
  }

  setZoomChangedHandler(handler: (state: ZoomState) => void): void {
    this.zoomChangedHandler = handler
  }

  setNavigateCallback(callback: (url: string) => void) {
    this.onNavigate = callback
  }

  addNavigateListener(callback: (url: string) => void): () => void {
    this.navigateListeners.add(callback)
    return () => {
      this.navigateListeners.delete(callback)
    }
  }

  setTitleChangeCallback(callback: (title: string, url: string) => void) {
    this.onTitleChange = callback
  }

  setDomReadyCallback(callback: (url: string) => void) {
    this.onDomReady = callback
  }

  addDomReadyListener(callback: (url: string) => void): () => void {
    this.domReadyListeners.add(callback)
    return () => {
      this.domReadyListeners.delete(callback)
    }
  }

  addActiveTabChangeListener(callback: (url: string) => void): () => void {
    this.activeTabChangeListeners.add(callback)
    return () => {
      this.activeTabChangeListeners.delete(callback)
    }
  }

  addWebContentsUrlListener(callback: (snapshot: WebContentsUrlSnapshot) => void): () => void {
    this.webContentsUrlListeners.add(callback)
    for (const [webContentsId, url] of this.webContentsUrls) {
      callback({ webContentsId, url })
    }
    return () => {
      this.webContentsUrlListeners.delete(callback)
    }
  }

  addSessionChangeListener(callback: () => void): () => void {
    this.sessionChangeListeners.add(callback)
    return () => {
      this.sessionChangeListeners.delete(callback)
    }
  }

  setPageLoadedCallback(callback: (url: string) => void) {
    this.onPageLoaded = callback
  }

  setTabListChangedCallback(callback: (tabs: TabInfo[]) => void) {
    this.onTabListChanged = callback
  }

  private emitNavigate(url: string): void {
    this.onNavigate?.(url)
    for (const listener of this.navigateListeners) {
      listener(url)
    }
  }

  private emitDomReady(url: string): void {
    this.onDomReady?.(url)
    for (const listener of this.domReadyListeners) {
      listener(url)
    }
  }

  private emitActiveTabChange(url: string): void {
    for (const listener of this.activeTabChangeListeners) {
      listener(url)
    }
  }

  private updateWebContentsUrl(webContentsId: number, url: string): void {
    this.webContentsUrls.set(webContentsId, url)
    this.emitWebContentsUrl({ webContentsId, url })
  }

  private removeWebContentsUrl(webContentsId: number): void {
    if (!this.webContentsUrls.delete(webContentsId)) return
    this.emitWebContentsUrl({ webContentsId, url: null })
  }

  private emitWebContentsUrl(snapshot: WebContentsUrlSnapshot): void {
    for (const listener of this.webContentsUrlListeners) {
      listener(snapshot)
    }
  }

  destroy() {
    this.isDestroying = true
    this.isOmniboxOpen = false
    this.isDownloadNoticeVisible = false
    this.findInPageTabId = null
    this.findInPageState = { ...INITIAL_FIND_IN_PAGE_STATE }
    this.findInPageStateChangedHandler = null
    this.zoomChangedHandler = null
    this.recoveryPendingViews.clear()
    this.sessionChangeListeners.clear()
    const tabs = [...this.tabs]
    this.tabs = []
    this.activeTabId = null
    for (const tab of tabs) {
      if (tab.kind !== 'web') continue
      try {
        unregisterOjWebContents(tab.view.webContents)
        this.unregisterTabView(tab.view)
        if (!tab.view.webContents.isDestroyed()) {
          safeRemoveChildView(this.window, tab.view)
          safeCloseWebContents(tab.view)
        }
      } catch { /* ignore */ }
    }
    this.isDestroying = false
  }
}
