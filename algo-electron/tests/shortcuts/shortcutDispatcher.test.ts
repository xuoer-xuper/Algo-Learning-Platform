import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  dispatchShortcut,
  resolveShortcut,
  type ShortcutActions,
  type ShortcutCommand,
  type ShortcutInput,
} from '../../electron/shortcuts/shortcutDispatcher.ts'

function input(overrides: Partial<ShortcutInput>): ShortcutInput {
  return {
    type: 'keyDown',
    key: '',
    control: false,
    alt: false,
    meta: false,
    shift: false,
    ...overrides,
  }
}

test('resolves shell and OJ browser shortcuts consistently', () => {
  const cases: Array<[Partial<ShortcutInput>, ShortcutCommand]> = [
    [{ control: true, key: 't', code: 'KeyT' }, { type: 'new-tab' }],
    [{ control: true, key: 'w', code: 'KeyW' }, { type: 'close-tab' }],
    [{ control: true, key: 'Tab' }, { type: 'next-tab' }],
    [{ control: true, shift: true, key: 'Tab' }, { type: 'previous-tab' }],
    [{ control: true, key: 'l', code: 'KeyL' }, { type: 'focus-address-bar' }],
    [{ control: true, key: 'r', code: 'KeyR' }, { type: 'reload' }],
    [{ key: 'F5' }, { type: 'reload' }],
    [{ control: true, key: '+' }, { type: 'zoom-in' }],
    [{ control: true, key: '-' }, { type: 'zoom-out' }],
    [{ control: true, key: '0' }, { type: 'reset-zoom' }],
    [{ alt: true, key: 'ArrowLeft' }, { type: 'back' }],
    [{ alt: true, key: 'ArrowRight' }, { type: 'forward' }],
    [{ control: true, key: '3', code: 'Digit3' }, { type: 'switch-tab', index: 2 }],
    [{ control: true, shift: true, key: 'i', code: 'KeyI' }, { type: 'toggle-devtools' }],
    [{ key: 'F12' }, { type: 'toggle-devtools' }],
  ]

  for (const [overrides, expected] of cases) {
    assert.deepStrictEqual(resolveShortcut(input(overrides)), expected)
  }
})

test('ignores keyup, unmodified text input, and unsupported tab indexes', () => {
  assert.strictEqual(resolveShortcut(input({ type: 'keyUp', control: true, key: 't' })), null)
  assert.strictEqual(resolveShortcut(input({ key: 't' })), null)
  assert.strictEqual(resolveShortcut(input({ control: true, key: '9', code: 'Digit9' })), null)
})

test('dispatches commands through injected actions', () => {
  const calls: string[] = []
  const actions: ShortcutActions = {
    newTab: () => calls.push('new'),
    closeTab: () => calls.push('close'),
    nextTab: () => calls.push('next'),
    previousTab: () => calls.push('previous'),
    switchTab: (index) => calls.push(`switch:${index}`),
    focusAddressBar: () => calls.push('focus'),
    reload: () => calls.push('reload'),
    zoomIn: () => calls.push('zoom-in'),
    zoomOut: () => calls.push('zoom-out'),
    resetZoom: () => calls.push('zoom-reset'),
    back: () => calls.push('back'),
    forward: () => calls.push('forward'),
    toggleDevTools: () => calls.push('devtools'),
  }

  dispatchShortcut({ type: 'switch-tab', index: 4 }, actions)
  dispatchShortcut({ type: 'focus-address-bar' }, actions)
  dispatchShortcut({ type: 'zoom-out' }, actions)

  assert.deepStrictEqual(calls, ['switch:4', 'focus', 'zoom-out'])
})
