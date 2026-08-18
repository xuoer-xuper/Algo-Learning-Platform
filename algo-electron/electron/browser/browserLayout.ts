const toolbarHeight = 42
const tabBarHeight = 36
const noticeBarHeight = 38
const findBarHeight = 38

export const BROWSER_LAYOUT = Object.freeze({
  toolbarHeight,
  tabBarHeight,
  noticeBarHeight,
  findBarHeight,
  topOffset: toolbarHeight + tabBarHeight,
})

export type BrowserLayout = typeof BROWSER_LAYOUT
