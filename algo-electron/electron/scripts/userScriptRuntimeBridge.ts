import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
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
import { buildUserScriptCompiledCatalogPreload } from './userScriptCompiledCatalog'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
  isUserScriptRuntimeInitRequest,
  isUserScriptRuntimePortRequest,
  parseUserScriptRuntimeCommand,
  type UserScriptRuntimeBootstrapResponse,
  type UserScriptRuntimeEvent,
  type UserScriptRuntimeScriptSnapshot,
} from './userScriptRuntimeProtocol'
import { errorMessage } from '../shared/errors'

const PENDING_PORT_TTL_MS = 5_000
const MAX_PENDING_PORTS = 256

interface UserScriptRuntimeBridgeOptions {
  runtime: UserScriptRuntime
  session: Session
  preloadPath: string
  catalogPreloadPath?: string
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
  documentUrl: string
  frameUrl: string
  isMainFrame: boolean
  generation: number
  scripts: UserScriptRuntimeScriptSnapshot[]
  bootstrapScriptIds: Set<string>
  allowedScripts: Map<string, AllowedRuntimeScript>
  expiresAt: number
  idleReached: boolean
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
  const combinedPreloadPath = options.catalogPreloadPath
    ? resolveCombinedPreloadPath(options.catalogPreloadPath, options.preloadPath)
    : null
  const bootstrapSource = combinedPreloadPath ? readFileSync(options.preloadPath, 'utf8') : null
  const observedContents = new Map<number, {
    contents: WebContents
    onDidFinishLoad: () => void
    onDidFrameFinishLoad: (
      event: Electron.Event,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ) => void
    onDidNavigateInPage: (
      event: Electron.Event,
      url: string,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ) => void
    onDestroyed: () => void
  }>()
  const rebuildCompiledCatalog = (): void => {
    if (!combinedPreloadPath || bootstrapSource === null) return
    try {
      const catalog = buildUserScriptCompiledCatalogPreload(options.runtime.getCatalogSnapshot())
      const catalogSource = bootstrapSource.includes("require('electron')") || bootstrapSource.includes('require("electron")')
        ? catalog.source.replace("import { contextBridge } from 'electron';", "const { contextBridge } = require('electron');")
        : catalog.source
      mkdirSync(path.dirname(combinedPreloadPath), { recursive: true })
      writeFileSync(combinedPreloadPath, `${catalogSource}\n${bootstrapSource}`, { encoding: 'utf8', mode: 0o600 })
      if (catalog.rejectedScriptIds.length > 0) {
        logger.warn('userscript.runtime-catalog-syntax-rejected', {
          scriptIds: catalog.rejectedScriptIds,
        })
      }
    }
    catch (error) {
      try { rmSync(combinedPreloadPath, { force: true }) }
      catch { /* fail closed if a stale catalog cannot be removed */ }
      logger.error('userscript.runtime-catalog-build-failed', {
        error: errorMessage(error),
      })
    }
  }
  rebuildCompiledCatalog()
  const preloadRegistrationId = options.session.registerPreloadScript({
    type: 'frame',
    filePath: combinedPreloadPath ?? options.preloadPath,
  })
  const writeClipboard = options.writeClipboard ?? ((data: string, dataType: 'text' | 'html') => {
    if (dataType === 'html') clipboard.writeHTML(data)
    else clipboard.writeText(data)
  })

  const cleanFramePort = (frameKey: string, closePort: boolean): void => {
    pendingPorts.delete(frameKey)
    const active = activePorts.get(frameKey)
    if (!active) return
    activePorts.delete(frameKey)
    options.networkProxy?.abortPrefix(operationPrefix(frameKey))
    options.menuRegistry?.clearPort(frameKey)
    if (closePort) {
      try {
        active.port.postMessage({ type: 'runtime:invalidate', generation: active.generation })
      }
      catch { /* the remote frame may already be gone */ }
    }
    if (closePort) {
      try { active.port.close() }
      catch { /* the remote frame may already be gone */ }
    }
  }

