import { ipcMain as electronIpcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { SHELL_ORIGIN } from '../app/appProtocol'

type ShellEvent = IpcMainEvent | IpcMainInvokeEvent
type IpcListener<T extends ShellEvent> = (event: T, ...args: any[]) => any
type RegistrableWebContents = Pick<WebContents, 'id'> & Partial<Pick<WebContents, 'once'>>
type WebContentsIdentity = Pick<WebContents, 'id'> | null | undefined

const shellWebContentsIds = new Set<number>()
const ojWebContentsIds = new Set<number>()

function getWebContentsId(webContents: WebContentsIdentity): number | null {
  if (!webContents || !Number.isInteger(webContents.id)) return null
  return webContents.id
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

function rejectSend(channel: string, check: TrustedSenderCheck): void {
  console.warn(`[ipc] Rejected ${channel} (${check.reason})`)
}

export function registerShellWebContents(webContents: RegistrableWebContents): void {
  const id = getWebContentsId(webContents)
  if (id === null || shellWebContentsIds.has(id)) return
  shellWebContentsIds.add(id)
  webContents.once?.('destroyed', () => shellWebContentsIds.delete(id))
}

export function unregisterShellWebContents(webContents: WebContentsIdentity): void {
  const id = getWebContentsId(webContents)
  if (id !== null) shellWebContentsIds.delete(id)
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

export function handleFromShell(channel: string, listener: IpcListener<IpcMainInvokeEvent>): void {
  electronIpcMain.handle(channel, (event, ...args) => {
    const check = checkShellSender(event)
    if (!check.trusted) rejectInvoke(check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) rejectInvoke(payloadCheck)
    return listener(event, ...args)
  })
}

export function onFromShell(channel: string, listener: IpcListener<IpcMainEvent>): void {
  electronIpcMain.on(channel, (event, ...args) => {
    const check = checkShellSender(event)
    if (!check.trusted) return rejectSend(channel, check)
    const payloadCheck = checkIpcPayload(args)
    if (!payloadCheck.trusted) return rejectSend(channel, payloadCheck)
    listener(event, ...args)
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

// Compatibility facade keeps register*.ts call sites small while guaranteeing
// every ordinary renderer channel passes through the same shell validator.
export const ipcMain = {
  handle: handleFromShell,
  on: onFromShell,
}

export function resetTrustedSenderRegistry(): void {
  shellWebContentsIds.clear()
  ojWebContentsIds.clear()
}
