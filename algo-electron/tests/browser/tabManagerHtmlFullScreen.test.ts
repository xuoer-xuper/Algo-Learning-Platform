import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  MockBrowserWindow,
  MockWebContents,
  MockWebContentsView,
  resetElectronMock,
} from '../electron/electronMock'
import { TabManager } from '../../electron/browser/TabManager.ts'

test('html fullscreen expands the active view to the whole window and restores on leave', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1280, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://www.bilibili.com/video/BV1xx411c7mD')

  const view = window.contentView.children[0] as MockWebContentsView
  const contents = view.webContents as MockWebContents
  const before = view.getBounds()

  contents.emit('enter-html-full-screen')
  assert.deepStrictEqual(view.getBounds(), { x: 0, y: 0, width: 1280, height: 800 })

  contents.emit('leave-html-full-screen')
  assert.deepStrictEqual(view.getBounds(), before)
})

test('html fullscreen from a background tab does not take over the layout', () => {
  resetElectronMock()
  const window = new MockBrowserWindow({ width: 1280, height: 800 })
  const manager = new TabManager(window as never)
  manager.createTab('https://www.bilibili.com/video/BV1xx411c7mD')

  const backgroundView = window.contentView.children[0] as MockWebContentsView
  manager.createTab('https://codeforces.com/problemset')
  const activeView = window.contentView.children[0] as MockWebContentsView
  const activeBefore = activeView.getBounds()

  ;(backgroundView.webContents as MockWebContents).emit('enter-html-full-screen')
  assert.deepStrictEqual(
    activeView.getBounds(),
    activeBefore,
    'background tab fullscreen must not resize the active view',
  )

  ;(backgroundView.webContents as MockWebContents).emit('leave-html-full-screen')
  assert.deepStrictEqual(activeView.getBounds(), activeBefore)
})
