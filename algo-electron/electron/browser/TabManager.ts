import { WebContentsView, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { DetachedWindow } from './DetachedWindow'

export interface TabInfo {
  id: string
  url: string
  title: string
  isActive: boolean
}

const MAX_TABS = 8
const TOOLBAR_HEIGHT = 42
const TABBAR_HEIGHT = 36

export class TabManager {
  private tabs = new Map<string, { id: string, view: WebContentsView, url: string, title: string }>()
  private activeTabId: string | null = null
  private window: BrowserWindow
  private leftOffset = 0
  private onUrlChange: ((url: string) => void) | null = null
  private onNavigate: ((url: string) => void) | null = null
  private onTitleChange: ((title: string, url: string) => void) | null = null
  private onPageLoaded: ((url: string) => void) | null = null
  private onTabListChanged: ((tabs: TabInfo[]) => void) | null = null
  private isViewHidden = false

  constructor(window: BrowserWindow) {
    this.window = window
    this.window.on('resize', () => this.updateBounds())
  }

  private createView(): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: false,
        partition: 'persist:oj-main',
      },
    })

    view.webContents.on('did-navigate', (_event, url) => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.onNavigate?.(url)
        }
      }
    })

    view.webContents.on('did-navigate-in-page', (_event, url) => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.url = url
        if (tab.id === this.activeTabId) {
          this.onUrlChange?.(url)
          this.onNavigate?.(url)
        }
      }
    })

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url && url !== 'about:blank') {
        view.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })

    view.webContents.on('did-create-window', (newWin) => {
      const newUrl = newWin.webContents.getURL()
      if (newUrl && newUrl !== 'about:blank') {
        view.webContents.loadURL(newUrl)
      } else {
        newWin.webContents.once('did-navigate', (_e, url) => {
          view.webContents.loadURL(url)
        })
      }
      newWin.close()
    })

    view.webContents.on('page-title-updated', (_event, title) => {
      const tab = this.findTabByView(view)
      if (tab) {
        tab.title = title
        if (tab.id === this.activeTabId) {
          const url = view.webContents.getURL()
          this.onTitleChange?.(title, url)
        }
        this.onTabListChanged?.(this.getTabList())
      }
    })

    view.webContents.on('did-finish-load', () => {
      const tab = this.findTabByView(view)
      if (tab && tab.id === this.activeTabId) {
        const url = view.webContents.getURL()
        this.onPageLoaded?.(url)
      }
    })

    return view
  }

  private findTabByView(view: WebContentsView) {
    for (const tab of this.tabs.values()) {
      if (tab.view === view) return tab
    }
    return null
  }

  createTab(url?: string): string {
    if (this.tabs.size >= MAX_TABS) {
      return this.activeTabId ?? ''
    }

    const id = randomUUID().slice(0, 8)
    const view = this.createView()
    this.tabs.set(id, { id, view, url: url ?? '', title: '' })

    this.switchTab(id)

    if (url) {
      view.webContents.loadURL(url)
    }

    this.onTabListChanged?.(this.getTabList())
    return id
  }

  closeTab(tabId: string): void {
    if (this.tabs.size <= 1) return

    const tab = this.tabs.get(tabId)
    if (!tab) return

    const wasActive = tabId === this.activeTabId

    if (wasActive) {
      try {
        this.window.contentView.removeChildView(tab.view)
      } catch { /* ignore */ }
    }

    try {
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.close()
      }
    } catch { /* ignore */ }

    this.tabs.delete(tabId)

    if (wasActive) {
      const lastKey = Array.from(this.tabs.keys()).pop()!
      this.switchTab(lastKey)
    }

    this.onTabListChanged?.(this.getTabList())
  }

  switchTab(tabId: string): void {
    if (tabId === this.activeTabId) return

    const newTab = this.tabs.get(tabId)
    if (!newTab) return

    if (this.activeTabId) {
      const currentTab = this.tabs.get(this.activeTabId)
      if (currentTab) {
        try {
          this.window.contentView.removeChildView(currentTab.view)
        } catch { /* ignore */ }
      }
    }

    this.activeTabId = tabId
    if (!this.isViewHidden) {
      this.window.contentView.addChildView(newTab.view)
      this.updateBounds()
    }

    this.onUrlChange?.(newTab.url)
    this.onTabListChanged?.(this.getTabList())
  }

  detachTab(tabId: string): BrowserWindow | null {
    if (this.tabs.size <= 1) return null

    const tab = this.tabs.get(tabId)
    if (!tab) return null
    
    if (!tab.url || tab.url === 'about:blank') return null

    this.tabs.delete(tabId)

    if (tabId === this.activeTabId) {
      try {
        this.window.contentView.removeChildView(tab.view)
      } catch { /* ignore */ }
      this.activeTabId = null
      const nextKey = Array.from(this.tabs.keys()).pop()!
      this.switchTab(nextKey)
    }

    const detached = new DetachedWindow(tab.view, tab.title)
    this.onTabListChanged?.(this.getTabList())
    return detached.getWindow()
  }

  navigate(url: string) {
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
      this.createTab(url)
      return
    }
    const tab = this.tabs.get(this.activeTabId)!
    tab.view.webContents.loadURL(url)
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

  getUrl(): string {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    return tab?.view.webContents.getURL() ?? ''
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
    tab.view.setBounds({
      x: this.leftOffset,
      y: TOOLBAR_HEIGHT + TABBAR_HEIGHT,
      width: width - this.leftOffset,
      height: height - TOOLBAR_HEIGHT - TABBAR_HEIGHT,
    })
  }

  hideView() {
    this.isViewHidden = true
    if (!this.activeTabId) return
    const tab = this.tabs.get(this.activeTabId)
    if (!tab) return
    try {
      this.window.contentView.removeChildView(tab.view)
    } catch { /* ignore */ }
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
      const image = await tab.view.webContents.capturePage()
      return image.toDataURL()
    } catch {
      return null
    }
  }

  async executeScript(code: string): Promise<any> {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : null
    if (!tab) return null
    return tab.view.webContents.executeJavaScript(code)
  }

  async executeScriptOnUrl(url: string, code: string): Promise<any> {
    for (const tab of this.tabs.values()) {
      if (tab.url === url) {
        return tab.view.webContents.executeJavaScript(code)
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

  setNavigateCallback(callback: (url: string) => void) {
    this.onNavigate = callback
  }

  setTitleChangeCallback(callback: (title: string, url: string) => void) {
    this.onTitleChange = callback
  }

  setPageLoadedCallback(callback: (url: string) => void) {
    this.onPageLoaded = callback
  }

  setTabListChangedCallback(callback: (tabs: TabInfo[]) => void) {
    this.onTabListChanged = callback
  }

  destroy() {
    for (const tab of this.tabs.values()) {
      try {
        if (!tab.view.webContents.isDestroyed()) {
          this.window.contentView.removeChildView(tab.view)
          tab.view.webContents.close()
        }
      } catch { /* ignore */ }
    }
    this.tabs.clear()
    this.activeTabId = null
  }
}
