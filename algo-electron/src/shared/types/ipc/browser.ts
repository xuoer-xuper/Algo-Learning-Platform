import { z } from 'zod'

/*
 * 浏览器壳层各 channel 的输入 schema。消费方：electron/ipc/registerBrowserShellIpc.ts。
 *
 * 复用的界，数字全部沿用原先手写检查里的值：
 *
 * - `tabId` 200：原 `tabId.length === 0 || tabId.length > 200`（标识符 200 的既有口径）。
 * - `promptId` 256：原 `promptId.length > 256`。
 * - `tabIndex`：原检查只有 `Number.isInteger`，没有上下界。这里给 0..999——
 *   标签是同一个窗口里的，`reorderTab` 与 `finishTabDrag` 都会把越界值夹回合法区间，
 *   给个量级上限只是避免把 `Number.MAX_SAFE_INTEGER` 一路带进去。负数本来就不合法。
 * - `screenCoord`：原检查是 `typeof === 'number' && Number.isFinite`。
 *   `z.number().min().max()` 恰好就是这两条（屏幕坐标不是整数——DPI 缩放下会有小数），
 *   界给 ±100000，远超任何多屏布局的实际范围。NaN 与 ±Infinity 由 zod 的数字基检与
 *   上下界一并挡掉。
 *
 * 四处无形状参数（`tab:openInternal`、`browser:findInPage` 的命令对象、`browser:setZoom`、
 * `browser:showAppMenu` 的锚点矩形）的判别联合校验分别在 `isInternalPage`、
 * `TabManager.findInPage`、`isZoomCommand`、`isAppMenuAnchor` 里——那是"在别处校验了"，
 * 由架构守卫的棘轮按文件封顶（RAW_IPC_SCHEMA_BUDGET），不要往这个文件里加新的。
 */
const tabId = z.string().min(1).max(200)
const promptId = z.string().min(1).max(256)
const tabIndex = z.number().int().min(0).max(999)
const screenCoord = z.number().min(-100_000).max(100_000)

/*
 * URL 的自由文本：`tab:create` 无参是"开新标签页到首页"的正常路径，空串走同一条兜底
 * 分支；`browser:navigate` 在地址栏清空后按回车也发空串，`resolveOmniboxInput` 自己判成
 * `empty-input` 并静默返回。4096 是项目里 URL 的既有口径（`MAX_TAB_URL_LENGTH`）。
 * 收成 `min(1)` 会把这些正常路径变成载荷拒绝。
 */
const freeUrl = z.string().max(4096)

export const tabCreateInput = [freeUrl.optional()] as const
export const tabCloseInput = [tabId] as const
export const tabSwitchInput = [tabId] as const
export const tabReorderInput = [tabId, tabIndex] as const
export const tabMoveToNewWindowInput = [tabId] as const
export const tabFinishDragInput = [tabId, tabIndex, screenCoord, screenCoord] as const
export const tabReloadInput = [tabId] as const
export const tabDismissUnresponsiveInput = [tabId] as const
export const tabOpenInternalInput = [z.unknown()] as const
export const navigateInput = [freeUrl] as const
export const omniboxSuggestInput = [z.string().max(256)] as const
export const setOmniboxOpenInput = [z.boolean()] as const
export const findInPageInput = [tabId, z.unknown()] as const
export const setZoomInput = [tabId, z.unknown()] as const
export const setDownloadNoticeVisibleInput = [z.boolean()] as const
export const setErrorNoticeVisibleInput = [z.boolean()] as const
export const getUserScriptInstallInput = [tabId] as const
export const cancelUserScriptInstallInput = [tabId] as const
export const respondHostPermissionInput = [promptId, z.boolean()] as const
export const showAppMenuInput = [z.unknown()] as const
export const showTabContextMenuInput = [tabId] as const
export const showShellContextMenuInput = [z.enum(['omnibox', 'editor', 'page'])] as const
export const setSidebarWidthInput = [z.number().int().min(0).max(2000)] as const
