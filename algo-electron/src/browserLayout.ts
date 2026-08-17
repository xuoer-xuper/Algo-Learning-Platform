export interface BrowserLayoutVariableTarget {
  setProperty(name: string, value: string): void
}

export function applyBrowserLayoutVariables(
  layout: BrowserLayoutConfig,
  target: BrowserLayoutVariableTarget,
): void {
  target.setProperty('--browser-toolbar-height', `${layout.toolbarHeight}px`)
  target.setProperty('--browser-tabbar-height', `${layout.tabBarHeight}px`)
  target.setProperty('--browser-top-offset', `${layout.topOffset}px`)
}
