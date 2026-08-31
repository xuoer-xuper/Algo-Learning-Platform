import { ipcMain as electronIpcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  IpcPayloadError,
  parseIpcArgs,
  type IpcSchemaTuple,
  type ParsedArgs,
} from './payloadSchema'
import { SHELL_ORIGIN } from '../app/appProtocol'
import { appLogger } from '../shared/logger'
import type { AppWindow } from '../windows/AppWindow'

type ShellEvent = IpcMainEvent | IpcMainInvokeEvent

/**
 * 无 schema 形态的处理器签名。
 *
 * 这里原先是 `...args: any[]`，并带着一段说明"刻意留下"：当时 12 个 register*.ts 里
 * 有 73 个处理器写成 `(_event, startDate: string, endDate: string)` 这样，把渲染进程
 * 传来的参数当成已校验的类型用，而实际上没有任何一处校验过。那个 `any` 掩盖的是一个真实
 * 缺口，不是类型标注问题；当时的结论是"改成 `unknown[]` 再补 73 个 `as` 只是把谎言
 * 搬个地方"。
 *
 * 现在缺口补完了（103 处全部声明 schema，走的是下面带 `ParsedArgs` 的重载），
 * 这个形态只剩零参处理器在用，于是 `unknown[]` 可以真正收紧——没有一处需要 `as`。
 * 返回值仍是 `unknown`：handler 的返回值经 `ipcRenderer.invoke` 结构化克隆后由
 * preload 各自声明类型，本层不该也无从收窄。
 *
 * 收紧之后它还多了一层作用：新增带参 channel 若忘了写 schema 元组，参数会是 `unknown`，
 * 在 handler 体内用不了——编译期就会推着人去声明 schema，而不是等架构守卫。
 */
export type IpcListener<T extends ShellEvent> = (event: T, ...args: unknown[]) => unknown

/**
 * 注册时真正需要的能力：一个 id，和一个可选的 `once('destroyed')` 用来自动注销。
 *
 * 这里刻意手写签名而不是 `Partial<Pick<WebContents, 'once'>>`。后者会把 Electron 的整套
 * 链式重载一起要过来——`once` 声明的返回值是 `this`，于是任何替身都得自证是完整的
 * `WebContents`（94 个成员）才能传进来，测试里 25 处因此报错。而下面三个 register* 全都
 * 只写 `webContents.once?.('destroyed', cb)` 并丢掉返回值，链式那部分从来没人用。
 *
 * 返回 `unknown` 是这层约束的核心：既接受真实 `WebContents` 的 `this`，也接受替身的
 * `void`，同时禁止本模块拿返回值继续链式调用（真要链式，得先改这里的声明）。
 */
type RegistrableWebContents = Pick<WebContents, 'id'> & {
  once?(event: 'destroyed', listener: () => void): unknown
}
type WebContentsIdentity = Pick<WebContents, 'id'> | null | undefined

const shellWebContentsIds = new Set<number>()
const shellWindowOwners = new Map<number, AppWindow>()
const coachWebContentsIds = new Set<number>()
const ojWebContentsIds = new Set<number>()

function getWebContentsId(webContents: WebContentsIdentity): number | null {
  try {
    if (!webContents) return null
    const id = webContents.id
    return Number.isInteger(id) ? id : null
  } catch {
    // Electron may throw while reading properties during WebContents teardown.
    return null
  }
}

function normalizeOrigin(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'app:') return `${parsed.protocol}//${parsed.hostname}`
    return parsed.origin
  } catch {
    return null
  }
}

function allowedShellOrigins(): Set<string> {
  const origins = new Set([SHELL_ORIGIN])
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    try {
      const parsed = new URL(devServerUrl)
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]'
      if (isLoopback && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) origins.add(parsed.origin)
    } catch { /* ignore invalid dev URL */ }
  }
  return origins
}

function isMainFrame(event: ShellEvent): boolean {
  const senderFrame = event.senderFrame
  if (!senderFrame) return false
  const mainFrame = event.sender.mainFrame
  return !mainFrame || senderFrame === mainFrame
}

function isKnownSender(event: ShellEvent, registry: Set<number>): boolean {
  const id = getWebContentsId(event.sender)
  return id !== null && registry.has(id)
}

function isExpectedOrigin(event: ShellEvent, expected: Set<string>): boolean {
  const frameUrl = event.senderFrame?.url || event.sender.getURL()
  const frameOrigin = normalizeOrigin(frameUrl)
  const senderOrigin = normalizeOrigin(event.sender.getURL())
  return frameOrigin !== null && frameOrigin === senderOrigin && expected.has(frameOrigin)
}

