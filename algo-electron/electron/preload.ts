import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  goBack: () => ipcRenderer.send('browser:go-back'),
  goForward: () => ipcRenderer.send('browser:go-forward'),
  reload: () => ipcRenderer.send('browser:reload'),
  onUrlChanged: (callback: (url: string) => void) => {
    ipcRenderer.on('browser:url-changed', (_event, url) => callback(url))
  },
})
