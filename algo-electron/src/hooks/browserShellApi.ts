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

export function setErrorNoticeVisible(visible: boolean): void {
  window.electronAPI.setErrorNoticeVisible(visible)
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

/**
 * 凭据提示。壳层只收脱敏摘要（站点、用户名、masked），密码明文不经过 renderer。
 * 与 userscript host 授权提示同一形状：get 拿当前 pending，subscribe 收后续推送。
 */
export function getCredentialAutofillPrompt(): Promise<CredentialAutofillPrompt | null> {
  return window.electronAPI.getCredentialAutofillPrompt()
}

export function subscribeCredentialAutofillPrompt(
  callback: (prompt: CredentialAutofillPrompt) => void,
): () => void {
  return window.electronAPI.onCredentialAutofillPrompt(callback)
}

export function respondCredentialAutofill(
  requestId: string,
  credentialId: string | null,
): Promise<boolean> {
  return window.electronAPI.respondCredentialAutofill(requestId, credentialId)
}

export function getCredentialCapturePrompt(): Promise<CredentialCapturePrompt | null> {
  return window.electronAPI.getCredentialCapturePrompt()
}

export function subscribeCredentialCapturePrompt(
  callback: (prompt: CredentialCapturePrompt) => void,
): () => void {
  return window.electronAPI.onCredentialCapturePrompt(callback)
}

export function subscribeCredentialCaptureResult(
  callback: (result: CredentialCaptureResult) => void,
): () => void {
  return window.electronAPI.onCredentialCaptureResult(callback)
}

export function respondCredentialCapture(
  captureId: string,
  action: CredentialCaptureAction,
): Promise<boolean> {
  return window.electronAPI.respondCredentialCapture(captureId, action)
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
