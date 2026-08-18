export function subscribeUrlChanged(callback: (url: string) => void): () => void {
  return window.electronAPI.onUrlChanged(callback)
}

export function subscribeUiCommand(callback: (command: UiCommand) => void): () => void {
  return window.electronAPI.onUiCommand(callback)
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

export function getBrowserOmniboxSuggestions(query: string): Promise<OmniboxSuggestion[]> {
  return window.electronAPI.getOmniboxSuggestions(query)
}

export function setBrowserOmniboxOpen(open: boolean): void {
  window.electronAPI.setOmniboxOpen(open)
}

export function showBrowserAppMenu(anchor: AppMenuAnchor): void {
  window.electronAPI.showAppMenu(anchor)
}
