import { getShellWindowOwner, ipcMain } from './trustedSender'
import { bool, decimal, freeText, int, oneOf, optional, raw, text } from './payloadSchema'
import { resolveNavigateUrl } from '../parsers/navigateUrl'
import type { BrowserDiagnostics } from '../diagnostics/BrowserDiagnostics'
import { isInternalPage } from '../browser/tabManagerTypes'
import { resolveOmniboxInput, type OmniboxBlockReason } from '../browser/omnibox'
import { getSearchConfig } from '../app/config'
import { getOmniboxSuggestions } from '../db/repositories/problemRepository'
import { isAppMenuAnchor, popupAppMenu } from '../contextMenus/appMenu'
import { popupShellContextMenu, readClipboardText } from '../contextMenus/browserContextMenu'
import { isZoomCommand } from '../browser/zoomPreferences'
import type { PendingUserScriptInstallRegistry } from '../downloads/userScriptNavigation'
import type { AppWindow } from '../windows/AppWindow'
import type {
  UserScriptHostPermissionPrompt,
  UserScriptHostPermissionResponse,
} from '../scripts/UserScriptHostPermissionBroker'

interface RegisterBrowserShellIpcOptions {
  getBrowserDiagnostics?: () => BrowserDiagnostics | null
  getUserScriptInstallRegistry?: () => PendingUserScriptInstallRegistry | null
  allowInsecureLocalhost?: boolean
  moveTabToNewWindow?: (source: AppWindow, tabId: string) => Promise<boolean>
  finishTabDrag?: (
    source: AppWindow,
    tabId: string,
    targetIndex: number,
    screenX: number,
    screenY: number,
  ) => Promise<boolean>
  getUserScriptHostPermissionPrompt?: (owner: AppWindow) => UserScriptHostPermissionPrompt | null
  respondUserScriptHostPermission?: (
    owner: AppWindow,
    promptId: string,
    allow: boolean,
  ) => Promise<UserScriptHostPermissionResponse>
}

function toNavigationBlockReason(
  reason: OmniboxBlockReason,
): 'invalid-url' | 'insecure-http' | 'unsupported-protocol' | null {
  if (reason === 'empty-input') return null
  if (reason === 'insecure-http' || reason === 'unsupported-protocol') return reason
  return 'invalid-url'
}

/*
 * 复用的界，数字全部沿用本文件原先手写检查里的值：
 *
 * - `tabId()` 200：原 `tabId.length === 0 || tabId.length > 200`。
 * - `promptId()` 256：原 `promptId.length > 256`。
 * - `tabIndex()`：原检查只有 `Number.isInteger`，没有上下界。这里给 0..999——
 *   标签是同一个窗口里的，`reorderTab` 与 `finishTabDrag` 都会把越界值夹回合法区间，
 *   给个量级上限只是避免把 `Number.MAX_SAFE_INTEGER` 一路带进去。负数本来就不合法。
 * - `screenCoord()`：原检查是 `typeof === 'number' && Number.isFinite`。
 *   `decimal` 恰好就是这两条（屏幕坐标不是整数——DPI 缩放下会有小数），
 *   界给 ±100000，远超任何多屏布局的实际范围。
 */
const tabId = () => text({ max: 200 })
const promptId = () => text({ max: 256 })
const tabIndex = () => int({ min: 0, max: 999 })
const screenCoord = () => decimal({ min: -100_000, max: 100_000 })

