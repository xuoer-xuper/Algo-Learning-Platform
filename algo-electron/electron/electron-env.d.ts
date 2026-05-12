/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface ElectronAPI {
  navigate: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  onUrlChanged: (callback: (url: string) => void) => void
}

interface Window {
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: ElectronAPI
}