export interface TrustedSenderCheck {
  trusted: boolean
  reason: 'ok' | 'sender' | 'frame' | 'origin' | 'payload'
}

export function checkShellSender(event: ShellEvent): TrustedSenderCheck {
  if (!isKnownSender(event, shellWebContentsIds)) return { trusted: false, reason: 'sender' }
  if (!isMainFrame(event)) return { trusted: false, reason: 'frame' }
  if (!isExpectedOrigin(event, allowedShellOrigins())) return { trusted: false, reason: 'origin' }
  return { trusted: true, reason: 'ok' }
}

export function checkCoachSender(event: ShellEvent): TrustedSenderCheck {
  if (
    !isKnownSender(event, shellWebContentsIds)
    && !isKnownSender(event, coachWebContentsIds)
  ) {
    return { trusted: false, reason: 'sender' }
  }
  if (!isMainFrame(event)) return { trusted: false, reason: 'frame' }
  if (!isExpectedOrigin(event, allowedShellOrigins())) return { trusted: false, reason: 'origin' }
  return { trusted: true, reason: 'ok' }
}

export function checkOjSender(event: ShellEvent): TrustedSenderCheck {
  if (!isKnownSender(event, ojWebContentsIds)) return { trusted: false, reason: 'sender' }
  if (!isMainFrame(event)) return { trusted: false, reason: 'frame' }
  const url = event.senderFrame?.url || event.sender.getURL()
  const senderUrl = event.sender.getURL()
  if (!/^https:\/\//i.test(url) || normalizeOrigin(url) !== normalizeOrigin(senderUrl)) {
    return { trusted: false, reason: 'origin' }
  }
  return { trusted: true, reason: 'ok' }
}

export function checkOjFrameSender(event: ShellEvent, allowInsecureLocalhost = false): TrustedSenderCheck {
  if (!isKnownSender(event, ojWebContentsIds)) return { trusted: false, reason: 'sender' }
  const frameUrl = event.senderFrame?.url
  const senderUrl = event.sender.getURL()
  if (
    !frameUrl
    || !isAllowedOjFrameUrl(frameUrl, allowInsecureLocalhost)
    || !isAllowedOjFrameUrl(senderUrl, allowInsecureLocalhost)
  ) {
    return { trusted: false, reason: 'origin' }
  }
  return { trusted: true, reason: 'ok' }
}

function isAllowedOjFrameUrl(rawUrl: string, allowInsecureLocalhost: boolean): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'https:') return true
    return allowInsecureLocalhost
      && url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  }
  catch {
    return false
  }
}

export function checkIpcPayload(args: unknown[]): TrustedSenderCheck {
  const seen = new Set<object>()
  let nodes = 0

  const visit = (value: unknown, depth: number): boolean => {
    nodes += 1
    if (nodes > 20_000 || depth > 12) return false
    if (value === null || value === undefined) return true
    if (typeof value === 'string') return value.length <= 8 * 1024 * 1024
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'boolean') return true
    if (typeof value === 'bigint') return true
    if (typeof value !== 'object') return false
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value.byteLength <= 16 * 1024 * 1024
    if (seen.has(value)) return false
    seen.add(value)
    if (Array.isArray(value)) return value.length <= 20_000 && value.every((entry) => visit(entry, depth + 1))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    return Object.keys(value).length <= 2_000 && Object.values(value).every((entry) => visit(entry, depth + 1))
  }

  return args.every((arg) => visit(arg, 0))
    ? { trusted: true, reason: 'ok' }
    : { trusted: false, reason: 'payload' }
}

function rejectInvoke(check: TrustedSenderCheck): never {
  throw new Error(`Rejected IPC sender (${check.reason})`)
}

function rejectSend(channel: string, check: TrustedSenderCheck, payloadError?: IpcPayloadError): void {
  appLogger.warn('ipc.send-rejected', {
    channel,
    reason: check.reason,
    // 只记 path 与 expected，不记实际值——载荷可能含用户数据。
    ...(payloadError ? { path: payloadError.path, expected: payloadError.expected } : {}),
  })
}

export function registerShellWebContents(webContents: RegistrableWebContents, owner?: AppWindow): void {
  const id = getWebContentsId(webContents)
  if (id === null) return
  const existingOwner = shellWindowOwners.get(id)
  if (existingOwner && owner && existingOwner !== owner) {
    throw new Error(`Shell webContents ${id} already belongs to another window`)
  }
  if (owner) shellWindowOwners.set(id, owner)
  if (shellWebContentsIds.has(id)) return
  shellWebContentsIds.add(id)
  webContents.once?.('destroyed', () => {
    shellWebContentsIds.delete(id)
    shellWindowOwners.delete(id)
  })
}

