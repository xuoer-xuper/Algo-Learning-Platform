import { getShellWindowOwner, ipcMain } from './trustedSender'
import {
  cancelUserScriptInstallInput,
  findInPageInput,
  getUserScriptInstallInput,
  navigateInput,
  omniboxSuggestInput,
  respondHostPermissionInput,
  setSidebarWidthInput,
  showAppMenuInput,
  showShellContextMenuInput,
  showTabContextMenuInput,
  setDownloadNoticeVisibleInput,
  setErrorNoticeVisibleInput,
  setOmniboxOpenInput,
  setZoomInput,
  tabCloseInput,
  tabCreateInput,
  tabDismissUnresponsiveInput,
  tabFinishDragInput,
  tabMoveToNewWindowInput,
  tabOpenInternalInput,
  tabReloadInput,
  tabReorderInput,
  tabSwitchInput,
} from '../../src/shared/types/ipc/browser'
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
  /** 手动恢复上次会话；缺席时三点菜单不显示该项。 */
  reopenLastSession?: () => void
}

function toNavigationBlockReason(
  reason: OmniboxBlockReason,
): 'invalid-url' | 'insecure-http' | 'unsupported-protocol' | null {
  if (reason === 'empty-input') return null
  if (reason === 'insecure-http' || reason === 'unsupported-protocol') return reason
  return 'invalid-url'
}

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/browser.ts`；
 * tabId 200 / promptId 256 / tabIndex 0..999 / screenCoord ±100000 这些界的来历
 * 与四处"在别处校验"的判别参数说明都写在那里。
 */
export function registerBrowserShellIpc(options: RegisterBrowserShellIpcOptions): void {
  ipcMain.handle('tab:create', tabCreateInput, (event, url) => {
    return getShellWindowOwner(event)?.tabManager.createTab(url) ?? null
  })

  ipcMain.on('tab:close', tabCloseInput, (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.closeTab(tabId)
  })

  ipcMain.handle('tab:reopenClosed', (event) => {
    return getShellWindowOwner(event)?.tabManager.reopenClosedTab() ?? ''
  })

  ipcMain.on('tab:switch', tabSwitchInput, (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.switchTab(tabId)
  })

  /*
   * 这两条原先各带一个 `targetIndex as number`：`Number.isInteger(x)` 不是类型守卫，
   * 判完 TS 仍然认为它是 `unknown`，所以只能强转。schema 之后类型是真的收窄了，
   * 两处 `as` 一起删掉。
   */
  ipcMain.handle('tab:reorder', tabReorderInput, (event, tabId, targetIndex) => {
    return getShellWindowOwner(event)?.tabManager.reorderTab(tabId, targetIndex) ?? false
  })

  ipcMain.handle('tab:moveToNewWindow', tabMoveToNewWindowInput, (event, tabId) => {
    const owner = getShellWindowOwner(event)
    return owner ? (options.moveTabToNewWindow?.(owner, tabId) ?? false) : false
  })

  ipcMain.handle(
    'tab:finishDrag',
    tabFinishDragInput,
    (event, tabId, targetIndex, screenX, screenY) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? (options.finishTabDrag?.(owner, tabId, targetIndex, screenX, screenY) ?? false)
        : false
    },
  )

  ipcMain.on('tab:reload', tabReloadInput, (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.reloadTab(tabId)
  })

  ipcMain.on('tab:dismissUnresponsive', tabDismissUnresponsiveInput, (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.dismissUnresponsive(tabId)
  })

  /*
   * 内部页 payload 是判别联合，形状由 `isInternalPage` 判——它要按 `type` 分支决定
   * 哪些字段必须在场，schema 层表达不了。这里是四个棘轮封顶的"在别处校验"之一，
   * 元组元素是显式放行的 unknown。
   */
  ipcMain.handle('tab:openInternal', tabOpenInternalInput, (event, page) => {
    if (!isInternalPage(page)) return ''
    return getShellWindowOwner(event)?.tabManager.openInternalTab(page) ?? ''
  })

  ipcMain.handle('tab:getList', (event) => {
    return getShellWindowOwner(event)?.tabManager.getTabList() ?? []
  })

  /*
   * 允许空串：地址栏清空后按回车会发空串，`resolveOmniboxInput` 自己判成
   * `empty-input` 并静默返回（`toNavigationBlockReason` 对它返回 null）。
   * 收成 `min(1)` 会把这条正常路径变成一次载荷拒绝日志。
   */
  ipcMain.on('browser:navigate', navigateInput, (event, input) => {
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
  ipcMain.handle('browser:omniboxSuggest', omniboxSuggestInput, (_event, query) => {
    return getOmniboxSuggestions(query)
  })

  ipcMain.on('browser:setOmniboxOpen', setOmniboxOpenInput, (event, open) => {
    getShellWindowOwner(event)?.tabManager.setOmniboxOpen(open)
  })

  /*
   * `command` 两条都交给下游：`findInPage` 的命令对象由 `TabManager.findInPage` 自己判
   * （见 tabManagerFindZoom 的用例），`setZoom` 的由 `isZoomCommand` 判。
   * 前者原先连 `unknown` 都没判就传下去了，显式放行至少把这件事写在了通道上。
   */
  ipcMain.handle('browser:findInPage', findInPageInput, (event, tabId, command) => {
    return getShellWindowOwner(event)?.tabManager.findInPage(tabId, command) ?? null
  })

  ipcMain.handle('browser:setZoom', setZoomInput, (event, tabId, command) => {
    if (!isZoomCommand(command)) return null
    return getShellWindowOwner(event)?.tabManager.setZoom(tabId, command) ?? null
  })

  ipcMain.on(
    'browser:setDownloadNoticeVisible',
    setDownloadNoticeVisibleInput,
    (event, visible) => {
      getShellWindowOwner(event)?.tabManager.setDownloadNoticeVisible(visible)
    },
  )

  ipcMain.on('browser:setErrorNoticeVisible', setErrorNoticeVisibleInput, (event, visible) => {
    getShellWindowOwner(event)?.tabManager.setErrorNoticeVisible(visible)
  })

  ipcMain.handle('browser:getUserScriptInstall', getUserScriptInstallInput, (_event, installId) => {
    return options.getUserScriptInstallRegistry?.()?.get(installId) ?? null
  })

  ipcMain.handle(
    'browser:cancelUserScriptInstall',
    cancelUserScriptInstallInput,
    (_event, installId) => {
      return options.getUserScriptInstallRegistry?.()?.consume(installId) !== null
    },
  )

  ipcMain.handle('userscript:getHostPermissionPrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? (options.getUserScriptHostPermissionPrompt?.(owner) ?? null) : null
  })

  ipcMain.handle(
    'userscript:respondHostPermission',
    respondHostPermissionInput,
    (event, promptId, allow) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? (options.respondUserScriptHostPermission?.(owner, promptId, allow) ?? 'stale')
        : 'stale'
    },
  )

  ipcMain.on('browser:showAppMenu', showAppMenuInput, (event, anchor) => {
    if (!isAppMenuAnchor(anchor)) return
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    const zoomState = tabManager.getActiveZoomState()
    popupAppMenu({
      window,
      anchor,
      openInternalPage: (page) => {
        tabManager.openInternalTab(page)
      },
      reopenLastSession: options.reopenLastSession,
      zoom: zoomState
        ? {
            factor: zoomState.factor,
            set: (command) => {
              tabManager.setZoom(zoomState.tabId, command)
            },
          }
        : undefined,
    })
  })

  ipcMain.on('browser:showTabContextMenu', showTabContextMenuInput, (event, tabId) => {
    getShellWindowOwner(event)?.tabManager.showTabContextMenu(tabId)
  })

  ipcMain.on('browser:showShellContextMenu', showShellContextMenuInput, (event, kind) => {
    const owner = getShellWindowOwner(event)
    if (!owner || owner.isDestroyed()) return
    const { browserWindow: window, tabManager } = owner
    popupShellContextMenu({
      window,
      params: { isEditable: kind !== 'page' },
      canGoBack: tabManager.canGoBack(),
      goBack: () => tabManager.goBack(),
      reload: () => tabManager.reload(),
      pasteAndGo:
        kind === 'omnibox'
          ? () => {
              const value = readClipboardText()
              if (!value) return
              const resolution = resolveOmniboxInput(value, {
                search: getSearchConfig(),
                allowInsecureLocalhost: options.allowInsecureLocalhost ?? false,
              })
              if (resolution.kind === 'internal') tabManager.navigateInternal(resolution.page)
              else if (resolution.kind === 'url' || resolution.kind === 'search')
                tabManager.navigate(resolveNavigateUrl(resolution.url))
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
    getShellWindowOwner(event)?.tabManager.goHome()
  })

  /*
   * 这条原先只有类型标注，没有任何运行时检查：`setLeftOffset` 会把值直接算进
   * `WebContentsView` 的 bounds。上界 2000 覆盖任何合理的侧栏宽度，整数即可
   * （bounds 本来就取整）。
   */
  ipcMain.on('browser:setSidebarWidth', setSidebarWidthInput, (event, width) => {
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
