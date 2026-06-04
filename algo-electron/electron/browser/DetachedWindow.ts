import { BrowserWindow, WebContentsView } from 'electron'

export class DetachedWindow {
  private window: BrowserWindow
  private view: WebContentsView

  constructor(view: WebContentsView, title: string) {
    this.view = view

    this.window = new BrowserWindow({
      width: 1000,
      height: 700,
      frame: true,
      title,
    })

    this.window.contentView.addChildView(this.view)
    this.updateBounds()

    this.window.on('resize', () => this.updateBounds())
    this.window.on('closed', () => this.cleanup())

    this.view.webContents.on('page-title-updated', (_event, newTitle) => {
      if (!this.window.isDestroyed()) {
        this.window.setTitle(newTitle)
      }
    })
  }

  private updateBounds() {
    if (this.window.isDestroyed()) return
    const [width, height] = this.window.getContentSize()
    this.view.setBounds({ x: 0, y: 0, width, height })
  }

  private cleanup() {
    try {
      if (!this.view.webContents.isDestroyed()) {
        this.view.webContents.close()
      }
    } catch { /* ignore */ }
  }

  getWindow(): BrowserWindow {
    return this.window
  }

  destroy() {
    try {
      if (!this.window.isDestroyed()) {
        this.window.close()
      }
    } catch { /* ignore */ }
  }
}