  const closeFramePort = (frameKey: string): void => { cleanFramePort(frameKey, true) }

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

  const markFrameIdle = (frameKey: string): void => {
    const pending = pendingPorts.get(frameKey)
    if (pending) pending.idleReached = true
    const active = activePorts.get(frameKey)
    if (!active || active.idleReached) return
    active.idleReached = true
    sendToActivePort(active, {
      type: 'runtime:phase',
      generation: active.generation,
      phase: 'document-idle',
    })
  }

  const removeGenerationListener = options.runtime.addGenerationChangeListener?.(() => {
    closeAllPorts()
    rebuildCompiledCatalog()
  })

  const closeWebContentsPorts = (webContentsId: number): void => {
    const observed = observedContents.get(webContentsId)
    if (observed) {
      observedContents.delete(webContentsId)
      observed.contents.removeListener('did-finish-load', observed.onDidFinishLoad)
      observed.contents.removeListener('did-frame-finish-load', observed.onDidFrameFinishLoad)
      observed.contents.removeListener('did-navigate-in-page', observed.onDidNavigateInPage)
      observed.contents.removeListener('destroyed', observed.onDestroyed)
    }
    for (const [frameKey, active] of activePorts) {
      if (active.webContentsId === webContentsId) closeFramePort(frameKey)
    }
    for (const frameKey of pendingPorts.keys()) {
      if (frameKey.startsWith(`${webContentsId}:`)) pendingPorts.delete(frameKey)
    }
  }

