import {
  WebContentsView,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Input,
  type WebContents,
  type WebPreferences,
} from 'electron'
import { randomUUID } from 'node:crypto'
import { DetachedWindow } from './DetachedWindow'
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

export type { TabInfo } from './tabManagerTypes'

export interface TabManagerOptions {
  allowInsecureLocalhost?: boolean
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
  private readonly allowInsecureLocalhost: boolean
  private closedTabs: ClosedTabSnapshot[] = []
  private isDestroying = false
  private isRestoringSession = false
  private isOmniboxOpen = false
  private recoveryPendingViews = new Set<WebContentsView>()

  constructor(window: BrowserWindow, options: TabManagerOptions = {}) {
    this.window = window
    this.allowInsecureLocalhost = options.allowInsecureLocalhost ?? false
    this.window.on('resize', () => this.updateBounds())
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

    contents.on('before-input-event', (event, input) => {
      this.shortcutHandler?.(event, input, contents)
    })

    const guardNavigation = (event: Electron.Event, url: string): void => {
      const decision = this.evaluateNavigation(url, true)
      if (decision.allowed) return
      event.preventDefault()
      this.notifyNavigationBlocked(decision.reason!)
    }
    contents.on('will-navigate', guardNavigation)
    contents.on('will-redirect', guardNavigation)

    contents.on('did-navigate', (_event, url) => {
      this.updateWebContentsUrl(contentsId, url)
      const tab = this.findTabByView(view)
      if (tab) {
        const urlChanged = tab.url !== url
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
        }
        if (urlChanged) this.emitSessionChange()
      }
    })

    contents.on('did-navigate-in-page', (_event, url) => {
      this.updateWebContentsUrl(contentsId, url)
      const tab = this.findTabByView(view)
      if (tab) {
        const urlChanged = tab.url !== url
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
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

    contents.setWindowOpenHandler((details) => {
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
      this.closedTabs.push({ kind: 'internal', page: tab.page, title: tab.title })
    }
    if (this.closedTabs.length > MAX_CLOSED_TABS) this.closedTabs.shift()
  }

  private handleViewDestroyed(view: WebContentsView, contentsId: number): void {
    unregisterOjWebContents({ id: contentsId })
    this.recoveryPendingViews.delete(view)
    const tab = this.findTabByView(view)
    if (!tab) return

    if (!this.isDestroying && tab.isCrashed) {
      try {
        tab.view = this.createView()
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

  createTab(url?: string): string {
    if (!url) return this.openInternalTab({ type: 'home' })
    if (!this.canCreateTab()) return ''

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

    if (this.activeTabId) {
      const currentTab = this.findTab(this.activeTabId)
      if (currentTab?.kind === 'web') this.detachTabView(currentTab)
    }

    this.activeTabId = tabId
    if (newTab.kind === 'web') this.attachTabView(newTab)

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

  detachTab(tabId: string): BrowserWindow | null {
    if (this.tabs.length <= 1) return null

    const tab = this.findTab(tabId)
    if (!tab || tab.kind !== 'web') return null
    if (tab.isCrashed) return null
    
    if (!tab.url || tab.url === 'about:blank') return null

    const tabIndex = this.findTabIndex(tabId)
    const wasActive = tabId === this.activeTabId
    const nextTabId = wasActive ? this.getAdjacentTabId(tabIndex) : null
    this.tabs.splice(tabIndex, 1)

    if (wasActive) {
      safeRemoveChildView(this.window, tab.view)
      this.activeTabId = null
      if (nextTabId) this.switchTab(nextTabId)
    }

    const detached = new DetachedWindow(tab.view, tab.title)
    if (!wasActive) {
      this.notifyTabListChanged()
      this.emitSessionChange()
    }
    return detached.getWindow()
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
    this.tabs[tabIndex] = webTab
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
      this.detachTabView(currentTab)
      this.recoveryPendingViews.delete(currentTab.view)
      try {
        unregisterOjWebContents(currentTab.view.webContents)
      } catch {
        // A crashed view may already have lost its webContents object.
      }
      this.tabs[tabIndex] = internalTab
      safeCloseWebContents(currentTab.view)
    } else {
      this.tabs[tabIndex] = internalTab
    }

    this.onUrlChange?.(internalTab.url)
    this.emitActiveTabChange(internalTab.url)
    this.notifyTabListChanged()
    this.emitSessionChange()
  }

  navigate(url: string) {
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
    void tab.view.webContents.loadURL(url).catch((error) => {
      appLogger.error('browser.navigate-failed', { url, error })
    })
  }

  goBack() {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (this.isWebTab(tab) && !tab.isCrashed && tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
    }
  }

  goForward() {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (this.isWebTab(tab) && !tab.isCrashed && tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  reload() {
    if (this.activeTabId) this.reloadTab(this.activeTabId)
  }

  reloadTab(tabId: string): void {
    const tab = this.findTab(tabId)
    if (!this.isWebTab(tab)) return
    if (tab.isCrashed) {
      this.recoverCrashedTab(tab)
      return
    }
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

  adjustZoom(delta: number): void {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab) || tab.isCrashed) return
    const current = tab.view.webContents.getZoomFactor()
    const next = Math.min(5, Math.max(0.25, Math.round((current + delta) * 100) / 100))
    tab.view.webContents.setZoomFactor(next)
  }

  resetZoom(): void {
    const tab = this.activeTabId ? this.findTab(this.activeTabId) : null
    if (!this.isWebTab(tab) || tab.isCrashed) return
    tab.view.webContents.setZoomFactor(1)
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
    const tabs: TabSnapshot[] = this.tabs.map((tab) => tab.kind === 'web'
      ? { id: tab.id, kind: 'web', url: tab.url, title: tab.title }
      : { id: tab.id, kind: 'internal', page: tab.page, title: tab.title })
    return createTabSessionSnapshot(tabs, this.activeTabId, {
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

      this.tabs = restoredTabs
      this.activeTabId = null
      for (const tab of restoredTabs) {
        if (tab.kind !== 'web') continue
        void tab.view.webContents.loadURL(tab.url).catch((error) => {
          appLogger.warn('browser.session-tab-load-failed', {
            tabId: tab.id,
            errorName: getErrorName(error),
          })
        })
      }
      this.switchTab(parsed.snapshot.activeTabId!)
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
    const topInset = tab.isUnresponsive && !tab.isUnresponsiveNoticeDismissed
      ? BROWSER_LAYOUT.noticeBarHeight
      : 0
    setTabViewBounds(tab.view, { width, height }, this.leftOffset, topInset)
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
    this.recoveryPendingViews.clear()
    this.sessionChangeListeners.clear()
    const tabs = [...this.tabs]
    this.tabs = []
    this.activeTabId = null
    for (const tab of tabs) {
      if (tab.kind !== 'web') continue
      try {
        unregisterOjWebContents(tab.view.webContents)
        if (!tab.view.webContents.isDestroyed()) {
          safeRemoveChildView(this.window, tab.view)
          safeCloseWebContents(tab.view)
        }
      } catch { /* ignore */ }
    }
    this.isDestroying = false
  }
}
