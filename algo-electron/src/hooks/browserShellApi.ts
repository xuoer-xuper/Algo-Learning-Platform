export function captureBrowserPreview(): Promise<string | null> {
  return window.electronAPI.captureBrowserPreview()
}

export function hideBrowserView(): void {
  window.electronAPI.hideView()
}

export function showBrowserView(): void {
  window.electronAPI.showView()
}

export function subscribeUrlChanged(callback: (url: string) => void): () => void {
  return window.electronAPI.onUrlChanged(callback)
}

export function setBrowserSidebarWidth(width: number): void {
  window.electronAPI.setSidebarWidth(width)
}

export function navigateBrowser(url: string): void {
  window.electronAPI.navigate(url)
}

export function goBrowserHome(): void {
  window.electronAPI.goHome()
}

export function goBrowserBack(): void {
  window.electronAPI.goBack()
}

export function goBrowserForward(): void {
  window.electronAPI.goForward()
}

export function reloadBrowser(): void {
  window.electronAPI.reload()
}

export function syncBrowserCurrentPage(): Promise<SyncResult> {
  return window.electronAPI.syncCurrentPage()
}
