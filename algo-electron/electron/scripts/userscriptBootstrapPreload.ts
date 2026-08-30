import { contextBridge, ipcRenderer } from 'electron'
import {
  USER_SCRIPT_COMPILED_CATALOG_KEY,
  catalogGenerationKey,
  type UserScriptCompiledCatalog,
} from './userScriptCompiledCatalog'
import {
  USER_SCRIPT_RUNTIME_INIT_CHANNEL,
  USER_SCRIPT_RUNTIME_PORT_CHANNEL,
  type UserScriptRuntimeBootstrapResponse,
} from './userScriptRuntimeProtocol'
import { errorMessage } from '../shared/errors'

const frameUrl = location.href
const targetOrigin = location.origin

if ((targetOrigin.startsWith('https://') || targetOrigin.startsWith('http://')) && frameUrl.length <= 8_192) {
  const nonce = createNonce()
  const response = ipcRenderer.sendSync(USER_SCRIPT_RUNTIME_INIT_CHANNEL, {
    nonce,
    frameUrl,
    isMainFrame: window.top === window,
  }) as UserScriptRuntimeBootstrapResponse

  if (isBootstrapResponse(response, nonce)) {
    queueMicrotask(() => {
    const channel = new MessageChannel()
    const bridgeKey = `__algoUserscriptBridge_${nonce}`
    channel.port1.start()
    contextBridge.exposeInMainWorld(bridgeKey, {
      send: (message: unknown): void => { channel.port1.postMessage(message) },
      subscribe: (listener: (message: unknown) => void): void => {
        channel.port1.onmessage = event => { listener(event.data) }
      },
    })
    try {
      const executed = contextBridge.executeInMainWorld({
        func: (runtime: {
          catalogKey: string
          catalogName: string
          payload: {
            handshakeId: string
            targetOrigin: string
            generation: number
            handlerVersion: string
            scripts: typeof response.scripts
          }
          bridgeKey: string
        }) => {
          const catalog = (globalThis as typeof globalThis & Record<string, unknown>)[runtime.catalogName]
          if (!(catalog instanceof Map)) return false
          const entry = (catalog as UserScriptCompiledCatalog).get(runtime.catalogKey)
          const bridge = (globalThis as typeof globalThis & Record<string, unknown>)[runtime.bridgeKey] as {
            send: (message: unknown) => void
            subscribe: (listener: (message: unknown) => void) => void
          } | undefined
          Reflect.deleteProperty(globalThis, runtime.bridgeKey)
          if (!entry) return false
          if (!bridge) return false
          const descriptors = new Map(entry.payload.scripts.map(script => [
            `${script.id}\u0000${script.revision}`,
            script,
          ]))
          const scripts = runtime.payload.scripts.flatMap((script) => {
            const descriptor = descriptors.get(`${script.id}\u0000${script.revision}`)
            return descriptor ? [{ ...descriptor, values: script.values }] : []
          })
          entry.func({ ...entry.payload, ...runtime.payload, scripts }, bridge.send, bridge.subscribe)
          return true
        },
        args: [{
          catalogKey: catalogGenerationKey(response.generation),
          catalogName: USER_SCRIPT_COMPILED_CATALOG_KEY,
          payload: {
            handshakeId: nonce,
            targetOrigin,
            generation: response.generation,
            handlerVersion: process.versions.electron ?? '',
            scripts: response.scripts,
          },
          bridgeKey,
        }],
      }) as unknown
      if (executed !== true) {
        console.error('[UserScript] Runtime catalog unavailable')
        channel.port1.close()
        channel.port2.close()
      } else {
        ipcRenderer.postMessage(USER_SCRIPT_RUNTIME_PORT_CHANNEL, {
          nonce,
          frameUrl,
          generation: response.generation,
        }, [channel.port2])
      }
    }
    catch (error) {
      channel.port1.close()
      channel.port2.close()
      console.error('[UserScript] Runtime bootstrap failed:', errorMessage(error))
    }
    })
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
