export interface TabBarTabInfo {
  id: string
  url: string
  title: string
  isActive: boolean
}

export function subscribeTabListChanged(callback: (tabs: TabBarTabInfo[]) => void): () => void {
  return window.electronAPI.onTabListChanged(callback)
}

export function switchBrowserTab(tabId: string): void {
  window.electronAPI.switchTab(tabId)
}

export function closeBrowserTab(tabId: string): void {
  window.electronAPI.closeTab(tabId)
}

export function detachBrowserTab(tabId: string): void {
  window.electronAPI.detachTab(tabId)
}

export function createBrowserTab(): Promise<string> {
  return window.electronAPI.createTab()
}
