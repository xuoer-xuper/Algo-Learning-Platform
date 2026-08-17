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
import { MAX_TABS, OJ_PRELOAD_PATH } from './tabManagerConfig'
import type { ManagedTab, TabInfo } from './tabManagerTypes'
import { executeScriptAcrossFrames } from './tabScriptExecution'
import { safeCloseWebContents, safeRemoveChildView, setTabViewBounds } from './tabViewLayout'
import { samePageUrl } from './urlMatching'
import { registerOjWebContents, unregisterOjWebContents } from '../ipc/trustedSender'
import { evaluateBrowserNavigation, type NavigationBlockReason } from './navigationPolicy'

export type { TabInfo } from './tabManagerTypes'

export interface TabManagerOptions {
  allowInsecureLocalhost?: boolean
}

type PopupWindowOptions = BrowserWindowConstructorOptions & {
  webContents?: WebContents
}

export class TabManager {
  private tabs = new Map<string, ManagedTab>()
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
  private isViewHidden = false
  private shortcutHandler: ((event: Electron.Event, input: Input, source: WebContents) => void) | null = null
  private navigationBlockedHandler: ((reason: NavigationBlockReason) => void) | null = null
  private readonly allowInsecureLocalhost: boolean
  private isDestroying = false

  constructor(window: BrowserWindow, options: TabManagerOptions = {}) {
    this.window = window
    this.allowInsecureLocalhost = options.allowInsecureLocalhost ?? false
    this.window.on('resize', () => this.updateBounds())
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
    registerOjWebContents(contents)

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
      const tab = this.findTabByView(view)
      if (tab) {
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
        }
      }
    })

    contents.on('did-navigate-in-page', (_event, url) => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.emitNavigate(url)
        }
      }
    })

    contents.setWindowOpenHandler((details) => {
      const decision = this.evaluateNavigation(details.url, true)
      if (!decision.allowed) {
        this.notifyNavigationBlocked(decision.reason!)
        return { action: 'deny' }
      }

      return {
        action: 'allow',
        createWindow: (options) => this.createPopupTab(options, details.url, details.disposition),
      }
    })

    contents.on('destroyed', () => {
      this.handleViewDestroyed(view, contents)
    })

    contents.on('page-title-updated', (_event, title) => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.title = title
        if (tab.id === this.activeTabId) {
          const url = contents.getURL()
          this.onTitleChange?.(title, url)
        }
        this.onTabListChanged?.(this.getTabList())
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
      if (tab && tab.id === this.activeTabId) {
        const url = contents.getURL()
        this.onPageLoaded?.(url)
      }
      // 注入反检测脚本到主世界（绕过 contextIsolation），每个页面及 iframe 加载后执行
      contents.executeJavaScript(STEALTH_SCRIPT).catch(() => {})
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
    this.addManagedTab(popupView, url, activate)
    return popupView.webContents
  }

  private addManagedTab(view: WebContentsView, url: string, activate = true): string {
    const id = randomUUID().slice(0, 8)
    this.tabs.set(id, { id, view, url, title: '' })

    if (activate || !this.activeTabId) {
      this.switchTab(id)
    } else {
      this.onTabListChanged?.(this.getTabList())
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

  private handleViewDestroyed(view: WebContentsView, contents: WebContents): void {
    unregisterOjWebContents(contents)
    const tab = this.findTabByView(view)
    if (!tab) return

    const wasActive = tab.id === this.activeTabId
    if (wasActive) safeRemoveChildView(this.window, tab.view)
    this.tabs.delete(tab.id)

    if (this.isDestroying) return
    if (wasActive) {
      this.activeTabId = null
      const nextTabId = Array.from(this.tabs.keys()).pop()
      if (nextTabId) this.switchTab(nextTabId)
    }
    this.onTabListChanged?.(this.getTabList())
  }

  private findTabByView(view: WebContentsView): ManagedTab | null {
    for (const tab of this.tabs.values()) {
      if (tab.view === view) return tab
    }
    return null
  }

  createTab(url?: string): string {
    if (this.tabs.size >= MAX_TABS) {
      return this.activeTabId ?? ''
    }

    if (url) {
      const decision = this.evaluateNavigation(url, true)
      if (!decision.allowed) {
        this.notifyNavigationBlocked(decision.reason!)
        return this.activeTabId ?? ''
      }
    }

    const view = this.createView()
    const id = this.addManagedTab(view, url ?? '')

    if (url) {
      void view.webContents.loadURL(url)
    }

    return id
  }

  closeTab(tabId: string): void {
    if (this.tabs.size <= 1) return

    const tab = this.tabs.get(tabId)
    if (!tab) return

    const wasActive = tabId === this.activeTabId

    if (wasActive) {
      safeRemoveChildView(this.window, tab.view)
    }

    this.tabs.delete(tabId)
    unregisterOjWebContents(tab.view.webContents)
    safeCloseWebContents(tab.view)

    if (wasActive) {
      this.activeTabId = null
      const lastKey = Array.from(this.tabs.keys()).pop()!
      this.switchTab(lastKey)
    }

    this.onTabListChanged?.(this.getTabList())
  }

  closeActiveTab(): void {
    if (this.activeTabId) this.closeTab(this.activeTabId)
  }

  switchTab(tabId: string): void {
    if (tabId === this.activeTabId) return

    const newTab = this.tabs.get(tabId)
    if (!newTab) return

    if (this.activeTabId) {
      const currentTab = this.tabs.get(this.activeTabId)
      if (currentTab) {
        safeRemoveChildView(this.window, currentTab.view)
      }
    }

    this.activeTabId = tabId
    if (!this.isViewHidden) {
      this.window.contentView.addChildView(newTab.view)
      this.updateBounds()
    }

    this.onUrlChange?.(newTab.url)
    this.emitActiveTabChange(newTab.url)
    this.onTabListChanged?.(this.getTabList())
  }

  switchRelative(offset: number): void {
    const tabIds = Array.from(this.tabs.keys())
    if (tabIds.length === 0 || !this.activeTabId) return
    const activeIndex = tabIds.indexOf(this.activeTabId)
    if (activeIndex < 0) return
    const nextIndex = (activeIndex + offset + tabIds.length) % tabIds.length
    this.switchTab(tabIds[nextIndex])
  }

  switchTabByIndex(index: number): void {
    const tabId = Array.from(this.tabs.keys())[index]
    if (tabId) this.switchTab(tabId)
  }

  detachTab(tabId: string): BrowserWindow | null {
    if (this.tabs.size <= 1) return null

    const tab = this.tabs.get(tabId)
    if (!tab) return null
    
    if (!tab.url || tab.url === 'about:blank') return null

    this.tabs.delete(tabId)

    if (tabId === this.activeTabId) {
      safeRemoveChildView(this.window, tab.view)
      this.activeTabId = null
      const nextKey = Array.from(this.tabs.keys()).pop()!
      this.switchTab(nextKey)
    }

    const detached = new DetachedWindow(tab.view, tab.title)
    this.onTabListChanged?.(this.getTabList())
    return detached.getWindow()
  }

  navigate(url: string) {
    const decision = this.evaluateNavigation(url, true)
    if (!decision.allowed) {
      this.notifyNavigationBlocked(decision.reason!)
      return
    }
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
      this.createTab(url)
      return
    }
    const tab = this.tabs.get(this.activeTabId)!
    void tab.view.webContents.loadURL(url)
  }

  goBack() {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (tab?.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
    }
  }

  goForward() {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (tab?.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  reload() {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    tab?.view.webContents.reload()
  }

  adjustZoom(delta: number): void {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (!tab) return
    const current = tab.view.webContents.getZoomFactor()
    const next = Math.min(5, Math.max(0.25, Math.round((current + delta) * 100) / 100))
    tab.view.webContents.setZoomFactor(next)
  }

  resetZoom(): void {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    tab?.view.webContents.setZoomFactor(1)
  }

  getUrl(): string {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    return tab?.view.webContents.getURL() ?? ''
  }

  getTitleForUrl(url: string): string | undefined {
    for (const tab of this.tabs.values()) {
      const currentUrl = tab.view.webContents.getURL()
      if (tab.url === url || currentUrl === url || samePageUrl(tab.url, url) || samePageUrl(currentUrl, url)) {
        return tab.title || tab.view.webContents.getTitle()
      }
    }
    return undefined
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  isViewVisible(): boolean {
    if (!this.activeTabId) return false
    return this.tabs.has(this.activeTabId)
  }

  getTabList(): TabInfo[] {
    const list: TabInfo[] = []
    for (const tab of this.tabs.values()) {
      list.push({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        isActive: tab.id === this.activeTabId,
      })
    }
    return list
  }

  setLeftOffset(offset: number) {
    this.leftOffset = offset
    this.updateBounds()
  }

  private updateBounds() {
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return
    const [width, height] = this.window.getContentSize()
    setTabViewBounds(tab.view, { width, height }, this.leftOffset)
  }

  hideView() {
    this.isViewHidden = true
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return
    safeRemoveChildView(this.window, tab.view)
  }

  showView() {
    this.isViewHidden = false
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return
    try {
      this.window.contentView.addChildView(tab.view)
      this.updateBounds()
    } catch { /* ignore */ }
  }

  async capturePreview(): Promise<string | null> {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (!tab) return null
    try {
      const bounds = tab.view.getBounds()
      const image = await tab.view.webContents.capturePage()
      const resized = image.resize({
        width: bounds.width,
        height: bounds.height,
        quality: 'best',
      })
      return resized.toDataURL()
    } catch {
      return null
    }
  }

  async executeScript(code: string, userGesture = false): Promise<any> {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (!tab) return null
    return tab.view.webContents.executeJavaScript(code, userGesture)
  }

  async executeScriptOnUrl(url: string, code: string): Promise<any> {
    for (const tab of this.tabs.values()) {
      const currentUrl = tab.view.webContents.getURL()
      if (tab.url === url || currentUrl === url || samePageUrl(tab.url, url) || samePageUrl(currentUrl, url)) {
        return executeScriptAcrossFrames(tab, url, code)
      }
    }
    return Promise.reject(new Error('Tab not found'))
  }

  warmup() {
    this.createTab()
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

  destroy() {
    this.isDestroying = true
    const tabs = Array.from(this.tabs.values())
    this.tabs.clear()
    this.activeTabId = null
    for (const tab of tabs) {
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
