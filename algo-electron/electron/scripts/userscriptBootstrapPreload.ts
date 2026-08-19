import { contextBridge, ipcRenderer } from 'electron'
import { buildUserScriptMainWorldRuntime } from './userScriptMainWorldRuntime'
import {
  USER_SCRIPT_RUNTIME_HANDOFF_KIND,
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
  type UserScriptRuntimeBootstrapResponse,
} from './userScriptRuntimeProtocol'

const frameUrl = location.href
const targetOrigin = location.origin

if ((targetOrigin.startsWith('https://') || targetOrigin.startsWith('http://')) && frameUrl.length <= 8_192) {
  const nonce = createNonce()
  const response = ipcRenderer.sendSync(USER_SCRIPT_RUNTIME_INIT_CHANNEL, {
    nonce,
    frameUrl,
    isMainFrame: window.top === window,
  }) as UserScriptRuntimeBootstrapResponse

  if (isBootstrapResponse(response, nonce) && response.scripts.length > 0) {
    const built = buildUserScriptMainWorldRuntime({
      handshakeId: nonce,
      targetOrigin,
      handlerVersion: process.versions.electron ?? '',
      scripts: response.scripts.map(script => ({
        id: script.id,
        name: script.name,
        namespace: script.namespace,
        description: script.description,
        version: script.version,
        runAt: script.runAt,
        source: script.code,
        grants: script.grants,
        values: script.values,
      })),
    })

    for (const rejected of built.rejectedScripts) {
      console.warn('[UserScript] Syntax rejected:', rejected.name)
    }

    let completed = false
    const removeListener = (): void => {
      if (completed) return
      completed = true
      window.removeEventListener('message', handlePortHandoff)
    }
    const handlePortHandoff = (event: MessageEvent): void => {
      if (completed || event.source !== window || event.origin !== targetOrigin || event.ports.length !== 1) return
      if (!isExpectedHandoff(event.data, nonce)) return
      const port = event.ports[0]
      removeListener()
      ipcRenderer.postMessage(USER_SCRIPT_RUNTIME_PORT_CHANNEL, { nonce, frameUrl }, [port])
    }

    window.addEventListener('message', handlePortHandoff)
    setTimeout(removeListener, 5_000)
    try {
      contextBridge.executeInMainWorld(built.execution)
    }
    catch {
      removeListener()
      console.error('[UserScript] Runtime bootstrap failed')
    }
  }
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function isBootstrapResponse(
  value: UserScriptRuntimeBootstrapResponse,
  nonce: string,
): value is Extract<UserScriptRuntimeBootstrapResponse, { ok: true }> {
  return Boolean(
    value
    && value.ok === true
    && value.nonce === nonce
    && Number.isSafeInteger(value.generation)
    && value.generation >= 0
    && Array.isArray(value.scripts),
  )
}

function isExpectedHandoff(value: unknown, handshakeId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return keys.length === 2
    && keys[0] === 'handshakeId'
    && keys[1] === 'type'
    && record.type === USER_SCRIPT_RUNTIME_HANDOFF_KIND
    && record.handshakeId === handshakeId
}
