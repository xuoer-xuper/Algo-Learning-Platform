import assert from 'node:assert/strict'
import { test } from 'vitest'
import { BROWSER_LAYOUT } from '../../electron/browser/browserLayout.ts'
import { applyBrowserLayoutVariables } from '../../src/browserLayout.ts'

test('browser layout has one derived top offset for main and renderer consumers', () => {
  assert.deepStrictEqual(BROWSER_LAYOUT, {
    toolbarHeight: 42,
    tabBarHeight: 36,
    noticeBarHeight: 38,
    findBarHeight: 38,
    topOffset: 78,
  })
  assert.strictEqual(BROWSER_LAYOUT.topOffset, BROWSER_LAYOUT.toolbarHeight + BROWSER_LAYOUT.tabBarHeight)
})

test('renderer layout injection publishes the shared CSS variables', () => {
  const values = new Map<string, string>()
  applyBrowserLayoutVariables(BROWSER_LAYOUT, {
    setProperty: (name, value) => values.set(name, value),
  })

  assert.deepStrictEqual(Object.fromEntries(values), {
    '--browser-toolbar-height': '42px',
    '--browser-tabbar-height': '36px',
    '--browser-notice-bar-height': '38px',
    '--browser-find-bar-height': '38px',
    '--browser-top-offset': '78px',
  })
})
