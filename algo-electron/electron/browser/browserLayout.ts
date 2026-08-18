const toolbarHeight = 42
const tabBarHeight = 36
const noticeBarHeight = 38

export const BROWSER_LAYOUT = Object.freeze({
  toolbarHeight,
  tabBarHeight,
  noticeBarHeight,
  topOffset: toolbarHeight + tabBarHeight,
})

export type BrowserLayout = typeof BROWSER_LAYOUT
