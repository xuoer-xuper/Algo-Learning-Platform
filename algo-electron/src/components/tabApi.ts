import type { InternalPage, TabInfo } from '@shared/types/browser'
export type TabStripTabInfo = TabInfo

export function subscribeTabListChanged(callback: (tabs: TabStripTabInfo[]) => void): () => void {
  return window.api.tab.onListChanged(callback)
}

export function getBrowserTabList(): Promise<TabStripTabInfo[]> {
  return window.api.tab.getList()
}

export function switchBrowserTab(tabId: string): void {
  window.api.tab.switch(tabId)
}

export function reorderBrowserTab(tabId: string, targetIndex: number): Promise<boolean> {
  return window.api.tab.reorder({ tabId, targetIndex })
}

export function moveBrowserTabToNewWindow(tabId: string): Promise<boolean> {
  return window.api.tab.moveToNewWindow(tabId)
}

export function finishBrowserTabDrag(
  tabId: string,
  targetIndex: number,
  screenX: number,
  screenY: number,
): Promise<boolean> {
  return window.api.tab.finishDrag({ tabId, targetIndex, screenX, screenY })
}

export function closeBrowserTab(tabId: string): void {
  window.api.tab.close(tabId)
}

export function reopenClosedBrowserTab(): Promise<string> {
  return window.api.tab.reopenClosed()
}

export function reloadBrowserTab(tabId: string): void {
  window.api.tab.reload(tabId)
}

export function dismissUnresponsiveBrowserTab(tabId: string): void {
  window.api.tab.dismissUnresponsive(tabId)
}

export function openInternalBrowserTab(page: InternalPage): Promise<string> {
  return window.api.tab.openInternal(page)
}

export function createBrowserTab(): Promise<string> {
  return window.api.tab.create()
}
