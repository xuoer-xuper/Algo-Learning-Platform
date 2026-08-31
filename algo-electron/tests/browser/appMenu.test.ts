import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, menuPopups, resetElectronMock } from '../electron/electronMock'
import {
  createAppMenuTemplate,
  isAppMenuAnchor,
  popupAppMenu,
} from '../../electron/contextMenus/appMenu.ts'
import type { InternalPage } from '../../electron/browser/tabManagerTypes.ts'

test('app menu anchor accepts only bounded exact integer coordinates', () => {
  assert.strictEqual(isAppMenuAnchor({ x: 10, y: 20 }), true)
  assert.strictEqual(isAppMenuAnchor({ x: 10, y: 20, extra: true }), false)
  assert.strictEqual(isAppMenuAnchor({ x: -1, y: 20 }), false)
  assert.strictEqual(isAppMenuAnchor({ x: 1.5, y: 20 }), false)
  assert.strictEqual(isAppMenuAnchor({ x: 10, y: Number.NaN }), false)
  assert.strictEqual(isAppMenuAnchor(null), false)
})

test('app menu routes existing toolbar destinations through internal tabs', () => {
  const pages: InternalPage[] = []
  const template = createAppMenuTemplate((page) => pages.push(page))

  for (const item of template) {
    if (typeof item.click === 'function') item.click({} as never, {} as never, {} as never)
  }

  assert.deepStrictEqual(pages, [
    { type: 'dashboard' },
    { type: 'coach-metrics' },
    { type: 'scripts' },
    { type: 'credentials' },
    { type: 'settings' },
  ])
})

test('app menu exposes Chrome-style zoom commands for an active web tab', () => {
  const commands: string[] = []
  const template = createAppMenuTemplate(() => undefined, {
    factor: 1.25,
    set: (command) => commands.push(command),
  })
  const zoomItem = template[0]
  assert.strictEqual(zoomItem.label, '缩放 (125%)')
  const submenu = zoomItem.submenu as Electron.MenuItemConstructorOptions[]
  for (const item of submenu) {
    if (typeof item.click === 'function') item.click({} as never, {} as never, {} as never)
  }
  assert.deepStrictEqual(commands, ['in', 'out', 'reset'])
})

test('app menu opens at the renderer-provided toolbar anchor', () => {
  resetElectronMock()
  const window = new MockBrowserWindow()

  popupAppMenu({
    window: window as never,
    anchor: { x: 640, y: 78 },
    openInternalPage: () => undefined,
  })

  assert.strictEqual(menuPopups.length, 1)
  assert.deepStrictEqual(menuPopups[0].options, {
    window,
    x: 640,
    y: 78,
  })
})
