import {
  clipboard,
  ipcMain,
  type IpcMainEvent,
  type MessagePortMain,
  type Session,
  type WebContents,
} from 'electron'
import { checkOjFrameSender } from '../ipc/trustedSender'
import { appLogger, type Logger } from '../shared/logger'
import type { UserScriptRuntime } from './UserScriptRuntime'
import type { UserScriptMenuRegistry } from './UserScriptMenuRegistry'
import type { UserScriptNetworkProxy } from './UserScriptNetworkProxy'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
  isUserScriptRuntimeInitRequest,
  isUserScriptRuntimePortRequest,
  parseUserScriptRuntimeCommand,
  type UserScriptRuntimeBootstrapResponse,
  type UserScriptRuntimeEvent,
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
  networkProxy?: Pick<UserScriptNetworkProxy, 'start' | 'abort' | 'abortPrefix'>
  menuRegistry?: UserScriptMenuRegistry
  writeClipboard?: (data: string, dataType: 'text' | 'html') => void
}

interface AllowedRuntimeScript {
  name: string
  grants: Set<string>
  connects: string[]
}

interface PendingRuntimePort {
  nonce: string
  frameUrl: string
  generation: number
  allowedScripts: Map<string, AllowedRuntimeScript>
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
  const writeClipboard = options.writeClipboard ?? ((data: string, dataType: 'text' | 'html') => {
    if (dataType === 'html') clipboard.writeHTML(data)
    else clipboard.writeText(data)
  })

  const closeFramePort = (frameKey: string): void => {
    pendingPorts.delete(frameKey)
    options.networkProxy?.abortPrefix(operationPrefix(frameKey))
    options.menuRegistry?.clearPort(frameKey)
    const active = activePorts.get(frameKey)
    if (!active) return
    activePorts.delete(frameKey)
    try { active.port.close() }
    catch { /* the remote frame may already be gone */ }
  }

  const closeAllPorts = (): void => {
    pendingPorts.clear()
    for (const frameKey of Array.from(activePorts.keys())) closeFramePort(frameKey)
  }

  const sendToActivePort = (active: ActiveRuntimePort, event: UserScriptRuntimeEvent): void => {
    if (activePorts.get(active.frameKey) !== active || active.generation !== options.runtime.generation) {
      closeFramePort(active.frameKey)
      return
    }
    try { active.port.postMessage(event) }
    catch { closeFramePort(active.frameKey) }
  }

  const removeGenerationListener = options.runtime.addGenerationChangeListener?.(() => closeAllPorts())

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
          allowedScripts: new Map(snapshot.scripts.map(script => [script.id, {
            name: script.name,
            grants: new Set(script.grants),
            connects: [...script.connects],
          }])),
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
        const command = parseUserScriptRuntimeCommand(messageEvent.data)
        if (!command) return
        const script = active.allowedScripts.get(command.scriptId)
        if (!script) return
        try {
          if (command.type === 'value:set') {
            if (!allowsValueMutation(script.grants, command.type)) return
            options.runtime.setValue(command.scriptId, command.key, command.value)
          }
          else if (command.type === 'value:delete') {
            if (!allowsValueMutation(script.grants, command.type)) return
            options.runtime.deleteValue(command.scriptId, command.key)
          }
          else if (command.type === 'xhr:start') {
            if (!allowsGrant(script.grants, 'GM_xmlhttpRequest', 'GM.xmlHttpRequest')) return
            options.networkProxy?.start(
              operationId(frameKey, command.scriptId, command.requestId),
              {
                scriptId: command.scriptId,
                scriptName: script.name,
                frameUrl: active.frameUrl,
                connects: script.connects,
                webContentsId: active.webContentsId,
              },
              command.requestId,
              command.details,
              event => sendToActivePort(active, event),
            )
          }
          else if (command.type === 'xhr:abort') {
            if (!allowsGrant(script.grants, 'GM_xmlhttpRequest', 'GM.xmlHttpRequest')) return
            options.networkProxy?.abort(operationId(frameKey, command.scriptId, command.requestId))
          }
          else if (command.type === 'clipboard:set') {
            if (!allowsGrant(script.grants, 'GM_setClipboard', 'GM.setClipboard')) return
            let ok = false
            try {
              writeClipboard(command.data, command.dataType)
              ok = true
            }
            catch { /* report a bounded failure without clipboard contents */ }
            sendToActivePort(active, { type: 'clipboard:result', requestId: command.requestId, ok })
          }
          else if (command.type === 'menu:register') {
            if (!allowsGrant(script.grants, 'GM_registerMenuCommand', 'GM.registerMenuCommand')) return
            options.menuRegistry?.register({
              portId: frameKey,
              webContentsId: active.webContentsId,
              scriptId: command.scriptId,
              scriptName: script.name,
              commandId: command.commandId,
              name: command.name,
              invoke: () => sendToActivePort(active, {
                type: 'menu:invoke', scriptId: command.scriptId, commandId: command.commandId,
              }),
            })
          }
          else if (command.type === 'menu:unregister') {
            if (!allowsGrant(
              script.grants,
              'GM_registerMenuCommand',
              'GM.registerMenuCommand',
              'GM_unregisterMenuCommand',
              'GM.unregisterMenuCommand',
            )) return
            options.menuRegistry?.unregister(frameKey, command.scriptId, command.commandId)
          }
        }
        catch (error) {
          logger.error('userscript.runtime-value-mutation-failed', {
            scriptId: command.scriptId,
            operation: command.type,
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
      closeAllPorts()
      observedContents.clear()
      removeGenerationListener?.()
      options.menuRegistry?.clear()
      options.session.unregisterPreloadScript(preloadRegistrationId)
    },
  }
}

function operationPrefix(frameKey: string): string {
  return `${frameKey}\u0000`
}

function operationId(frameKey: string, scriptId: string, requestId: string): string {
  return `${operationPrefix(frameKey)}${scriptId}\u0000${requestId}`
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

function allowsGrant(grants: ReadonlySet<string>, ...names: string[]): boolean {
  return !grants.has('none') && names.some(name => grants.has(name))
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
