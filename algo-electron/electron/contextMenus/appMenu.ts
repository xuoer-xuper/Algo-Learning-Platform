import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { InternalPage } from '../browser/tabManagerTypes'

export interface AppMenuAnchor {
  x: number
  y: number
}

export interface PopupAppMenuOptions {
  window: BrowserWindow
  anchor: AppMenuAnchor
  openInternalPage: (page: InternalPage) => void
}

const MAX_ANCHOR_COORDINATE = 100_000

export function isAppMenuAnchor(value: unknown): value is AppMenuAnchor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).length !== 2) return false
  return (
    Number.isInteger(candidate.x)
    && Number.isInteger(candidate.y)
    && (candidate.x as number) >= 0
    && (candidate.y as number) >= 0
    && (candidate.x as number) <= MAX_ANCHOR_COORDINATE
    && (candidate.y as number) <= MAX_ANCHOR_COORDINATE
  )
}

export function createAppMenuTemplate(
  openInternalPage: (page: InternalPage) => void,
): MenuItemConstructorOptions[] {
  return [
    { label: '学习统计', click: () => openInternalPage({ type: 'dashboard' }) },
    { label: 'Coach 指标', click: () => openInternalPage({ type: 'coach-metrics' }) },
    { label: '脚本管理', click: () => openInternalPage({ type: 'scripts' }) },
    { type: 'separator' },
    { label: '设置', click: () => openInternalPage({ type: 'settings' }) },
  ]
}

export function popupAppMenu(options: PopupAppMenuOptions): void {
  const menu = Menu.buildFromTemplate(createAppMenuTemplate(options.openInternalPage))
  menu.popup({
    window: options.window,
    x: options.anchor.x,
    y: options.anchor.y,
  })
}
