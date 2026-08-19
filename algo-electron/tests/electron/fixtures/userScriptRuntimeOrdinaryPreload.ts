import { contextBridge } from 'electron'

contextBridge.executeInMainWorld({
  func: () => {
    const target = globalThis as typeof globalThis & { __runtimeOrder?: string[] }
    target.__runtimeOrder ??= []
    target.__runtimeOrder.push('ordinary-preload')
  },
})