  const observeWebContents = (sender: WebContents): void => {
    if (observedContents.has(sender.id)) return
    const onDidFinishLoad = (): void => {
      const frame = sender.mainFrame
      if (!frame) return
      markFrameIdle(`${sender.id}:${frame.processId}:${frame.routingId}`)
    }
    const onDidFrameFinishLoad = (
      _event: Electron.Event,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ): void => {
      if (!isMainFrame) markFrameIdle(`${sender.id}:${frameProcessId}:${frameRoutingId}`)
    }
    const onDidNavigateInPage = (
      _event: Electron.Event,
      url: string,
      isMainFrame: boolean,
      frameProcessId: number,
      frameRoutingId: number,
    ): void => {
      const frameKey = `${sender.id}:${frameProcessId}:${frameRoutingId}`
      const pending = pendingPorts.get(frameKey)
      const active = activePorts.get(frameKey)
      if (!pending && !active) return
      if (!isAllowedRuntimeUrl(url, Boolean(options.allowInsecureLocalhost))) {
        closeFramePort(frameKey)
        return
      }
      const snapshot = options.runtime.getNavigationSnapshot(url, isMainFrame)
      if (snapshot.generation !== options.runtime.generation || snapshot.generation !== (active ?? pending)?.generation) {
        closeFramePort(frameKey)
        return
      }
      const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength
      if (snapshotBytes > USER_SCRIPT_RUNTIME_MAX_SNAPSHOT_BYTES) {
        closeFramePort(frameKey)
        return
      }
      const nextAllowed = allowedScripts(snapshot.scripts)
      if (pending) {
        pending.frameUrl = url
        pending.isMainFrame = isMainFrame
        pending.scripts = snapshot.scripts
        pending.allowedScripts = nextAllowed
      }
      if (!active) return
      const inactiveScriptIds = Array.from(active.allowedScripts.keys())
        .filter(scriptId => !nextAllowed.has(scriptId))
      for (const scriptId of inactiveScriptIds) {
        options.networkProxy?.abortPrefix(operationScriptPrefix(frameKey, scriptId))
        options.menuRegistry?.clearScript(frameKey, scriptId)
      }
      active.frameUrl = url
      active.isMainFrame = isMainFrame
      active.scripts = snapshot.scripts
      active.allowedScripts = nextAllowed
      sendToActivePort(active, {
        type: 'runtime:sync',
        generation: active.generation,
        frameUrl: url,
        scripts: snapshot.scripts,
        inactiveScriptIds,
      })
    }
    const onDestroyed = (): void => { closeWebContentsPorts(sender.id) }
    observedContents.set(sender.id, {
      contents: sender,
      onDidFinishLoad,
      onDidFrameFinishLoad,
      onDidNavigateInPage,
      onDestroyed,
    })
    sender.on('did-finish-load', onDidFinishLoad)
    sender.on('did-frame-finish-load', onDidFrameFinishLoad)
    sender.on('did-navigate-in-page', onDidNavigateInPage)
    sender.once('destroyed', onDestroyed)
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
      pendingPorts.set(frameKey, {
        nonce: payload.nonce,
        documentUrl: payload.frameUrl,
        frameUrl: payload.frameUrl,
        isMainFrame,
        generation: snapshot.generation,
        scripts: snapshot.scripts,
        bootstrapScriptIds: new Set(snapshot.scripts.map(script => script.id)),
        allowedScripts: allowedScripts(snapshot.scripts),
        expiresAt: now() + PENDING_PORT_TTL_MS,
        idleReached: false,
      })
    }
    catch (error) {
      logger.error('userscript.runtime-init-failed', {
        error: errorMessage(error),
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
      if (!senderFrame) return reject()
      const frameKey = getFrameKey(event)
      if (!frameKey) return reject()
      const pending = pendingPorts.get(frameKey)
      pendingPorts.delete(frameKey)
      if (
        !pending
        || pending.nonce !== payload.nonce
        || pending.documentUrl !== payload.frameUrl
        || pending.generation !== payload.generation
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
            error: errorMessage(error),
          })
        }
      })
      transferredPort.once('close', () => {
        if (activePorts.get(frameKey) === active) cleanFramePort(frameKey, false)
      })
      transferredPort.start()
      sendToActivePort(active, { type: 'runtime:ready', generation: active.generation })
      const inactiveScriptIds = Array.from(active.bootstrapScriptIds)
        .filter(scriptId => !active.allowedScripts.has(scriptId))
      if (active.frameUrl !== active.documentUrl || inactiveScriptIds.length > 0) {
        sendToActivePort(active, {
          type: 'runtime:sync',
          generation: active.generation,
          frameUrl: active.frameUrl,
          scripts: active.scripts,
          inactiveScriptIds,
        })
      }
      if (active.idleReached) {
        sendToActivePort(active, {
          type: 'runtime:phase',
          generation: active.generation,
          phase: 'document-idle',
        })
      }
    }
    catch (error) {
      reject()
      logger.error('userscript.runtime-port-failed', {
        error: errorMessage(error),
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
      for (const webContentsId of [...observedContents.keys()]) closeWebContentsPorts(webContentsId)
      removeGenerationListener?.()
      options.menuRegistry?.clear()
      options.session.unregisterPreloadScript(preloadRegistrationId)
      if (combinedPreloadPath) {
        try { rmSync(combinedPreloadPath, { force: true }) }
        catch { /* best-effort cleanup after unregistering the generated preload */ }
      }
    },
  }
}

function operationPrefix(frameKey: string): string {
  return `${frameKey}\u0000`
}

function resolveCombinedPreloadPath(catalogPath: string, bootstrapPath: string): string {
  const isCommonJs = bootstrapPath.endsWith('.cjs')
  if (!isCommonJs) return catalogPath
  return catalogPath.replace(/\.[^.\\/]+$/, '.cjs')
}

function operationId(frameKey: string, scriptId: string, requestId: string): string {
  return `${operationPrefix(frameKey)}${scriptId}\u0000${requestId}`
}

function operationScriptPrefix(frameKey: string, scriptId: string): string {
  return `${operationPrefix(frameKey)}${scriptId}\u0000`
}

function allowedScripts(
  scripts: UserScriptRuntimeScriptSnapshot[],
): Map<string, AllowedRuntimeScript> {
  return new Map(scripts.map(script => [script.id, {
    name: script.name,
    grants: new Set(script.grants),
    connects: [...script.connects],
  }]))
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
