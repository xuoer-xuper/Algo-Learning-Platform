import { WebContentsView, BrowserWindow } from 'electron'

const TOOLBAR_HEIGHT = 42

export class BrowserHost {
  private view: WebContentsView
  private window: BrowserWindow
  private defaultUrl: string
  private leftOffset = 0
  private onUrlChange: ((url: string) => void) | null = null
  private onNavigate: ((url: string) => void) | null = null
  private onTitleChange: ((title: string, url: string) => void) | null = null

  constructor(window: BrowserWindow, defaultUrl: string) {
    this.window = window
    this.defaultUrl = defaultUrl

    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:oj-main',
      },
    })

    this.window.contentView.addChildView(this.view)
    this.updateBounds()

    this.view.webContents.on('did-navigate', (_event, url) => {
      this.onUrlChange?.(url)
      this.onNavigate?.(url)
    })
    this.view.webContents.on('did-navigate-in-page', (_event, url) => {
      this.onUrlChange?.(url)
      this.onNavigate?.(url)
    })

    // 处理新窗口请求（target="_blank"、window.open 等）
    // 在当前视图中打开，而不是新建窗口
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      if (url && url !== 'about:blank') {
        this.view.webContents.loadURL(url)
      }
      return { action: 'deny' }
    })

    // 兜底：如果新窗口被意外创建，获取 URL 后在当前视图打开并关闭新窗口
    this.view.webContents.on('did-create-window', (newWin) => {
      const newUrl = newWin.webContents.getURL()
      if (newUrl && newUrl !== 'about:blank') {
        this.view.webContents.loadURL(newUrl)
      } else {
        // 空白窗口等待导航完成后获取 URL
        newWin.webContents.once('did-navigate', (_e, url) => {
          this.view.webContents.loadURL(url)
        })
      }
      newWin.close()
    })

    // 监听页面标题变化
    this.view.webContents.on('page-title-updated', (_event, title) => {
      const url = this.view.webContents.getURL()
      this.onTitleChange?.(title, url)
    })

    this.window.on('resize', () => {
      this.updateBounds()
    })
  }

  private updateBounds() {
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({ x: this.leftOffset, y: TOOLBAR_HEIGHT, width: width - this.leftOffset, height: height - TOOLBAR_HEIGHT })
  }

  setLeftOffset(offset: number) {
    this.leftOffset = offset
    this.updateBounds()
  }

  loadDefaultUrl() {
    this.view.webContents.loadURL(this.defaultUrl)
  }

  navigate(url: string) {
    this.view.webContents.loadURL(url)
  }

  goBack() {
    if (this.view.webContents.canGoBack()) {
      this.view.webContents.goBack()
    }
  }

  goForward() {
    if (this.view.webContents.canGoForward()) {
      this.view.webContents.goForward()
    }
  }

  reload() {
    this.view.webContents.reload()
  }

  getUrl(): string {
    return this.view.webContents.getURL()
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

  async executeScript(code: string): Promise<any> {
    return this.view.webContents.executeJavaScript(code)
  }

  hideView() {
    try {
      this.window.contentView.removeChildView(this.view)
    } catch { /* already removed */ }
  }

  showView() {
    try {
      this.window.contentView.addChildView(this.view)
      this.updateBounds()
    } catch { /* already added */ }
  }

  destroy() {
    try {
      if (!this.view.webContents.isDestroyed()) {
        this.window.contentView.removeChildView(this.view)
        this.view.webContents.close()
      }
    } catch {
      // window already destroyed, ignore
    }
  }
}
