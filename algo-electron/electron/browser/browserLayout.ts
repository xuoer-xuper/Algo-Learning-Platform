const toolbarHeight = 42
const tabBarHeight = 36

export const BROWSER_LAYOUT = Object.freeze({
  toolbarHeight,
  tabBarHeight,
  topOffset: toolbarHeight + tabBarHeight,
})

export type BrowserLayout = typeof BROWSER_LAYOUT
