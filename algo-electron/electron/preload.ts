import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 浏览器导航
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  goBack: () => ipcRenderer.send('browser:goBack'),
  goForward: () => ipcRenderer.send('browser:goForward'),
  reload: () => ipcRenderer.send('browser:reload'),
  goHome: () => ipcRenderer.send('browser:goHome'),
  setSidebarWidth: (width: number) => ipcRenderer.send('browser:setSidebarWidth', width),
  hideBrowserView: () => ipcRenderer.send('browser:hideView'),
  showBrowserView: () => ipcRenderer.send('browser:showView'),
  captureBrowserPreview: () => ipcRenderer.invoke('browser:capturePreview') as Promise<string | null>,
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized', handler)
    return () => {
      ipcRenderer.off('window:maximized', handler)
    }
  },
  onUrlChanged: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url)
    ipcRenderer.on('browser:urlChanged', handler)
    return () => {
      ipcRenderer.off('browser:urlChanged', handler)
    }
  },

  // 题目
  listRecentProblems: (limit?: number, platform?: string, status?: string) =>
    ipcRenderer.invoke('problem:listRecent', limit, platform, status),
  getProblemDetail: (problemId: string) => ipcRenderer.invoke('problem:getDetail', problemId),
  deleteProblem: (problemId: string) => ipcRenderer.invoke('problem:delete', problemId) as Promise<boolean>,
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

  // 统计
  getOverviewStats: () => ipcRenderer.invoke('stats:getOverview'),
  getDailyActiveStats: (days?: number) => ipcRenderer.invoke('stats:getDailyActive', days),
  getVisitedTrend: (days?: number) => ipcRenderer.invoke('stats:getVisitedTrend', days),
  getAcTrend: (days?: number) => ipcRenderer.invoke('stats:getAcTrend', days),
  getSubmissionTrend: (days?: number) => ipcRenderer.invoke('stats:getSubmissionTrend', days),
  getPlatformDistribution: () => ipcRenderer.invoke('stats:getPlatformDistribution'),
  getProblemVisitStats: (problemId: string) => ipcRenderer.invoke('stats:getProblemVisitStats', problemId),
  getTimeline: (limit?: number) => ipcRenderer.invoke('stats:getTimeline', limit),
  getLastActiveTime: () => ipcRenderer.invoke('stats:getLastActiveTime'),
  getRevisitStats: (limit?: number) => ipcRenderer.invoke('stats:getRevisitStats', limit),
  recomputeDailyStats: (date?: string) => ipcRenderer.invoke('stats:recomputeDaily', date),
  getStreakDays: () => ipcRenderer.invoke('stats:getStreakDays'),
  getWrongProblems: (limit?: number) => ipcRenderer.invoke('stats:getWrongProblems', limit),
  getUnreviewedProblems: (days?: number, limit?: number) => ipcRenderer.invoke('stats:getUnreviewed', days, limit),
  recomputeAllDailyStats: () => ipcRenderer.invoke('stats:recomputeAll'),

  // Rating
  bindHandle: (platform: string, handle: string) => ipcRenderer.invoke('rating:bindHandle', platform, handle),
  getAccount: (platform: string, handle: string) => ipcRenderer.invoke('rating:getAccount', platform, handle),
  getAccounts: (platform: string) => ipcRenderer.invoke('rating:getAccounts', platform),
  syncCodeforcesRating: (handle: string) => ipcRenderer.invoke('rating:syncCodeforces', handle),
  getRatingHistory: (accountId: string) => ipcRenderer.invoke('rating:getHistory', accountId),
  getCodeforcesAccount: () => ipcRenderer.invoke('rating:getCodeforcesAccount'),
  getContestResults: (accountId: string) => ipcRenderer.invoke('rating:getContestResults', accountId),

  // 站点管理
  getAllSites: () => ipcRenderer.invoke('sites:getAll'),
  getSiteById: (id: string) => ipcRenderer.invoke('sites:getById', id),
  createSite: (data: any) => ipcRenderer.invoke('sites:create', data),
  updateSite: (id: string, data: any) => ipcRenderer.invoke('sites:update', id, data),
  toggleSite: (id: string, enabled: boolean) => ipcRenderer.invoke('sites:toggle', id, enabled),
  deleteSite: (id: string) => ipcRenderer.invoke('sites:delete', id),

  // 配置
  getDefaultHomeUrl: () => ipcRenderer.invoke('config:getDefaultHomeUrl'),
  setDefaultHomeUrl: (url: string) => ipcRenderer.send('config:setDefaultHomeUrl', url),
})
