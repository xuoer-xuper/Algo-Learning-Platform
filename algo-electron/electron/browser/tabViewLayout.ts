import type { BrowserWindow, WebContentsView } from 'electron'
import { BROWSER_LAYOUT } from './browserLayout'

export interface ContentSize {
  width: number
  height: number
}

export function setTabViewBounds(view: WebContentsView, contentSize: ContentSize, leftOffset: number): void {
  view.setBounds({
    x: leftOffset,
    y: BROWSER_LAYOUT.topOffset,
    width: contentSize.width - leftOffset,
    height: contentSize.height - BROWSER_LAYOUT.topOffset,
  })
}

export function safeRemoveChildView(window: BrowserWindow, view: WebContentsView): void {
  try {
    window.contentView.removeChildView(view)
  } catch {
    // Removing an already-detached view is harmless during tab switches and teardown.
  }
}

export function safeCloseWebContents(view: WebContentsView): void {
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close()
    }
  } catch {
    // Window teardown can race with webContents destruction.
  }
}