export function unregisterShellWebContents(webContents: WebContentsIdentity): void {
  const id = getWebContentsId(webContents)
  if (id !== null) {
    shellWebContentsIds.delete(id)
    shellWindowOwners.delete(id)
  }
}

export function getShellWindowOwner(event: ShellEvent): AppWindow | null {
  const check = checkShellSender(event)
  if (!check.trusted) return null
  const id = getWebContentsId(event.sender)
  return id === null ? null : shellWindowOwners.get(id) ?? null
}

export function registerCoachWebContents(webContents: RegistrableWebContents): void {
  const id = getWebContentsId(webContents)
  if (id === null || coachWebContentsIds.has(id)) return
  coachWebContentsIds.add(id)
  webContents.once?.('destroyed', () => coachWebContentsIds.delete(id))
}

export function unregisterCoachWebContents(webContents: WebContentsIdentity): void {
  const id = getWebContentsId(webContents)
  if (id !== null) coachWebContentsIds.delete(id)
}

export function registerOjWebContents(webContents: RegistrableWebContents): void {
  const id = getWebContentsId(webContents)
  if (id === null || ojWebContentsIds.has(id)) return
  ojWebContentsIds.add(id)
  webContents.once?.('destroyed', () => ojWebContentsIds.delete(id))
}

export function unregisterOjWebContents(webContents: WebContentsIdentity): void {
  const id = getWebContentsId(webContents)
  if (id !== null) ojWebContentsIds.delete(id)
}

/**
 * 把"可选的 schema 元组"这一层从四个注册函数里提出来。
 *
 * 两种调用形态都要支持，迁移才能一个文件一个文件地做：
 * - `handle(channel, listener)`——尚未声明 schema，行为与之前完全一致；
 * - `handle(channel, schemas, listener)`——按元组校验后把收窄过的实参交给 listener。
 *
 * 判别靠 `Array.isArray`：schema 元组是数组，listener 是函数，不会混。
 */
type SchemaOrListener<E extends ShellEvent> = IpcSchemaTuple | IpcListener<E>

function splitRegistration<E extends ShellEvent>(
  second: SchemaOrListener<E>,
  third?: IpcListener<E>,
): { schemas: IpcSchemaTuple | null, listener: IpcListener<E> } {
  if (Array.isArray(second)) {
    if (!third) throw new Error('IPC registration with schemas requires a listener')
    return { schemas: second, listener: third }
  }
  return { schemas: null, listener: second as IpcListener<E> }
}

/**
 * schema 校验失败与 sender 校验失败走同一个出口。
 *
 * 之所以把 `IpcPayloadError` 单独接住：它带 path/expected，值得记进日志好定位是哪个字段；
 * 而 handler 自己抛的业务异常不该被这里改写，原样抛出去由 invoke 的调用方处理。
 */
function parseOrReject(channel: string, schemas: IpcSchemaTuple, args: unknown[]): unknown[] {
  try {
    return parseIpcArgs(channel, schemas, args) as unknown[]
  } catch (error) {
    if (error instanceof IpcPayloadError) {
      appLogger.warn('ipc.payload-rejected', { channel, path: error.path, expected: error.expected })
      rejectInvoke({ trusted: false, reason: 'payload' })
    }
    throw error
  }
}

export function handleFromShell(channel: string, listener: IpcListener<IpcMainInvokeEvent>): void
export function handleFromShell<const S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  listener: (event: IpcMainInvokeEvent, ...args: ParsedArgs<S>) => unknown,
): void
export function handleFromShell(
  channel: string,
  second: SchemaOrListener<IpcMainInvokeEvent>,
  third?: IpcListener<IpcMainInvokeEvent>,
): void {
  const { schemas, listener } = splitRegistration(second, third)
  electronIpcMain.handle(channel, (event, ...args) => {
    const check = checkShellSender(event)
    if (!check.trusted) rejectInvoke(check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) rejectInvoke(payloadCheck)
    return listener(event, ...(schemas ? parseOrReject(channel, schemas, args) : args))
  })
}

