import { WebContentsView, BrowserWindow } from 'electron'

const TOOLBAR_HEIGHT = 42

export class BrowserHost {
  private view: WebContentsView | null = null
  private window: BrowserWindow
  private leftOffset = 0
  private added = false
  private onUrlChange: ((url: string) => void) | null = null
  private onNavigate: ((url: string) => void) | null = null
  private onTitleChange: ((title: string, url: string) => void) | null = null
  private onPageLoaded: ((url: string) => void) | null = null

  constructor(window: BrowserWindow) {
    this.window = window
    this.window.on('resize', () => this.updateBounds())
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view

    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: false, // 允许脚本进行跨域请求 (GM_xmlhttpRequest)
        partition: 'persist:oj-main',
      },
    })

    this.view.webContents.on('did-navigate', (_event, url) => {
      this.onUrlChange?.(url)
      this.onNavigate?.(url)
    })
    this.view.webContents.on('did-navigate-in-page', (_event, url) => {
      this.onUrlChange?.(url)
      this.onNavigate?.(url)
    })

    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (url && url !== 'about:blank') {
        this.view!.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })

    this.view.webContents.on('did-create-window', (newWin) => {
      const newUrl = newWin.webContents.getURL()
      if (newUrl && newUrl !== 'about:blank') {
        this.view!.webContents.loadURL(newUrl)
      } else {
        newWin.webContents.once('did-navigate', (_e, url) => {
          this.view!.webContents.loadURL(url)
        })
      }
      newWin.close()
    })

    this.view.webContents.on('page-title-updated', (_event, title) => {
      const url = this.view!.webContents.getURL()
      this.onTitleChange?.(title, url)
    })

    this.view.webContents.on('did-finish-load', () => {
      const url = this.view!.webContents.getURL()
      this.onPageLoaded?.(url)
    })

    return this.view
  }

  private addToWindow() {
    if (this.added) return
    this.window.contentView.addChildView(this.ensureView())
    this.added = true
    this.updateBounds()
  }

  private updateBounds() {
    if (!this.view || !this.added) return
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({ x: this.leftOffset, y: TOOLBAR_HEIGHT, width: width - this.leftOffset, height: height - TOOLBAR_HEIGHT })
  }

  setLeftOffset(offset: number) {
    this.leftOffset = offset
    this.updateBounds()
  }

  navigate(url: string) {
    this.addToWindow()
    this.ensureView().webContents.loadURL(url)
  }

  goBack() {
    if (this.view?.webContents.navigationHistory.canGoBack()) {
      this.view.webContents.navigationHistory.goBack()
    }
  }

  goForward() {
    if (this.view?.webContents.navigationHistory.canGoForward()) {
      this.view.webContents.navigationHistory.goForward()
    }
  }

  reload() {
    this.view?.webContents.reload()
  }

  getUrl(): string {
    return this.view?.webContents.getURL() ?? ''
  }

  isViewVisible(): boolean {
    return this.added && !!this.view
  }

  async capturePreview(): Promise<string | null> {
    if (!this.view || !this.added) return null
    try {
      const image = await this.view.webContents.capturePage()
      return image.toDataURL()
    } catch {
      return null
    }
  }

  hideView() {
    if (!this.added || !this.view) return
    try {
      this.window.contentView.removeChildView(this.view)
      this.added = false
    } catch { /* ignore */ }
  }

  showView() {
    if (!this.view || this.added) return
    try {
      this.window.contentView.addChildView(this.view)
      this.added = true
      this.updateBounds()
    } catch { /* ignore */ }
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

  async executeScript(code: string): Promise<any> {
    if (!this.view) return null
    return this.view.webContents.executeJavaScript(code)
  }

  destroy() {
    try {
      if (this.view && !this.view.webContents.isDestroyed()) {
        if (this.added) {
          this.window.contentView.removeChildView(this.view)
        }
        this.view.webContents.close()
      }
    } catch { /* ignore */ }
  }
}
