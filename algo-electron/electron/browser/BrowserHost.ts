import { WebContentsView, BrowserWindow } from 'electron'

const TOOLBAR_HEIGHT = 42
const DEFAULT_URL = 'https://codeforces.com'

export class BrowserHost {
  private view: WebContentsView
  private window: BrowserWindow
  private onUrlChange: ((url: string) => void) | null = null

  constructor(window: BrowserWindow) {
    this.window = window

    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    this.window.contentView.addChildView(this.view)
    this.updateBounds()

    this.view.webContents.on('did-navigate', (_event, url) => {
      this.onUrlChange?.(url)
    })
    this.view.webContents.on('did-navigate-in-page', (_event, url) => {
      this.onUrlChange?.(url)
    })

    this.window.on('resize', () => {
      this.updateBounds()
    })
  }

  private updateBounds() {
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT })
  }

  loadDefaultUrl() {
    this.view.webContents.loadURL(DEFAULT_URL)
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
