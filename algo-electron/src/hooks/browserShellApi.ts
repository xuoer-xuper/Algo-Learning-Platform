import type { AppMenuAnchor, ShellContextMenuKind, UiCommand } from '@shared/types/window'
import type {
  FindInPageCommand,
  FindInPageViewState,
  ManagedDownloadResult,
  ZoomCommand,
  ZoomState,
} from '@shared/types/browser'
import type {
  PendingUserScriptInstall,
  UserScriptHostPermissionPrompt,
  UserScriptHostPermissionResponse,
  UserScriptInstallAction,
  UserScriptInstallInstallResult,
  UserScriptInstallPreview,
} from '@shared/types/scripts'
import type {
  CredentialAutofillPrompt,
  CredentialCaptureAction,
  CredentialCapturePrompt,
  CredentialCaptureResult,
} from '@shared/types/credentials'
import type { SyncResult } from '@shared/types/submission'
import type { OmniboxSuggestion } from '@shared/types/problem'
export function subscribeUrlChanged(callback: (url: string) => void): () => void {
  return window.api.browser.onUrlChanged(callback)
}

export function subscribeUiCommand(callback: (command: UiCommand) => void): () => void {
  return window.api.browser.onUiCommand(callback)
}

export function findBrowserInPage(
  tabId: string,
  command: FindInPageCommand,
): Promise<FindInPageViewState | null> {
  return window.api.browser.findInPage({ tabId, command })
}

export function subscribeFindInPageResult(
  callback: (state: FindInPageViewState) => void,
): () => void {
  return window.api.browser.onFindInPageResult(callback)
}

export function setBrowserZoom(tabId: string, command: ZoomCommand): Promise<ZoomState | null> {
  return window.api.browser.setZoom({ tabId, command })
}

export function subscribeBrowserZoomChanged(callback: (state: ZoomState) => void): () => void {
  return window.api.browser.onZoomChanged(callback)
}

export function setDownloadNoticeVisible(visible: boolean): void {
  window.api.browser.setDownloadNoticeVisible(visible)
}

export function setErrorNoticeVisible(visible: boolean): void {
  window.api.browser.setErrorNoticeVisible(visible)
}

export function subscribeDownloadResult(
  callback: (result: ManagedDownloadResult) => void,
): () => void {
  return window.api.browser.onDownloadResult(callback)
}

export function getPendingUserScriptInstall(
  installId: string,
): Promise<PendingUserScriptInstall | null> {
  return window.api.scripts.getPendingInstall(installId)
}

export function cancelPendingUserScriptInstall(installId: string): Promise<boolean> {
  return window.api.scripts.cancelPendingInstall(installId)
}

export function getRemoteUserScriptInstallPreview(
  installId: string,
): Promise<UserScriptInstallPreview | null> {
  return window.api.scripts.getRemoteInstallPreview(installId)
}

export function confirmRemoteUserScriptInstall(
  installId: string,
  action: UserScriptInstallAction,
): Promise<UserScriptInstallInstallResult | null> {
  return window.api.scripts.confirmRemoteInstall({ installId, action })
}

export function cancelRemoteUserScriptInstall(installId: string): Promise<boolean> {
  return window.api.scripts.cancelRemoteInstall(installId)
}

export function getUserScriptHostPermissionPrompt(): Promise<UserScriptHostPermissionPrompt | null> {
  return window.api.scripts.getHostPermissionPrompt()
}

export function respondUserScriptHostPermission(
  promptId: string,
  allow: boolean,
): Promise<UserScriptHostPermissionResponse> {
  return window.api.scripts.respondHostPermission({ promptId, allow })
}

export function subscribeUserScriptHostPermissionPrompt(
  callback: (prompt: UserScriptHostPermissionPrompt) => void,
): () => void {
  return window.api.scripts.onHostPermissionPrompt(callback)
}

/**
 * 凭据提示。壳层只收脱敏摘要（站点、用户名、masked），密码明文不经过 renderer。
 * 与 userscript host 授权提示同一形状：get 拿当前 pending，subscribe 收后续推送。
 */
export function getCredentialAutofillPrompt(): Promise<CredentialAutofillPrompt | null> {
  return window.api.credentials.getAutofillPrompt()
}

export function subscribeCredentialAutofillPrompt(
  callback: (prompt: CredentialAutofillPrompt) => void,
): () => void {
  return window.api.credentials.onAutofillPrompt(callback)
}

export function respondCredentialAutofill(
  requestId: string,
  credentialId: string | null,
): Promise<boolean> {
  return window.api.credentials.respondAutofill({ requestId, credentialId })
}

export function getCredentialCapturePrompt(): Promise<CredentialCapturePrompt | null> {
  return window.api.credentials.getCapturePrompt()
}

export function subscribeCredentialCapturePrompt(
  callback: (prompt: CredentialCapturePrompt) => void,
): () => void {
  return window.api.credentials.onCapturePrompt(callback)
}

export function subscribeCredentialCaptureResult(
  callback: (result: CredentialCaptureResult) => void,
): () => void {
  return window.api.credentials.onCaptureResult(callback)
}

export function respondCredentialCapture(
  captureId: string,
  action: CredentialCaptureAction,
): Promise<boolean> {
  return window.api.credentials.respondCapture({ captureId, action })
}

export function setBrowserSidebarWidth(width: number): void {
  window.api.browser.setSidebarWidth(width)
}

export function navigateBrowser(url: string): void {
  window.api.browser.navigate(url)
}

export function goBrowserHome(): void {
  window.api.browser.goHome()
}

export function goBrowserBack(): void {
  window.api.browser.goBack()
}

export function goBrowserForward(): void {
  window.api.browser.goForward()
}

export function reloadBrowser(): void {
  window.api.browser.reload()
}

export function syncBrowserCurrentPage(): Promise<SyncResult> {
  return window.api.submissions.syncCurrentPage()
}

export function getBrowserOmniboxSuggestions(query: string): Promise<OmniboxSuggestion[]> {
  return window.api.browser.getOmniboxSuggestions(query)
}

export function setBrowserOmniboxOpen(open: boolean): void {
  window.api.browser.setOmniboxOpen(open)
}

export function showBrowserAppMenu(anchor: AppMenuAnchor): void {
  window.api.browser.showAppMenu(anchor)
}

export function showBrowserShellContextMenu(kind: ShellContextMenuKind): void {
  window.api.browser.showShellContextMenu(kind)
}

export function showBrowserTabContextMenu(tabId: string): void {
  window.api.browser.showTabContextMenu(tabId)
}