export function onFromShell(channel: string, listener: IpcListener<IpcMainEvent>): void
export function onFromShell<const S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  listener: (event: IpcMainEvent, ...args: ParsedArgs<S>) => unknown,
): void
export function onFromShell(
  channel: string,
  second: SchemaOrListener<IpcMainEvent>,
  third?: IpcListener<IpcMainEvent>,
): void {
  const { schemas, listener } = splitRegistration(second, third)
  electronIpcMain.on(channel, (event, ...args) => {
    const check = checkShellSender(event)
    if (!check.trusted) return rejectSend(channel, check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) return rejectSend(channel, payloadCheck)
    // send 没有返回通道，校验失败只能记日志后丢弃——不能像 invoke 那样抛，
    // 抛出去会变成主进程里一条没人接的异常。
    let parsed: unknown[]
    try {
      parsed = schemas ? parseIpcArgs(channel, schemas, args) as unknown[] : args
    } catch (error) {
      if (error instanceof IpcPayloadError) {
        return rejectSend(channel, { trusted: false, reason: 'payload' }, error)
      }
      throw error
    }
    listener(event, ...parsed)
  })
}

export function handleFromCoach(channel: string, listener: IpcListener<IpcMainInvokeEvent>): void
export function handleFromCoach<const S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  listener: (event: IpcMainInvokeEvent, ...args: ParsedArgs<S>) => unknown,
): void
export function handleFromCoach(
  channel: string,
  second: SchemaOrListener<IpcMainInvokeEvent>,
  third?: IpcListener<IpcMainInvokeEvent>,
): void {
  const { schemas, listener } = splitRegistration(second, third)
  electronIpcMain.handle(channel, (event, ...args) => {
    const check = checkCoachSender(event)
    if (!check.trusted) rejectInvoke(check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) rejectInvoke(payloadCheck)
    return listener(event, ...(schemas ? parseOrReject(channel, schemas, args) : args))
  })
}

export function onFromCoach(channel: string, listener: IpcListener<IpcMainEvent>): void
export function onFromCoach<const S extends IpcSchemaTuple>(
  channel: string,
  schemas: S,
  listener: (event: IpcMainEvent, ...args: ParsedArgs<S>) => unknown,
): void
export function onFromCoach(
  channel: string,
  second: SchemaOrListener<IpcMainEvent>,
  third?: IpcListener<IpcMainEvent>,
): void {
  const { schemas, listener } = splitRegistration(second, third)
  electronIpcMain.on(channel, (event, ...args) => {
    const check = checkCoachSender(event)
    if (!check.trusted) return rejectSend(channel, check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) return rejectSend(channel, payloadCheck)
    let parsed: unknown[]
    try {
      parsed = schemas ? parseIpcArgs(channel, schemas, args) as unknown[] : args
    } catch (error) {
      if (error instanceof IpcPayloadError) {
        return rejectSend(channel, { trusted: false, reason: 'payload' }, error)
      }
      throw error
    }
    listener(event, ...parsed)
  })
}

export function onFromOj(channel: string, listener: IpcListener<IpcMainEvent>): IpcListener<IpcMainEvent> {
  const guardedListener: IpcListener<IpcMainEvent> = (event, ...args) => {
    const check = checkOjSender(event)
    if (!check.trusted) return rejectSend(channel, check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) return rejectSend(channel, payloadCheck)
    listener(event, ...args)
  }
  electronIpcMain.on(channel, guardedListener)
  return guardedListener
}

/**
 * Invoke counterpart of {@link onFromOj}. The isolated OJ preload uses this to
 * pull main-process state at document start; a pull can never be lost the way a
 * main-to-renderer push can race a not-yet-registered listener.
 */
export function handleFromOj(
  channel: string,
  listener: IpcListener<IpcMainInvokeEvent>,
): IpcListener<IpcMainInvokeEvent> {
  const guardedListener: IpcListener<IpcMainInvokeEvent> = (event, ...args) => {
    const check = checkOjSender(event)
    if (!check.trusted) rejectInvoke(check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) rejectInvoke(payloadCheck)
    return listener(event, ...args)
  }
  electronIpcMain.handle(channel, guardedListener)
  return guardedListener
}

// Compatibility facade keeps register*.ts call sites small while guaranteeing
// every ordinary renderer channel passes through the same shell validator.
export const ipcMain = {
  handle: handleFromShell,
  on: onFromShell,
}

export const coachPetIpcMain = {
  handle: handleFromCoach,
  on: onFromCoach,
}

export function resetTrustedSenderRegistry(): void {
  shellWebContentsIds.clear()
  shellWindowOwners.clear()
  coachWebContentsIds.clear()
  ojWebContentsIds.clear()
}
