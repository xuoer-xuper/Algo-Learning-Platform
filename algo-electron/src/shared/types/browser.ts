import { z } from 'zod'

/*
 * 浏览器容器域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 收口前的权威定义：electron/browser/tabManagerTypes.ts（TabInfo 系）、
 * findInPage.ts、zoomPreferences.ts、downloads/DownloadManager.ts、
 * diagnostics/BrowserDiagnostics.ts。这些模块自本文件起改为 import。
 *
 * TabInfo / InternalPage / FindInPageCommand 是判别联合，按 design §3 用
 * z.discriminatedUnion 定义——判别键（kind/type）在分支间互斥，渲染层的
 * `tab.kind === 'internal'` 窄化照旧成立。
 */

export const internalPageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('home') }),
  z.object({ type: z.literal('settings') }),
  z.object({ type: z.literal('dashboard') }),
  z.object({ type: z.literal('scripts') }),
  z.object({ type: z.literal('coach-metrics') }),
  z.object({ type: z.literal('problem-detail'), problemId: z.string() }),
  z.object({ type: z.literal('notes'), problemId: z.string() }),
  z.object({ type: z.literal('credentials') }),
  z.object({ type: z.literal('script-install'), installId: z.string() }),
])

/** 内置页（非 web 标签）的路由描述；tab:openInternal 的输入。 */
export type InternalPage = z.infer<typeof internalPageSchema>

const tabInfoBaseShape = {
  id: z.string(),
  url: z.string(),
  title: z.string(),
  favicon: z.string().nullable(),
  isLoading: z.boolean(),
  isCrashed: z.boolean(),
  isUnresponsive: z.boolean(),
  isUnresponsiveNoticeDismissed: z.boolean(),
  isActive: z.boolean(),
}

export const webTabInfoSchema = z.object({ ...tabInfoBaseShape, kind: z.literal('web') })

/** web 标签的渲染层视图。 */
export type WebTabInfo = z.infer<typeof webTabInfoSchema>

export const internalTabInfoSchema = z.object({
  ...tabInfoBaseShape,
  kind: z.literal('internal'),
  page: internalPageSchema,
})

/** 内置页标签的渲染层视图。 */
export type InternalTabInfo = z.infer<typeof internalTabInfoSchema>

/** TabInfoBase：两个分支共有的字段（收口前是手写基接口）。 */
export type TabInfoBase = Omit<WebTabInfo, 'kind'>

export const tabInfoSchema = z.discriminatedUnion('kind', [webTabInfoSchema, internalTabInfoSchema])

/** 标签页列表项（tab:getList / tab:listChanged 的负载）。 */
export type TabInfo = z.infer<typeof tabInfoSchema>

export const findInPageCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('query'), query: z.string() }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('previous') }),
  z.object({ type: z.literal('close') }),
])

/** 页内查找命令（browser:findInPage 的输入；main 侧还有 parse 守卫兜底）。 */
export type FindInPageCommand = z.infer<typeof findInPageCommandSchema>

export const findInPageViewStateSchema = z.object({
  open: z.boolean(),
  tabId: z.string().nullable(),
  query: z.string(),
  requestId: z.number().nullable(),
  activeMatchOrdinal: z.number(),
  matches: z.number(),
  finalUpdate: z.boolean(),
})

/** 页内查找状态回推（browser:findInPageResult 的负载）。 */
export type FindInPageViewState = z.infer<typeof findInPageViewStateSchema>

/** 缩放命令三档。 */
export type ZoomCommand = 'in' | 'out' | 'reset'

export const zoomStateSchema = z.object({
  tabId: z.string(),
  factor: z.number(),
})

/** 缩放状态回推（browser:zoomChanged 的负载）。 */
export type ZoomState = z.infer<typeof zoomStateSchema>

export const managedDownloadResultSchema = z.object({
  downloadId: z.string(),
  fileName: z.string(),
  savePath: z.string().nullable(),
  state: z.enum(['completed', 'cancelled', 'interrupted']),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  finishedAt: z.number().int(),
  errorCode: z.enum(['path-setup-failed', 'intercept-failed']).optional(),
})

/** 受管下载的终态回推（download:result 的负载）。 */
export type ManagedDownloadResult = z.infer<typeof managedDownloadResultSchema>

export const browserDiagnosticsSnapshotSchema = z.object({
  entries: z.array(
    z.object({
      area: z.enum(['tracking', 'title', 'userscript']),
      event: z.string(),
      status: z.enum(['success', 'failed', 'skipped']),
      url: z.string().optional(),
      detail: z.string().optional(),
      at: z.number().int(),
    }),
  ),
})

/** 浏览器诊断快照（browser:getDiagnostics 的输出，设置页排障用）。 */
export type BrowserDiagnosticsSnapshot = z.infer<typeof browserDiagnosticsSnapshotSchema>
