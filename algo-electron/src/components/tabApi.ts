export type TabBarTabInfo = TabInfo

export function subscribeTabListChanged(callback: (tabs: TabBarTabInfo[]) => void): () => void {
  return window.electronAPI.onTabListChanged(callback)
}

export function getBrowserTabList(): Promise<TabBarTabInfo[]> {
  return window.electronAPI.getTabList()
}

export function switchBrowserTab(tabId: string): void {
  window.electronAPI.switchTab(tabId)
}

export function closeBrowserTab(tabId: string): void {
  window.electronAPI.closeTab(tabId)
}

export function reopenClosedBrowserTab(): Promise<string> {
  return window.electronAPI.reopenClosedTab()
}

export function detachBrowserTab(tabId: string): void {
  window.electronAPI.detachTab(tabId)
}

export function reloadBrowserTab(tabId: string): void {
  window.electronAPI.reloadTab(tabId)
}

export function dismissUnresponsiveBrowserTab(tabId: string): void {
  window.electronAPI.dismissUnresponsiveTab(tabId)
}

export function openInternalBrowserTab(page: InternalPage): Promise<string> {
  return window.electronAPI.openInternalTab(page)
}

export function createBrowserTab(): Promise<string> {
  return window.electronAPI.createTab()
}
