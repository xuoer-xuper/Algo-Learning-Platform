import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { InternalPage } from '../browser/tabManagerTypes'
import type { ZoomCommand } from '../browser/zoomPreferences'

export interface AppMenuAnchor {
  x: number
  y: number
}

export interface PopupAppMenuOptions {
  window: BrowserWindow
  anchor: AppMenuAnchor
  openInternalPage: (page: InternalPage) => void
  zoom?: {
    factor: number
    set: (command: ZoomCommand) => void
  }
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
  zoom?: PopupAppMenuOptions['zoom'],
): MenuItemConstructorOptions[] {
  return [
    ...(zoom ? [{
      label: `缩放 (${Math.round(zoom.factor * 100)}%)`,
      submenu: [
        { label: '放大', click: () => zoom.set('in') },
        { label: '缩小', click: () => zoom.set('out') },
        { label: '恢复 100%', click: () => zoom.set('reset') },
      ],
    }, { type: 'separator' as const }] : []),
    { label: '学习统计', click: () => openInternalPage({ type: 'dashboard' }) },
    { label: 'Coach 指标', click: () => openInternalPage({ type: 'coach-metrics' }) },
    { label: '脚本管理', click: () => openInternalPage({ type: 'scripts' }) },
    { label: '账户', click: () => openInternalPage({ type: 'credentials' }) },
    { type: 'separator' },
    { label: '设置', click: () => openInternalPage({ type: 'settings' }) },
  ]
}

export function popupAppMenu(options: PopupAppMenuOptions): void {
  const menu = Menu.buildFromTemplate(createAppMenuTemplate(options.openInternalPage, options.zoom))
  menu.popup({
    window: options.window,
    x: options.anchor.x,
    y: options.anchor.y,
  })
}
