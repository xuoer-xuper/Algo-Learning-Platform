import assert from 'node:assert/strict'
import { test } from 'vitest'
import { clipboard } from 'electron'
import { MockBrowserWindow, MockWebContents, resetElectronMock } from '../electron/electronMock'
import {
  createPageContextMenuTemplate,
  createShellContextMenuTemplate,
  createTabContextMenuTemplate,
} from '../../electron/contextMenus/browserContextMenu.ts'

function labels(template: Electron.MenuItemConstructorOptions[]): string[] {
  return template
    .map((item) => typeof item.label === 'string' ? item.label : item.type === 'separator' ? '---' : '')
}

test('page context menu covers links, images, selection and navigation', () => {
  resetElectronMock()
  const contents = new MockWebContents()
  const template = createPageContextMenuTemplate({
    window: new MockBrowserWindow() as never,
    contents: contents as never,
    params: {
      linkURL: 'https://example.com/article',
      srcURL: 'https://example.com/image.png',
      mediaType: 'image',
      hasImageContents: true,
      selectionText: 'binary search',
      isEditable: false,
      x: 24,
      y: 48,
      editFlags: { canCopy: true },
    },
    openUrlInNewTab: () => undefined,
    searchSelectionInNewTab: () => undefined,
  })

  assert.deepStrictEqual(labels(template), [
    '在新标签页打开链接', '复制链接地址',
    '在新标签页打开图片', '复制图片', '复制图片地址', '图片另存为',
    '复制', '使用搜索引擎搜索“binary search”',
    '---', '后退', '前进', '重新加载',
  ])
  template.find((item) => item.label === '复制图片')?.click?.({} as never, {} as never, {} as never)
  template.find((item) => item.label === '图片另存为')?.click?.({} as never, {} as never, {} as never)
  assert.deepStrictEqual(contents.copyImageAtCalls, [{ x: 24, y: 48 }])
  assert.deepStrictEqual(contents.downloadURLCalls, ['https://example.com/image.png'])
})

test('inline images remain copyable while unsafe image and link URLs stay hidden', () => {
  resetElectronMock()
  const contents = new MockWebContents()
  const template = createPageContextMenuTemplate({
    window: new MockBrowserWindow() as never,
    contents: contents as never,
    params: {
      linkURL: 'javascript:alert(1)',
      srcURL: 'data:image/png;base64,AAAA',
      mediaType: 'image',
      hasImageContents: true,
      x: 3,
      y: 7,
    },
    openUrlInNewTab: () => undefined,
    searchSelectionInNewTab: () => undefined,
  })

  assert.deepStrictEqual(labels(template), ['复制图片', '---', '后退', '前进', '重新加载'])
  template[0].click?.({} as never, {} as never, {} as never)
  assert.deepStrictEqual(contents.copyImageAtCalls, [{ x: 3, y: 7 }])
})

test('page context menu groups registered userscript commands in a native submenu', () => {
  const invoked: string[] = []
  const template = createPageContextMenuTemplate({
    window: new MockBrowserWindow() as never,
    contents: new MockWebContents() as never,
    params: {},
    openUrlInNewTab: () => undefined,
    searchSelectionInNewTab: () => undefined,
    userScriptCommands: [{
      scriptName: 'Ratings helper',
      name: 'Refresh rating',
      invoke: () => invoked.push('refresh'),
    }],
  })

  assert.deepStrictEqual(labels(template), ['用户脚本', '---', '后退', '前进', '重新加载'])
  const submenu = template[0].submenu
  assert.ok(Array.isArray(submenu))
  assert.strictEqual(submenu[0].label, 'Ratings helper: Refresh rating')
  submenu[0].click?.({} as never, {} as never, {} as never)
  assert.deepStrictEqual(invoked, ['refresh'])
})

test('shell context menu adds paste-and-go only for the omnibox path', () => {
  const window = new MockBrowserWindow()
  const editor = createShellContextMenuTemplate({
    window: window as never,
    params: { isEditable: true, editFlags: { canPaste: true } },
    canGoBack: false,
    goBack: () => undefined,
    reload: () => undefined,
  })
  const omnibox = createShellContextMenuTemplate({
    window: window as never,
    params: { isEditable: true, editFlags: { canPaste: true } },
    canGoBack: true,
    goBack: () => undefined,
    reload: () => undefined,
    pasteAndGo: () => undefined,
  })

  assert.equal(labels(editor).includes('粘贴并前往'), false)
  assert.equal(labels(omnibox).includes('粘贴并前往'), true)
})

test('tab context menu exposes Chrome tab operations and copies the URL', () => {
  resetElectronMock()
  const actions: string[] = []
  const template = createTabContextMenuTemplate({
    window: new MockBrowserWindow() as never,
    tabId: 'tab-1',
    title: '题目',
    url: 'https://example.com/problem',
    canReload: true,
    canDetach: true,
    canCloseOthers: true,
    canCloseToRight: true,
    canReopenClosed: true,
    reload: () => actions.push('reload'),
    duplicate: () => actions.push('duplicate'),
    detach: () => actions.push('detach'),
    close: () => actions.push('close'),
    closeOthers: () => actions.push('close-others'),
    closeToRight: () => actions.push('close-right'),
    reopenClosed: () => actions.push('reopen'),
    copyUrl: () => { clipboard.writeText('https://example.com/problem') },
  })

  assert.deepStrictEqual(labels(template), [
    '重新加载', '复制标签页', '移到新窗口', '---',
    '关闭标签页', '关闭其他标签页', '关闭右侧标签页', '恢复关闭的标签页', '---', '复制网址',
  ])
  for (const item of template) {
    if (item.label === '复制网址') item.click?.({} as never, {} as never, {} as never)
  }
  assert.equal(clipboard.readText(), 'https://example.com/problem')
})
