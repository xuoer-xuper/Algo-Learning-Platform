import type { WebContentsView } from 'electron'

export interface TabInfo {
  id: string
  url: string
  title: string
  isActive: boolean
}

export interface ManagedTab {
  id: string
  view: WebContentsView
  url: string
  title: string
}
