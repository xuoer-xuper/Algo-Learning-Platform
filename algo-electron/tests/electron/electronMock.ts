import { EventEmitter } from 'node:events'

type Listener = (...args: any[]) => void

export class MockWebContents extends EventEmitter {
  private url = ''
  private title = ''
  private destroyed = false
  private loading = false
  private devToolsOpen = false
  readonly navigationHistory = {
    canGoBack: () => false,
    canGoForward: () => false,
    goBack: () => undefined,
    goForward: () => undefined,
  }
  readonly mainFrame = { framesInSubtree: [] as MockWebFrame[] }

  getURL(): string { return this.url }
  getTitle(): string { return this.title }
  isDestroyed(): boolean { return this.destroyed }
  isLoadingMainFrame(): boolean { return this.loading }
  isDevToolsOpened(): boolean { return this.devToolsOpen }
  openDevTools(): void { this.devToolsOpen = true }
  closeDevTools(): void { this.devToolsOpen = false }
  setTitle(title: string): void { this.title = title; this.emit('page-title-updated', {}, title) }
  setWindowOpenHandler(_handler: (details: { url: string }) => unknown): void { /* observed by integration tests when needed */ }
  loadURL(url: string): Promise<void> {
    this.url = url
    this.loading = false
    queueMicrotask(() => {
      this.emit('did-navigate', {}, url)
      this.emit('did-finish-load')
    })
    return Promise.resolve()
  }
  reload(): void { this.emit('did-finish-load') }
  canGoBack(): boolean { return this.navigationHistory.canGoBack() }
  canGoForward(): boolean { return this.navigationHistory.canGoForward() }
  executeJavaScript(_code: string): Promise<unknown> { return Promise.resolve(undefined) }
  capturePage(): Promise<{ resize: (options: unknown) => { toDataURL: () => string }; toDataURL: () => string }> {
    const image = { toDataURL: () => 'data:image/png;base64,mock' }
    return Promise.resolve({ ...image, resize: () => image })
  }
  close(): void { this.destroyed = true; this.emit('destroyed') }
}

export class MockWebFrame {
  isDestroyed(): boolean { return false }
  executeJavaScript(_code: string): Promise<unknown> { return Promise.resolve(undefined) }
}

export class MockWebContentsView {
  readonly webContents = new MockWebContents()
  private bounds = { x: 0, y: 0, width: 0, height: 0 }
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void { this.bounds = { ...bounds } }
  getBounds(): { x: number; y: number; width: number; height: number } { return { ...this.bounds } }
}

export class MockBrowserWindow extends EventEmitter {
  static windows: MockBrowserWindow[] = []
  readonly contentView = {
    children: [] as MockWebContentsView[],
    addChildView: (view: MockWebContentsView) => {
      if (!this.contentView.children.includes(view)) this.contentView.children.push(view)
    },
    removeChildView: (view: MockWebContentsView) => {
      this.contentView.children = this.contentView.children.filter((child) => child !== view)
    },
  }
  readonly webContents = new MockWebContents()
  private destroyed = false
  private visible = false
  private maximized = false
  private size: [number, number] = [1280, 800]

  constructor(options: { width?: number; height?: number } = {}) {
    super()
    this.size = [options.width ?? 1280, options.height ?? 800]
    MockBrowserWindow.windows.push(this)
  }

  static getAllWindows(): MockBrowserWindow[] { return [...MockBrowserWindow.windows.filter((window) => !window.isDestroyed())] }
  getContentSize(): [number, number] { return [...this.size] as [number, number] }
  setContentSize(width: number, height: number): void { this.size = [width, height]; this.emit('resize') }
  isDestroyed(): boolean { return this.destroyed }
  isVisible(): boolean { return this.visible }
  show(): void { this.visible = true; this.emit('show') }
  showInactive(): void { this.show() }
  hide(): void { this.visible = false }
  isMaximized(): boolean { return this.maximized }
  maximize(): void { this.maximized = true; this.emit('maximize') }
  unmaximize(): void { this.maximized = false; this.emit('unmaximize') }
  setTitle(_title: string): void { /* no-op */ }
  close(): void {
    if (this.destroyed) return
    this.destroyed = true
    MockBrowserWindow.windows = MockBrowserWindow.windows.filter((window) => window !== this)
    this.emit('closed')
  }
}

export const commandLineSwitches: Array<[string, string | undefined]> = []
export const app = {
  commandLine: { appendSwitch: (name: string, value?: string) => commandLineSwitches.push([name, value]) },
  userAgentFallback: '',
  setPath: (_name: string, _value: string) => undefined,
  getPath: (_name: string) => 'C:\\mock-user-data',
  exit: (_code?: number) => undefined,
  quit: () => undefined,
  whenReady: () => Promise.resolve(),
  on: (_event: string, _listener: Listener) => app,
}

export const Menu = {
  setApplicationMenu: (_menu: unknown) => undefined,
  buildFromTemplate: (template: unknown) => ({ template }),
}

export const shell = {
  openExternal: (_url: string) => Promise.resolve(),
  openPath: (_path: string) => Promise.resolve(''),
  showItemInFolder: (_path: string) => undefined,
}

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value, 'utf8'),
  decryptString: (value: Buffer) => value.toString('utf8'),
}

export const ipcMain = new EventEmitter() as EventEmitter & {
  handle: (channel: string, listener: Listener) => void
  removeHandler: (channel: string) => void
}
const ipcHandlers = new Map<string, Listener>()
ipcMain.handle = (channel, listener) => { ipcHandlers.set(channel, listener) }
ipcMain.removeHandler = (channel) => { ipcHandlers.delete(channel) }

export const ipcRenderer = new EventEmitter() as EventEmitter & {
  send: (...args: unknown[]) => void
  invoke: (...args: unknown[]) => Promise<unknown>
}
ipcRenderer.send = (...args) => { ipcRenderer.emit('send', ...args) }
ipcRenderer.invoke = async (channel, ...args) => ipcHandlers.get(String(channel))?.({}, ...args)

export const contextBridge = { exposeInMainWorld: (_name: string, _api: unknown) => undefined }
export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  showMessageBox: async () => ({ response: 0 }),
}
export const powerMonitor = new EventEmitter()
export const screen = { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
export const webContents = { fromId: (_id: number) => undefined }
export const session = {
  defaultSession: { setUserAgent: (_ua: string) => undefined, webRequest: new EventEmitter() },
  fromPartition: (_partition: string) => ({ setUserAgent: (_ua: string) => undefined, webRequest: new EventEmitter() }),
}
export const protocol = { registerSchemesAsPrivileged: (_schemes: unknown) => undefined, handle: (_scheme: string, _handler: unknown) => undefined }
export const net = { fetch: (_url: string) => Promise.resolve(new Response()) }

export function resetElectronMock(): void {
  commandLineSwitches.length = 0
  MockBrowserWindow.windows = []
  ipcHandlers.clear()
  ipcMain.removeAllListeners()
  ipcRenderer.removeAllListeners()
}

export { MockBrowserWindow as BrowserWindow, MockWebContentsView as WebContentsView }
