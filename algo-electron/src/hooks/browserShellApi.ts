export function subscribeUrlChanged(callback: (url: string) => void): () => void {
  return window.electronAPI.onUrlChanged(callback)
}

export function subscribeUiCommand(callback: (command: UiCommand) => void): () => void {
  return window.electronAPI.onUiCommand(callback)
}

export function findBrowserInPage(
  tabId: string,
  command: FindInPageCommand,
): Promise<FindInPageViewState | null> {
  return window.electronAPI.findInPage(tabId, command)
}

export function subscribeFindInPageResult(
  callback: (state: FindInPageViewState) => void,
): () => void {
  return window.electronAPI.onFindInPageResult(callback)
}

export function setBrowserZoom(tabId: string, command: ZoomCommand): Promise<ZoomState | null> {
  return window.electronAPI.setZoom(tabId, command)
}

export function subscribeBrowserZoomChanged(callback: (state: ZoomState) => void): () => void {
  return window.electronAPI.onZoomChanged(callback)
}

export function setDownloadNoticeVisible(visible: boolean): void {
  window.electronAPI.setDownloadNoticeVisible(visible)
}

export function subscribeDownloadResult(
  callback: (result: ManagedDownloadResult) => void,
): () => void {
  return window.electronAPI.onDownloadResult(callback)
}

export function getPendingUserScriptInstall(
  installId: string,
): Promise<PendingUserScriptInstall | null> {
  return window.electronAPI.getUserScriptInstall(installId)
}

export function cancelPendingUserScriptInstall(installId: string): Promise<boolean> {
  return window.electronAPI.cancelUserScriptInstall(installId)
}

export function getRemoteUserScriptInstallPreview(installId: string): Promise<UserScriptInstallPreview | null> {
  return window.electronAPI.getRemoteUserScriptInstallPreview(installId)
}

export function confirmRemoteUserScriptInstall(
  installId: string,
  action: UserScriptInstallAction,
): Promise<UserScriptInstallInstallResult | null> {
  return window.electronAPI.confirmRemoteUserScriptInstall(installId, action)
}

export function cancelRemoteUserScriptInstall(installId: string): Promise<boolean> {
  return window.electronAPI.cancelRemoteUserScriptInstall(installId)
}

export function getUserScriptHostPermissionPrompt(): Promise<UserScriptHostPermissionPrompt | null> {
  return window.electronAPI.getUserScriptHostPermissionPrompt()
}

export function respondUserScriptHostPermission(
  promptId: string,
  allow: boolean,
): Promise<UserScriptHostPermissionResponse> {
  return window.electronAPI.respondUserScriptHostPermission(promptId, allow)
}

export function subscribeUserScriptHostPermissionPrompt(
  callback: (prompt: UserScriptHostPermissionPrompt) => void,
): () => void {
  return window.electronAPI.onUserScriptHostPermissionPrompt(callback)
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

export function showBrowserShellContextMenu(kind: ShellContextMenuKind): void {
  window.electronAPI.showShellContextMenu(kind)
}

export function showBrowserTabContextMenu(tabId: string): void {
  window.electronAPI.showTabContextMenu(tabId)
}
