import {
  ipcMain,
  type IpcMainEvent,
  type MessagePortMain,
  type Session,
  type WebContents,
} from 'electron'
import { checkOjFrameSender } from '../ipc/trustedSender'
import { appLogger, type Logger } from '../shared/logger'
import type { UserScriptRuntime } from './UserScriptRuntime'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
  isUserScriptRuntimeInitRequest,
  isUserScriptRuntimePortRequest,
  parseUserScriptRuntimeMutation,
  type UserScriptRuntimeBootstrapResponse,
} from './userScriptRuntimeProtocol'

const PENDING_PORT_TTL_MS = 5_000
const MAX_PENDING_PORTS = 256

interface UserScriptRuntimeBridgeOptions {
  runtime: UserScriptRuntime
  session: Session
  preloadPath: string
  allowInsecureLocalhost?: boolean
  logger?: Logger
  now?: () => number
}

interface PendingRuntimePort {
  nonce: string
  frameUrl: string
  generation: number
  allowedGrants: Map<string, Set<string>>
  expiresAt: number
}

interface ActiveRuntimePort extends PendingRuntimePort {
  frameKey: string
  webContentsId: number
  port: MessagePortMain
}

export interface UserScriptRuntimeBridge {
  dispose(): void
}

export function installUserScriptRuntimeBridge(
  options: UserScriptRuntimeBridgeOptions,
): UserScriptRuntimeBridge {
  const logger = options.logger ?? appLogger
  const now = options.now ?? Date.now
  const pendingPorts = new Map<string, PendingRuntimePort>()
  const activePorts = new Map<string, ActiveRuntimePort>()
  const observedContents = new Set<number>()
  const preloadRegistrationId = options.session.registerPreloadScript({
    type: 'frame',
    filePath: options.preloadPath,
  })

  const closeFramePort = (frameKey: string): void => {
    pendingPorts.delete(frameKey)
    const active = activePorts.get(frameKey)
    if (!active) return
    activePorts.delete(frameKey)
    try { active.port.close() }
    catch { /* the remote frame may already be gone */ }
  }

  const closeWebContentsPorts = (webContentsId: number): void => {
    observedContents.delete(webContentsId)
    for (const [frameKey, active] of activePorts) {
      if (active.webContentsId === webContentsId) closeFramePort(frameKey)
    }
    for (const frameKey of pendingPorts.keys()) {
      if (frameKey.startsWith(`${webContentsId}:`)) pendingPorts.delete(frameKey)
    }
  }

  const observeWebContents = (sender: WebContents): void => {
    if (observedContents.has(sender.id)) return
    observedContents.add(sender.id)
    sender.once('destroyed', () => closeWebContentsPorts(sender.id))
  }

  const sweepPendingPorts = (): void => {
    const currentTime = now()
    for (const [frameKey, pending] of pendingPorts) {
      if (pending.expiresAt <= currentTime) pendingPorts.delete(frameKey)
    }
    while (pendingPorts.size >= MAX_PENDING_PORTS) {
      const oldestKey = pendingPorts.keys().next().value as string | undefined
      if (!oldestKey) break
      pendingPorts.delete(oldestKey)
    }
  }

  const handleInit = (event: IpcMainEvent, payload: unknown): void => {
    let response: UserScriptRuntimeBootstrapResponse = { ok: false }
    try {
      const check = checkOjFrameSender(event, Boolean(options.allowInsecureLocalhost))
      if (!check.trusted || event.sender.session !== options.session) return
      if (!isUserScriptRuntimeInitRequest(payload)) return
      const senderFrame = event.senderFrame
      if (!senderFrame || senderFrame.url !== payload.frameUrl) return
      const isMainFrame = senderFrame === event.sender.mainFrame
      if (payload.isMainFrame !== isMainFrame) return
      if (!isAllowedRuntimeUrl(payload.frameUrl, Boolean(options.allowInsecureLocalhost))) return

      sweepPendingPorts()
      observeWebContents(event.sender)
      const frameKey = getFrameKey(event)
      if (!frameKey) return
      closeFramePort(frameKey)

      const snapshot = options.runtime.getNavigationSnapshot(payload.frameUrl, isMainFrame)
      const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
      if (snapshotBytes > USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES) return
      response = {
        ok: true,
        nonce: payload.nonce,
        generation: snapshot.generation,
        scripts: snapshot.scripts,
      }
      if (snapshot.scripts.length > 0) {
        pendingPorts.set(frameKey, {
          nonce: payload.nonce,
          frameUrl: payload.frameUrl,
          generation: snapshot.generation,
          allowedGrants: new Map(snapshot.scripts.map(script => [script.id, new Set(script.grants)])),
          expiresAt: now() + PENDING_PORT_TTL_MS,
        })
      }
    }
    catch (error) {
      logger.error('userscript.runtime-init-failed', {
        error: error instanceof Error ? error.message : error,
      })
    }
    finally {
      event.returnValue = response
    }
  }

  const handlePort = (event: IpcMainEvent, payload: unknown): void => {
    const transferredPort = event.ports[0]
    const reject = (): void => {
      try { transferredPort?.close() }
      catch { /* ignore invalid transferred ports */ }
    }

    try {
      const check = checkOjFrameSender(event, Boolean(options.allowInsecureLocalhost))
      if (!check.trusted || event.sender.session !== options.session) return reject()
      if (!isUserScriptRuntimePortRequest(payload) || event.ports.length !== 1 || !transferredPort) return reject()
      const senderFrame = event.senderFrame
      if (!senderFrame || senderFrame.url !== payload.frameUrl) return reject()
      const frameKey = getFrameKey(event)
      if (!frameKey) return reject()
      const pending = pendingPorts.get(frameKey)
      pendingPorts.delete(frameKey)
      if (
        !pending
        || pending.nonce !== payload.nonce
        || pending.frameUrl !== payload.frameUrl
        || pending.expiresAt <= now()
        || pending.generation !== options.runtime.generation
      ) return reject()

      closeFramePort(frameKey)
      const active: ActiveRuntimePort = {
        ...pending,
        frameKey,
        webContentsId: event.sender.id,
        port: transferredPort,
      }
      activePorts.set(frameKey, active)
      transferredPort.on('message', messageEvent => {
        if (activePorts.get(frameKey) !== active || active.generation !== options.runtime.generation) {
          closeFramePort(frameKey)
          return
        }
        const mutation = parseUserScriptRuntimeMutation(messageEvent.data)
        if (!mutation) return
        const grants = active.allowedGrants.get(mutation.scriptId)
        if (!grants || !allowsValueMutation(grants, mutation.type)) return
        try {
          if (mutation.type === 'value:set') {
            options.runtime.setValue(mutation.scriptId, mutation.key, mutation.value)
          }
          else {
            options.runtime.deleteValue(mutation.scriptId, mutation.key)
          }
        }
        catch (error) {
          logger.error('userscript.runtime-value-mutation-failed', {
            scriptId: mutation.scriptId,
            operation: mutation.type,
            error: error instanceof Error ? error.message : error,
          })
        }
      })
      transferredPort.once('close', () => {
        if (activePorts.get(frameKey) === active) activePorts.delete(frameKey)
      })
      transferredPort.start()
    }
    catch (error) {
      reject()
      logger.error('userscript.runtime-port-failed', {
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  ipcMain.on(USER_SCRIPT_RUNTIME_INIT_CHANNEL, handleInit)
  ipcMain.on(USER_SCRIPT_RUNTIME_PORT_CHANNEL, handlePort)

  return {
    dispose(): void {
      ipcMain.removeListener(USER_SCRIPT_RUNTIME_INIT_CHANNEL, handleInit)
      ipcMain.removeListener(USER_SCRIPT_RUNTIME_PORT_CHANNEL, handlePort)
      pendingPorts.clear()
      for (const frameKey of Array.from(activePorts.keys())) closeFramePort(frameKey)
      observedContents.clear()
      options.session.unregisterPreloadScript(preloadRegistrationId)
    },
  }
}

function getFrameKey(event: IpcMainEvent): string | null {
  const frame = event.senderFrame
  if (!frame) return null
  return `${event.sender.id}:${frame.processId}:${frame.routingId}`
}

function allowsValueMutation(grants: ReadonlySet<string>, type: 'value:set' | 'value:delete'): boolean {
  if (grants.has('none')) return false
  return type === 'value:set'
    ? grants.has('GM_setValue') || grants.has('GM.setValue')
    : grants.has('GM_deleteValue') || grants.has('GM.deleteValue')
}

function isAllowedRuntimeUrl(rawUrl: string, allowInsecureLocalhost: boolean): boolean {
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
