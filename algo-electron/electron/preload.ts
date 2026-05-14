import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 浏览器导航
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  goBack: () => ipcRenderer.send('browser:goBack'),
  goForward: () => ipcRenderer.send('browser:goForward'),
  reload: () => ipcRenderer.send('browser:reload'),
  setSidebarWidth: (width: number) => ipcRenderer.send('browser:setSidebarWidth', width),
  hideBrowserView: () => ipcRenderer.send('browser:hideView'),
  showBrowserView: () => ipcRenderer.send('browser:showView'),
  onUrlChanged: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url)
    ipcRenderer.on('browser:urlChanged', handler)
    return () => {
      ipcRenderer.off('browser:urlChanged', handler)
    }
  },

  // 题目
  listRecentProblems: (limit?: number) => ipcRenderer.invoke('problem:listRecent', limit),
  onProblemsUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('problems:updated', handler)
    return () => {
      ipcRenderer.off('problems:updated', handler)
    }
  },

  // 提交同步
  syncCodeforces: (handle: string) => ipcRenderer.invoke('submissions:syncCodeforces', handle),
  syncVjudge: () => ipcRenderer.invoke('submissions:syncVjudge'),
  syncCurrentPage: () => ipcRenderer.invoke('submissions:syncCurrentPage'),
  debugPageStructure: () => ipcRenderer.invoke('debug:pageStructure'),

  // 统计
  getOverviewStats: () => ipcRenderer.invoke('stats:getOverview'),

  // 配置
  getDefaultHomeUrl: () => ipcRenderer.invoke('config:getDefaultHomeUrl'),
  setDefaultHomeUrl: (url: string) => ipcRenderer.send('config:setDefaultHomeUrl', url),
})
