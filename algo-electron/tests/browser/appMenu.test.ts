import assert from 'node:assert/strict'
import { test } from 'vitest'
import { MockBrowserWindow, menuPopups, resetElectronMock } from 'electron'
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
    { type: 'settings' },
  ])
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
