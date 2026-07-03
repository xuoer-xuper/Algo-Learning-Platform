import type { BrowserWindow, WebContentsView } from 'electron'
import { TABBAR_HEIGHT, TOOLBAR_HEIGHT } from './tabManagerConfig'

export interface ContentSize {
  width: number
  height: number
}

export function setTabViewBounds(view: WebContentsView, contentSize: ContentSize, leftOffset: number): void {
  view.setBounds({
    x: leftOffset,
    y: TOOLBAR_HEIGHT + TABBAR_HEIGHT,
    width: contentSize.width - leftOffset,
    height: contentSize.height - TOOLBAR_HEIGHT - TABBAR_HEIGHT,
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
