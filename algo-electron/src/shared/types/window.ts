import { z } from 'zod'

/*
 * 壳窗口域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * UiCommand 是主进程推给渲染层的"键盘/导航意图"事件；AppMenuAnchor 与
 * ShellContextMenuKind 是应用菜单/右键菜单的输入。BrowserLayoutConfig 的
 * 运行时值（BROWSER_LAYOUT 常量）留在 electron/browser/browserLayout.ts，
 * 这里只收类型。
 */

export const uiCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('focus-address-bar') }),
  z.object({ type: z.literal('focus-find-in-page') }),
  z.object({
    type: z.literal('navigation-blocked'),
    reason: z.enum(['invalid-url', 'insecure-http', 'unsupported-protocol']),
  }),
  z.object({ type: z.literal('tab-limit-reached'), limit: z.number() }),
])

/** 主进程 → 渲染层的 UI 意图命令（ui:command 的负载）。 */
export type UiCommand = z.infer<typeof uiCommandSchema>

export const appMenuAnchorSchema = z.object({
  x: z.number(),
  y: z.number(),
})

/** 应用菜单弹出锚点（browser:showAppMenu 的输入；main 侧另有范围守卫）。 */
export type AppMenuAnchor = z.infer<typeof appMenuAnchorSchema>

/** 壳右键菜单的种类（browser:showShellContextMenu 的输入）。 */
export type ShellContextMenuKind = 'omnibox' | 'editor' | 'page'

export const browserLayoutConfigSchema = z.object({
  toolbarHeight: z.number(),
  tabBarHeight: z.number(),
  noticeBarHeight: z.number(),
  findBarHeight: z.number(),
  topOffset: z.number(),
})

/** 浏览器壳各条高度（preload 以 BROWSER_LAYOUT 常量整体暴露，只读）。 */
export type BrowserLayoutConfig = z.infer<typeof browserLayoutConfigSchema>
