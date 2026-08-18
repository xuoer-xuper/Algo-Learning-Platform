import { EventEmitter } from 'node:events'

type Listener = (...args: any[]) => void

export class MockWebContents extends EventEmitter {
  private static nextId = 1
  readonly id = MockWebContents.nextId++
  private url = ''
  private title = ''
  private destroyed = false
  private loading = false
  private devToolsOpen = false
  private zoomFactor = 1
  private windowOpenHandler: ((details: any) => any) | null = null
  readonly navigationHistory = {
    canGoBack: () => false,
    canGoForward: () => false,
    goBack: () => undefined,
    goForward: () => undefined,
  }
  readonly mainFrame = new MockWebFrame()

  getURL(): string { return this.url }
  getTitle(): string { return this.title }
  isDestroyed(): boolean { return this.destroyed }
  isLoadingMainFrame(): boolean { return this.loading }
  isDevToolsOpened(): boolean { return this.devToolsOpen }
  openDevTools(_options?: unknown): void { this.devToolsOpen = true }
  closeDevTools(): void { this.devToolsOpen = false }
  getZoomFactor(): number { return this.zoomFactor }
  setZoomFactor(factor: number): void { this.zoomFactor = factor }
  setTitle(title: string): void { this.title = title; this.emit('page-title-updated', {}, title) }
  setWindowOpenHandler(handler: (details: any) => any): void { this.windowOpenHandler = handler }
  simulateWindowOpen(details: any): { response: any; webContents?: MockWebContents } {
    if (!this.windowOpenHandler) return { response: { action: 'deny' } }
    const response = this.windowOpenHandler(details)
    if (response.action !== 'allow' || !response.createWindow) return { response }
    const child = new MockWebContents()
    const returned = response.createWindow({ webPreferences: {}, webContents: child }) as MockWebContents
    if (returned !== child) {
      throw new Error('createWindow must return the supplied popup webContents')
    }
    if (details.url) void child.loadURL(details.url)
    return { response, webContents: child }
  }
  loadURL(url: string): Promise<void> {
    this.url = url
    this.mainFrame.url = url
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
  url = ''
  readonly framesInSubtree: MockWebFrame[] = []
  isDestroyed(): boolean { return false }
  executeJavaScript(_code: string): Promise<unknown> { return Promise.resolve(undefined) }
}

export class MockWebContentsView {
  private contents: MockWebContents | undefined
  private bounds = { x: 0, y: 0, width: 0, height: 0 }
  constructor(options: { webContents?: MockWebContents } = {}) {
    const contents = options.webContents ?? new MockWebContents()
    this.contents = contents
    contents.once('destroyed', () => { this.contents = undefined })
  }
  get webContents(): MockWebContents { return this.contents as MockWebContents }
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
  private minimized = false
  private maximized = false
  private focused = false
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
  isMinimized(): boolean { return this.minimized }
  isFocused(): boolean { return this.focused }
  show(): void { this.visible = true; this.emit('show') }
  showInactive(): void { this.show() }
  hide(): void { this.visible = false; this.focused = false }
  minimize(): void { this.minimized = true; this.visible = false; this.focused = false; this.emit('minimize') }
  restore(): void { this.minimized = false; this.visible = true; this.emit('restore') }
  focus(): void { this.visible = true; this.focused = true; this.emit('focus') }
  isMaximized(): boolean { return this.maximized }
  maximize(): void { this.maximized = true; this.emit('maximize') }
  unmaximize(): void { this.maximized = false; this.emit('unmaximize') }
  setTitle(_title: string): void { /* no-op */ }
  close(): void {
    if (this.destroyed) return
    let defaultPrevented = false
    this.emit('close', {
      preventDefault: () => { defaultPrevented = true },
    })
    if (defaultPrevented) return
    this.destroyed = true
    this.focused = false
    MockBrowserWindow.windows = MockBrowserWindow.windows.filter((window) => window !== this)
    this.emit('closed')
  }
}

export const commandLineSwitches: Array<[string, string | undefined]> = []
export class MockApp extends EventEmitter {
  readonly commandLine = {
    appendSwitch: (name: string, value?: string) => commandLineSwitches.push([name, value]),
  }
  userAgentFallback = ''
  singleInstanceLockGranted = true
  requestSingleInstanceLockCallCount = 0
  quitCallCount = 0
  readonly exitCodes: Array<number | undefined> = []

  setPath(_name: string, _value: string): void { /* no-op */ }
  getPath(_name: string): string { return 'C:\\mock-user-data' }
  exit(code?: number): void { this.exitCodes.push(code) }
  quit(): void { this.quitCallCount += 1 }
  requestSingleInstanceLock(): boolean {
    this.requestSingleInstanceLockCallCount += 1
    return this.singleInstanceLockGranted
  }
  whenReady(): Promise<void> { return Promise.resolve() }

  reset(): void {
    this.removeAllListeners()
    this.userAgentFallback = ''
    this.singleInstanceLockGranted = true
    this.requestSingleInstanceLockCallCount = 0
    this.quitCallCount = 0
    this.exitCodes.length = 0
  }
}
export const app = new MockApp()

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

class MockWebRequest {
  headersReceivedHandler: Listener | null = null
  responseStartedHandler: Listener | null = null
  onHeadersReceived(handler: Listener): void { this.headersReceivedHandler = handler }
  onResponseStarted(handler: Listener): void { this.responseStartedHandler = handler }
}

export class MockSession {
  readonly webRequest = new MockWebRequest()
  userAgent = ''
  permissionCheckHandler: Listener | null = null
  permissionRequestHandler: Listener | null = null

  setUserAgent(userAgent: string): void { this.userAgent = userAgent }
  setPermissionCheckHandler(handler: Listener | null): void { this.permissionCheckHandler = handler }
  setPermissionRequestHandler(handler: Listener | null): void { this.permissionRequestHandler = handler }
  reset(): void {
    this.userAgent = ''
    this.permissionCheckHandler = null
    this.permissionRequestHandler = null
    this.webRequest.headersReceivedHandler = null
    this.webRequest.responseStartedHandler = null
  }
}

const defaultSession = new MockSession()
const partitionSessions = new Map<string, MockSession>()
export const session = {
  defaultSession,
  fromPartition: (partition: string) => {
    const existing = partitionSessions.get(partition)
    if (existing) return existing
    const created = new MockSession()
    partitionSessions.set(partition, created)
    return created
  },
}
export const protocolSchemes: unknown[] = []
export const protocolHandlers = new Map<string, unknown>()
export const protocol = {
  registerSchemesAsPrivileged: (schemes: unknown) => protocolSchemes.push(schemes),
  handle: (scheme: string, handler: unknown) => { protocolHandlers.set(scheme, handler) },
}
export const net = { fetch: (_url: string) => Promise.resolve(new Response()) }

export function resetElectronMock(): void {
  commandLineSwitches.length = 0
  app.reset()
  MockBrowserWindow.windows = []
  ipcHandlers.clear()
  ipcMain.removeAllListeners()
  ipcRenderer.removeAllListeners()
  protocolSchemes.length = 0
  protocolHandlers.clear()
  defaultSession.reset()
  partitionSessions.clear()
}

export { MockBrowserWindow as BrowserWindow, MockWebContentsView as WebContentsView }
