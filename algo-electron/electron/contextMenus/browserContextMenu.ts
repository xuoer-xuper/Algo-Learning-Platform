import { clipboard, Menu, type BrowserWindow, type MenuItemConstructorOptions, type WebContents } from 'electron'

const MAX_CONTEXT_TEXT_LENGTH = 4_096
const MAX_CONTEXT_URL_LENGTH = 8_192

export interface ContextMenuParamsLike {
  linkURL?: string
  srcURL?: string
  mediaType?: string
  hasImageContents?: boolean
  selectionText?: string
  isEditable?: boolean
  inputFieldType?: string
  x?: number
  y?: number
  editFlags?: {
    canUndo?: boolean
    canRedo?: boolean
    canCut?: boolean
    canCopy?: boolean
    canPaste?: boolean
    canSelectAll?: boolean
  }
}

export interface PageContextMenuActions {
  window: BrowserWindow
  contents: WebContents
  params: ContextMenuParamsLike
  openUrlInNewTab: (url: string) => void
  searchSelectionInNewTab: (query: string) => void
}

export interface ShellContextMenuActions {
  window: BrowserWindow
  params: ContextMenuParamsLike
  canGoBack: boolean
  goBack: () => void
  reload: () => void
  pasteAndGo?: () => void
}

export interface TabContextMenuActions {
  window: BrowserWindow
  tabId: string
  title: string
  url: string
  canReload: boolean
  canDetach: boolean
  canCloseOthers: boolean
  canCloseToRight: boolean
  canReopenClosed: boolean
  reload: () => void
  duplicate: () => void
  detach: () => void
  close: () => void
  closeOthers: () => void
  closeToRight: () => void
  reopenClosed: () => void
  copyUrl: () => void
}

function safeText(value: unknown, maxLength = MAX_CONTEXT_TEXT_LENGTH): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return ''
  return trimmed
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_CONTEXT_URL_LENGTH) return ''
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function editFlags(params: ContextMenuParamsLike) {
  return params.editFlags ?? {}
}

function createEditItems(
  contents: WebContents,
  params: ContextMenuParamsLike,
  pasteAndGo?: () => void,
): MenuItemConstructorOptions[] {
  const flags = editFlags(params)
  const items: MenuItemConstructorOptions[] = [
    { label: '撤销', enabled: flags.canUndo === true, click: () => contents.undo() },
    { label: '重做', enabled: flags.canRedo === true, click: () => contents.redo() },
    { type: 'separator' },
    { label: '剪切', enabled: flags.canCut === true, click: () => contents.cut() },
    { label: '复制', enabled: flags.canCopy === true, click: () => contents.copy() },
    { label: '粘贴', enabled: flags.canPaste === true, click: () => contents.paste() },
    ...(pasteAndGo
      ? [{ label: '粘贴并前往', enabled: flags.canPaste === true, click: pasteAndGo }]
      : []),
    { label: '全选', enabled: flags.canSelectAll === true, click: () => contents.selectAll() },
  ]
  return items
}

export function createPageContextMenuTemplate(options: PageContextMenuActions): MenuItemConstructorOptions[] {
  const linkUrl = safeHttpUrl(options.params.linkURL)
  const imageUrl = safeHttpUrl(options.params.srcURL)
  const selection = safeText(options.params.selectionText)
  const canCopyImage = options.params.mediaType === 'image' || options.params.hasImageContents === true
  const isEditable = options.params.isEditable === true
  const items: MenuItemConstructorOptions[] = []

  if (linkUrl) {
    items.push(
      { label: '在新标签页打开链接', click: () => options.openUrlInNewTab(linkUrl) },
      { label: '复制链接地址', click: () => clipboard.writeText(linkUrl) },
    )
  }

  if (canCopyImage) {
    if (imageUrl) {
      items.push({ label: '在新标签页打开图片', click: () => options.openUrlInNewTab(imageUrl) })
    }
    items.push({
      label: '复制图片',
      click: () => {
        const x = Number.isFinite(options.params.x) ? Number(options.params.x) : 0
        const y = Number.isFinite(options.params.y) ? Number(options.params.y) : 0
        options.contents.copyImageAt(x, y)
      },
    })
    if (imageUrl) {
      items.push(
        { label: '复制图片地址', click: () => clipboard.writeText(imageUrl) },
        { label: '图片另存为', click: () => options.contents.downloadURL(imageUrl) },
      )
    }
  }

  if (selection && !isEditable) {
    items.push({ label: '复制', click: () => clipboard.writeText(selection) })
  }
  if (selection) {
    items.push({ label: `使用搜索引擎搜索“${selection.slice(0, 80)}${selection.length > 80 ? '…' : ''}”`, click: () => options.searchSelectionInNewTab(selection) })
  }

  if (isEditable) {
    items.push(...createEditItems(options.contents, options.params))
  }

  if (items.length > 0) items.push({ type: 'separator' })
  items.push(
    { label: '后退', enabled: options.contents.navigationHistory.canGoBack(), click: () => options.contents.navigationHistory.goBack() },
    { label: '前进', enabled: options.contents.navigationHistory.canGoForward(), click: () => options.contents.navigationHistory.goForward() },
    { label: '重新加载', click: () => options.contents.reload() },
  )
  return items
}

export function popupPageContextMenu(options: PageContextMenuActions): void {
  const template = createPageContextMenuTemplate(options)
  const menu = Menu.buildFromTemplate(template)
  menu.popup({ window: options.window })
}

export function createShellContextMenuTemplate(options: ShellContextMenuActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (options.params.isEditable === true) {
    items.push(
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      ...(options.pasteAndGo ? [{ label: '粘贴并前往', click: options.pasteAndGo }] : []),
      { label: '全选', role: 'selectAll' },
    )
    items.push({ type: 'separator' })
  }
  items.push(
    { label: '后退', enabled: options.canGoBack, click: options.goBack },
    { label: '重新加载', click: options.reload },
  )
  return items
}

export function popupShellContextMenu(options: ShellContextMenuActions): void {
  const menu = Menu.buildFromTemplate(createShellContextMenuTemplate(options))
  menu.popup({ window: options.window })
}

export function createTabContextMenuTemplate(options: TabContextMenuActions): MenuItemConstructorOptions[] {
  return [
    { label: '重新加载', enabled: options.canReload, click: options.reload },
    { label: '复制标签页', click: options.duplicate },
    { label: '移到新窗口', enabled: options.canDetach, click: options.detach },
    { type: 'separator' },
    { label: '关闭标签页', click: options.close },
    { label: '关闭其他标签页', enabled: options.canCloseOthers, click: options.closeOthers },
    { label: '关闭右侧标签页', enabled: options.canCloseToRight, click: options.closeToRight },
    { label: '恢复关闭的标签页', enabled: options.canReopenClosed, click: options.reopenClosed },
    { type: 'separator' },
    { label: '复制网址', enabled: Boolean(options.url), click: options.copyUrl },
  ]
}

export function popupTabContextMenu(options: TabContextMenuActions): void {
  const menu = Menu.buildFromTemplate(createTabContextMenuTemplate(options))
  menu.popup({ window: options.window })
}

export function readClipboardText(): string {
  return safeText(clipboard.readText(), MAX_CONTEXT_URL_LENGTH)
}