export function registerBrowserShellIpc(options: RegisterBrowserShellIpcOptions): void {
  /*
   * `url` 用 `optional(freeText(...))`：`createTab()` 无参是"开新标签页到首页"的正常路径，
   * 而空串在 `createTab` 里走的也是同一条兜底分支。4096 是项目里 URL 的既有口径。
   */
  ipcMain.handle('tab:create', [optional(freeText({ max: 4096 }))], (event, url) => {
    return getShellWindowOwner(event)?.tabManager.createTab(url) ?? null
  })

  ipcMain.on('tab:close', [tabId()], (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.closeTab(tabId)
  })

  ipcMain.handle('tab:reopenClosed', (event) => {
    return getShellWindowOwner(event)?.tabManager.reopenClosedTab() ?? ''
  })

  ipcMain.on('tab:switch', [tabId()], (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.switchTab(tabId)
  })

  /*
   * 这两条原先各带一个 `targetIndex as number`：`Number.isInteger(x)` 不是类型守卫，
   * 判完 TS 仍然认为它是 `unknown`，所以只能强转。schema 之后类型是真的收窄了，
   * 两处 `as` 一起删掉。
   */
  ipcMain.handle('tab:reorder', [tabId(), tabIndex()], (event, tabId, targetIndex) => {
    return getShellWindowOwner(event)?.tabManager.reorderTab(tabId, targetIndex) ?? false
  })

  ipcMain.handle('tab:moveToNewWindow', [tabId()], (event, tabId) => {
    const owner = getShellWindowOwner(event)
    return owner ? options.moveTabToNewWindow?.(owner, tabId) ?? false : false
  })

  ipcMain.handle(
    'tab:finishDrag',
    [tabId(), tabIndex(), screenCoord(), screenCoord()],
    (event, tabId, targetIndex, screenX, screenY) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? options.finishTabDrag?.(owner, tabId, targetIndex, screenX, screenY) ?? false
        : false
    },
  )

  ipcMain.on('tab:reload', [tabId()], (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.reloadTab(tabId)
  })

  ipcMain.on('tab:dismissUnresponsive', [tabId()], (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.dismissUnresponsive(tabId)
  })

  /*
   * 内部页 payload 是判别联合，形状由 `isInternalPage` 判——它要按 `type` 分支决定
   * 哪些字段必须在场，本层的组合子表达不了。`raw()` 就是为这种情况留的：
   * 让"没校验"和"在别处校验"在代码里能区分开，而不是留一个裸 `unknown` 参数。
   */
  ipcMain.handle('tab:openInternal', [raw('isInternalPage 判别联合校验')], (event, page) => {
    if (!isInternalPage(page)) return ''
    return getShellWindowOwner(event)?.tabManager.openInternalTab(page) ?? ''
  })

  ipcMain.handle('tab:getList', (event) => {
    return getShellWindowOwner(event)?.tabManager.getTabList() ?? []
  })

  /*
   * `freeText`：地址栏清空后按回车会发空串，`resolveOmniboxInput` 自己判成
   * `empty-input` 并静默返回（`toNavigationBlockReason` 对它返回 null）。
   * 收成 `text({min:1})` 会把这条正常路径变成一次载荷拒绝日志。
   */
  ipcMain.on('browser:navigate', [freeText({ max: 4096 })], (event, input) => {
    const owner = getShellWindowOwner(event)
    if (!owner) return
    const resolution = resolveOmniboxInput(input, {
      search: getSearchConfig(),
      allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
    })
    if (resolution.kind === 'blocked') {
      const reason = toNavigationBlockReason(resolution.reason)
      if (reason) owner.send('ui:command', { type: 'navigation-blocked', reason })
      return
    }
    if (resolution.kind === 'internal') {
      owner.tabManager.navigateInternal(resolution.page)
      return
    }
    owner.tabManager.navigate(resolveNavigateUrl(resolution.url))
  })

  // 256 沿用原 `query.length > 256`；空串合法（地址栏清空时前端会拉一次空建议）。
  ipcMain.handle('browser:omniboxSuggest', [freeText({ max: 256 })], (_event, query) => {
    return getOmniboxSuggestions(query)
  })

  ipcMain.on('browser:setOmniboxOpen', [bool], (event, open) => {
    getShellWindowOwner(event)?.tabManager.setOmniboxOpen(open)
  })

  /*
   * `command` 两条都交给下游：`findInPage` 的命令对象由 `TabManager.findInPage` 自己判
   * （见 tabManagerFindZoom 的用例），`setZoom` 的由 `isZoomCommand` 判。
   * 前者原先连 `unknown` 都没判就传下去了，`raw()` 至少把这件事写在了通道上。
   */
  ipcMain.handle('browser:findInPage', [tabId(), raw('TabManager.findInPage 内部判别')], (event, tabId, command) => {
    return getShellWindowOwner(event)?.tabManager.findInPage(tabId, command) ?? null
  })

  ipcMain.handle('browser:setZoom', [tabId(), raw('isZoomCommand 判别联合校验')], (event, tabId, command) => {
    if (!isZoomCommand(command)) return null
    return getShellWindowOwner(event)?.tabManager.setZoom(tabId, command) ?? null
  })

  ipcMain.on('browser:setDownloadNoticeVisible', [bool], (event, visible) => {
    getShellWindowOwner(event)?.tabManager.setDownloadNoticeVisible(visible)
  })

  ipcMain.on('browser:setErrorNoticeVisible', [bool], (event, visible) => {
    getShellWindowOwner(event)?.tabManager.setErrorNoticeVisible(visible)
  })

  ipcMain.handle('browser:getUserScriptInstall', [tabId()], (_event, installId) => {
    return options.getUserScriptInstallRegistry?.()?.get(installId) ?? null
  })

  ipcMain.handle('browser:cancelUserScriptInstall', [tabId()], (_event, installId) => {
    return options.getUserScriptInstallRegistry?.()?.consume(installId) !== null
  })

  ipcMain.handle('userscript:getHostPermissionPrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? options.getUserScriptHostPermissionPrompt?.(owner) ?? null : null
  })

  ipcMain.handle('userscript:respondHostPermission', [promptId(), bool], (event, promptId, allow) => {
    const owner = getShellWindowOwner(event)
    return owner
      ? options.respondUserScriptHostPermission?.(owner, promptId, allow) ?? 'stale'
      : 'stale'
  })

  ipcMain.on('browser:showAppMenu', [raw('isAppMenuAnchor 校验锚点矩形')], (event, anchor) => {
    if (!isAppMenuAnchor(anchor)) return
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    const zoomState = tabManager.getActiveZoomState()
    popupAppMenu({
      window,
      anchor,
      openInternalPage: (page) => { tabManager.openInternalTab(page) },
      zoom: zoomState ? {
        factor: zoomState.factor,
        set: (command) => { tabManager.setZoom(zoomState.tabId, command) },
      } : undefined,
    })
  })

  ipcMain.on('browser:showTabContextMenu', [tabId()], (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.showTabContextMenu(tabId)
  })

  ipcMain.on('browser:showShellContextMenu', [oneOf(['omnibox', 'editor', 'page'] as const)], (event, kind) => {
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    popupShellContextMenu({
      window,
      params: { isEditable: kind !== 'page' },
      canGoBack: tabManager.canGoBack(),
      goBack: () => tabManager.goBack(),
      reload: () => tabManager.reload(),
      pasteAndGo: kind === 'omnibox'
        ? () => {
            const value = readClipboardText()
            if (!value) return
            const resolution = resolveOmniboxInput(value, {
              search: getSearchConfig(),
              allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
            })
            if (resolution.kind === 'internal') tabManager.navigateInternal(resolution.page)
            else if (resolution.kind === 'url' || resolution.kind === 'search') tabManager.navigate(resolveNavigateUrl(resolution.url))
          }
        : undefined,
    })
  })

  ipcMain.on('browser:goBack', (event) => {
    getShellWindowOwner(event)?.tabManager.goBack()
  })

  ipcMain.on('browser:goForward', (event) => {
    getShellWindowOwner(event)?.tabManager.goForward()
  })

  ipcMain.on('browser:reload', (event) => {
    getShellWindowOwner(event)?.tabManager.reload()
  })

  ipcMain.on('browser:goHome', (event) => {
    getShellWindowOwner(event)?.tabManager.openInternalTab({ type: 'home' }, { reuseExisting: true })
  })

  /*
   * 这条原先只有类型标注，没有任何运行时检查：`setLeftOffset` 会把值直接算进
   * `WebContentsView` 的 bounds。上界 2000 覆盖任何合理的侧栏宽度，
   * 用 `int` 而非 `decimal` 是因为 bounds 本来就取整。
   */
  ipcMain.on('browser:setSidebarWidth', [int({ min: 0, max: 2000 })], (event, width) => {
    getShellWindowOwner(event)?.tabManager.setLeftOffset(width)
  })

  ipcMain.handle('browser:getDiagnostics', () => {
    return options.getBrowserDiagnostics?.()?.getSnapshot() ?? { entries: [] }
  })

  ipcMain.on('window:minimize', (event) => {
    getShellWindowOwner(event)?.browserWindow.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = getShellWindowOwner(event)?.browserWindow
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    getShellWindowOwner(event)?.browserWindow.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return getShellWindowOwner(event)?.browserWindow.isMaximized() ?? false
  })
}
