import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 浏览器导航
  navigate: (url: string) => ipcRenderer.send('browser:navigate', url),
  goBack: () => ipcRenderer.send('browser:goBack'),
  goForward: () => ipcRenderer.send('browser:goForward'),
  reload: () => ipcRenderer.send('browser:reload'),
  goHome: () => ipcRenderer.send('browser:goHome'),
  setSidebarWidth: (width: number) => ipcRenderer.send('browser:setSidebarWidth', width),
  hideView: () => ipcRenderer.send('browser:hideView'),
  showView: () => ipcRenderer.send('browser:showView'),
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
  getRealtimeSubmissionStatus: () => ipcRenderer.invoke('realtimeSubmission:getStatus'),
  getCookieSummaryForSite: (siteId: string) => ipcRenderer.invoke('cookies:getSiteSummary', siteId) as Promise<CookieSafeSiteSummary>,
  getCookieSummaryForDomain: (siteId: string, domain: string) => ipcRenderer.invoke('cookies:getDomainSummary', siteId, domain) as Promise<CookieSafeDomainSummary>,

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
  createSite: (data: SiteConfigCreateInput) => ipcRenderer.invoke('sites:create', data),
  updateSite: (id: string, data: SiteConfigUpdateInput) => ipcRenderer.invoke('sites:update', id, data),
  toggleSite: (id: string, enabled: boolean) => ipcRenderer.invoke('sites:toggle', id, enabled),
  deleteSite: (id: string) => ipcRenderer.invoke('sites:delete', id),
  exportSitesConfig: () => ipcRenderer.invoke('sites:exportConfig') as Promise<{ success: boolean; path?: string; count?: number; error?: string }>,
  importSitesConfig: () => ipcRenderer.invoke('sites:importConfig') as Promise<SiteImportResult>,
  confirmImportSites: (sites: SiteConfigRecord[], overwriteIds: string[]) => ipcRenderer.invoke('sites:confirmImport', sites, overwriteIds) as Promise<SiteConfirmImportResult>,

  // Scripts
  scriptsGetAll: () => ipcRenderer.invoke('scripts:getAll'),
  scriptsSave: (id: string | null, data: UserScriptSaveInput) => ipcRenderer.invoke('scripts:save', id, data),
  scriptsImportFile: () => ipcRenderer.invoke('scripts:importFile'),
  scriptsOpenFolder: () => ipcRenderer.invoke('scripts:openFolder'),
  scriptsToggle: (id: string, enabled: boolean) => ipcRenderer.invoke('scripts:toggle', id, enabled),
  scriptsDelete: (id: string) => ipcRenderer.invoke('scripts:delete', id),

  // 配置
  getDefaultHomeUrl: () => ipcRenderer.invoke('config:getDefaultHomeUrl'),
  setDefaultHomeUrl: (url: string) => ipcRenderer.send('config:setDefaultHomeUrl', url),

  // 备份与导入导出
  createDatabaseBackup: () => ipcRenderer.invoke('backup:createDatabaseBackup') as Promise<DatabaseBackupResult>,
  exportLearningData: () => ipcRenderer.invoke('backup:exportLearningData') as Promise<LearningDataExportFileResult>,
  previewLearningDataImport: () => ipcRenderer.invoke('backup:previewLearningDataImport') as Promise<LearningDataImportPreviewResult>,
  confirmLearningDataImport: (overwriteConflicts: boolean) => ipcRenderer.invoke('backup:confirmLearningDataImport', overwriteConflicts) as Promise<LearningDataImportResult>,

  // 标签页管理
  createTab: (url?: string) => ipcRenderer.invoke('tab:create', url) as Promise<string>,
  closeTab: (tabId: string) => ipcRenderer.send('tab:close', tabId),
  switchTab: (tabId: string) => ipcRenderer.send('tab:switch', tabId),
  detachTab: (tabId: string) => ipcRenderer.send('tab:detach', tabId),
  getTabList: () => ipcRenderer.invoke('tab:getList'),
  onTabListChanged: (callback: (tabs: TabInfo[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabs: TabInfo[]) => callback(tabs)
    ipcRenderer.on('tab:listChanged', handler)
    return () => {
      ipcRenderer.off('tab:listChanged', handler)
    }
  },

  // 笔记（本地题解 Markdown）
  listNotesByProblem: (problemId: string) => ipcRenderer.invoke('notes:listByProblem', problemId) as Promise<NoteRecord[]>,
  getNote: (noteId: string) => ipcRenderer.invoke('notes:get', noteId) as Promise<NoteRecord | null>,
  createNote: (problemId: string | null, title: string, content: string | null, noteType: string) => ipcRenderer.invoke('notes:create', problemId, title, content, noteType) as Promise<NoteRecord>,
  updateNoteTitle: (noteId: string, title: string) => ipcRenderer.invoke('notes:updateTitle', noteId, title) as Promise<boolean>,
  updateNoteContent: (noteId: string, content: string) => ipcRenderer.invoke('notes:updateContent', noteId, content) as Promise<boolean>,
  saveNoteImage: (noteId: string, fileName: string, mimeType: string, data: ArrayBuffer) => ipcRenderer.invoke('notes:saveImage', noteId, fileName, mimeType, data) as Promise<SaveNoteImageResult>,
  updateNoteType: (noteId: string, noteType: string) => ipcRenderer.invoke('notes:updateType', noteId, noteType) as Promise<boolean>,
  deleteNote: (noteId: string) => ipcRenderer.invoke('notes:delete', noteId) as Promise<boolean>,
  getNotesForDelete: (problemId: string) => ipcRenderer.invoke('notes:getForDelete', problemId) as Promise<NoteRecord[]>,
  deleteNotesByProblem: (problemId: string) => ipcRenderer.invoke('notes:deleteByProblem', problemId) as Promise<number>,
  openNotesDir: () => ipcRenderer.invoke('notes:openDir'),

  // P6-004: AI 上下文导出
  exportAIContext: () => ipcRenderer.invoke('ai:exportContext'),
  exportAIContextMarkdown: () => ipcRenderer.invoke('ai:exportContextMarkdown'),

  // P6-005 / P6-006: AI 建议与薄弱分析（本地规则引擎）
  getReviewRecommendations: (limit?: number) => ipcRenderer.invoke('ai:getReviewRecommendations', limit),
  getWeaknessAnalysis: (limit?: number) => ipcRenderer.invoke('ai:getWeaknessAnalysis', limit),

  // P6-007: 阶段学习总结（本地规则引擎）
  getPeriodSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('ai:getPeriodSummary', startDate, endDate),
  getPeriodSummaryMarkdown: (startDate: string, endDate: string) => ipcRenderer.invoke('ai:getPeriodSummaryMarkdown', startDate, endDate),

  // P6-008: 复习计划生成（本地规则引擎）
  getReviewPlan: (planDays?: number) => ipcRenderer.invoke('ai:getReviewPlan', planDays),
  getReviewPlanMarkdown: (planDays?: number) => ipcRenderer.invoke('ai:getReviewPlanMarkdown', planDays),

  // P6-009: AI 输出本地保存
  saveAIOutput: (input: AIOutputSaveInput) => ipcRenderer.invoke('ai:saveOutput', input),
  getAIOutput: (id: string) => ipcRenderer.invoke('ai:getOutput', id),
  listAIOutputs: (outputType?: string, limit?: number) => ipcRenderer.invoke('ai:listOutputs', outputType, limit),
  deleteAIOutput: (id: string) => ipcRenderer.invoke('ai:deleteOutput', id),
  updateAIOutput: (id: string, updates: Partial<Pick<AIOutputSaveInput, 'title' | 'content' | 'content_markdown'>>) => ipcRenderer.invoke('ai:updateOutput', id, updates),
})
