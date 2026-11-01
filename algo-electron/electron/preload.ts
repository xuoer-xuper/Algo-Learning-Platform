import { ipcRenderer, contextBridge } from 'electron'
import { BROWSER_LAYOUT } from './browser/browserLayout'
import { IPC_CHANNELS } from '../src/shared/constants/channels'

contextBridge.exposeInMainWorld('electronAPI', {
  browserLayout: BROWSER_LAYOUT,
  // 浏览器导航
  navigate: (url: string) => ipcRenderer.send(IPC_CHANNELS.BROWSER.NAVIGATE, url),
  goBack: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_BACK),
  goForward: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_FORWARD),
  reload: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.RELOAD),
  goHome: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_HOME),
  setSidebarWidth: (width: number) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, width),
  getBrowserDiagnostics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER.GET_DIAGNOSTICS) as Promise<BrowserDiagnosticsSnapshot>,
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
  isWindowMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED) as Promise<boolean>,
  onWindowMaximized: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on(IPC_CHANNELS.WINDOW.MAXIMIZED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.WINDOW.MAXIMIZED, handler)
    }
  },
  onUrlChanged: (callback: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url)
    ipcRenderer.on(IPC_CHANNELS.BROWSER.URL_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.BROWSER.URL_CHANGED, handler)
    }
  },
  onUiCommand: (callback: (command: UiCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: UiCommand) => callback(command)
    ipcRenderer.on(IPC_CHANNELS.UI.COMMAND, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.UI.COMMAND, handler)
    }
  },
  findInPage: (tabId: string, command: FindInPageCommand) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BROWSER.FIND_IN_PAGE,
      tabId,
      command,
    ) as Promise<FindInPageViewState | null>,
  onFindInPageResult: (callback: (state: FindInPageViewState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: FindInPageViewState) =>
      callback(state)
    ipcRenderer.on(IPC_CHANNELS.BROWSER.FIND_IN_PAGE_RESULT, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.BROWSER.FIND_IN_PAGE_RESULT, handler)
    }
  },
  setZoom: (tabId: string, command: ZoomCommand) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER.SET_ZOOM, tabId, command) as Promise<ZoomState | null>,
  onZoomChanged: (callback: (state: ZoomState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: ZoomState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.BROWSER.ZOOM_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.BROWSER.ZOOM_CHANGED, handler)
    }
  },
  setDownloadNoticeVisible: (visible: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_DOWNLOAD_NOTICE_VISIBLE, visible),
  setErrorNoticeVisible: (visible: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_ERROR_NOTICE_VISIBLE, visible),
  onDownloadResult: (callback: (result: ManagedDownloadResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: ManagedDownloadResult) =>
      callback(result)
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD.RESULT, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.DOWNLOAD.RESULT, handler)
    }
  },
  getUserScriptInstall: (installId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BROWSER.GET_USER_SCRIPT_INSTALL,
      installId,
    ) as Promise<PendingUserScriptInstall | null>,
  cancelUserScriptInstall: (installId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BROWSER.CANCEL_USER_SCRIPT_INSTALL,
      installId,
    ) as Promise<boolean>,
  getRemoteUserScriptInstallPreview: (installId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SCRIPTS.GET_REMOTE_INSTALL_PREVIEW,
      installId,
    ) as Promise<UserScriptInstallPreview | null>,
  confirmRemoteUserScriptInstall: (installId: string, action: UserScriptInstallAction) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SCRIPTS.CONFIRM_REMOTE_INSTALL,
      installId,
      action,
    ) as Promise<UserScriptInstallInstallResult | null>,
  cancelRemoteUserScriptInstall: (installId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.CANCEL_REMOTE_INSTALL, installId) as Promise<boolean>,
  getUserScriptHostPermissionPrompt: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.USERSCRIPT.GET_HOST_PERMISSION_PROMPT,
    ) as Promise<UserScriptHostPermissionPrompt | null>,
  respondUserScriptHostPermission: (promptId: string, allow: boolean) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.USERSCRIPT.RESPOND_HOST_PERMISSION,
      promptId,
      allow,
    ) as Promise<UserScriptHostPermissionResponse>,
  onUserScriptHostPermissionPrompt: (
    callback: (prompt: UserScriptHostPermissionPrompt) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, prompt: UserScriptHostPermissionPrompt) =>
      callback(prompt)
    ipcRenderer.on(IPC_CHANNELS.USERSCRIPT.HOST_PERMISSION_REQUESTED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.USERSCRIPT.HOST_PERMISSION_REQUESTED, handler)
    }
  },

  // 题目
  listRecentProblems: (limit?: number, platform?: string, status?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.LIST_RECENT, limit, platform, status),
  getProblemDetail: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.GET_DETAIL, problemId),
  deleteProblem: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.DELETE, problemId) as Promise<boolean>,
  onProblemsUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.PROBLEM.UPDATED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.PROBLEM.UPDATED, handler)
    }
  },

  // 提交同步
  syncCodeforces: (handle: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUBMISSIONS.SYNC_CODEFORCES, handle),
  syncVjudge: () => ipcRenderer.invoke(IPC_CHANNELS.SUBMISSIONS.SYNC_VJUDGE),
  syncCurrentPage: () => ipcRenderer.invoke(IPC_CHANNELS.SUBMISSIONS.SYNC_CURRENT_PAGE),
  getRealtimeSubmissionStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.REALTIME_SUBMISSION.GET_STATUS),
  getCookieSummaryForSite: (siteId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.COOKIES.GET_SITE_SUMMARY,
      siteId,
    ) as Promise<CookieSafeSiteSummary>,
  getCookieSummaryForDomain: (siteId: string, domain: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.COOKIES.GET_DOMAIN_SUMMARY,
      siteId,
      domain,
    ) as Promise<CookieSafeDomainSummary>,
  listCredentials: (siteId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.LIST, siteId) as Promise<CredentialSummary[]>,
  deleteCredential: (credentialId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.DELETE, credentialId) as Promise<boolean>,
  renameCredential: (credentialId: string, displayName: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREDENTIALS.RENAME,
      credentialId,
      displayName,
    ) as Promise<CredentialSummary | null>,
  getCredentialAutofillPrompt: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREDENTIALS.AUTOFILL_PROMPT,
    ) as Promise<CredentialAutofillPrompt | null>,
  respondCredentialAutofill: (requestId: string, credentialId: string | null) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREDENTIALS.AUTOFILL_RESPOND,
      requestId,
      credentialId,
    ) as Promise<boolean>,
  onCredentialAutofillPrompt: (callback: (prompt: CredentialAutofillPrompt) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, prompt: CredentialAutofillPrompt) =>
      callback(prompt)
    ipcRenderer.on(IPC_CHANNELS.CREDENTIALS.AUTOFILL_PROMPT, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.CREDENTIALS.AUTOFILL_PROMPT, handler)
    }
  },
  getCredentialCapturePrompt: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREDENTIALS.CAPTURE_PROMPT,
    ) as Promise<CredentialCapturePrompt | null>,
  respondCredentialCapture: (captureId: string, action: CredentialCaptureAction) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREDENTIALS.CAPTURE_RESPOND,
      captureId,
      action,
    ) as Promise<boolean>,
  onCredentialCapturePrompt: (callback: (prompt: CredentialCapturePrompt) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, prompt: CredentialCapturePrompt) =>
      callback(prompt)
    ipcRenderer.on(IPC_CHANNELS.CREDENTIALS.CAPTURE_PROMPT, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.CREDENTIALS.CAPTURE_PROMPT, handler)
    }
  },
  onCredentialCaptureResult: (callback: (result: CredentialCaptureResult) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, result: CredentialCaptureResult) =>
      callback(result)
    ipcRenderer.on(IPC_CHANNELS.CREDENTIALS.CAPTURE_RESULT, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.CREDENTIALS.CAPTURE_RESULT, handler)
    }
  },

  // 统计
  getOverviewStats: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_OVERVIEW),
  getDailyActiveStats: (days?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_DAILY_ACTIVE, days),
  getVisitedTrend: (days?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_VISITED_TREND, days),
  getAcTrend: (days?: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_AC_TREND, days),
  getSubmissionTrend: (days?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_SUBMISSION_TREND, days),
  getPlatformDistribution: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_PLATFORM_DISTRIBUTION),
  getProblemVisitStats: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_PROBLEM_VISIT_STATS, problemId),
  getTimeline: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_TIMELINE, limit),
  getLastActiveTime: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_LAST_ACTIVE_TIME),
  getRevisitStats: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_REVISIT_STATS, limit),
  recomputeDailyStats: (date?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.RECOMPUTE_DAILY, date),
  getStreakDays: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_STREAK_DAYS),
  getWrongProblems: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_WRONG_PROBLEMS, limit),
  getUnreviewedProblems: (days?: number, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_UNREVIEWED, days, limit),
  recomputeAllDailyStats: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.RECOMPUTE_ALL),

  // Rating
  bindHandle: (platform: string, handle: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RATING.BIND_HANDLE, platform, handle),
  getAccount: (platform: string, handle: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_ACCOUNT, platform, handle),
  getAccounts: (platform: string) => ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_ACCOUNTS, platform),
  syncCodeforcesRating: (handle: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RATING.SYNC_CODEFORCES, handle),
  getRatingHistory: (accountId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_HISTORY, accountId),
  getCodeforcesAccount: () => ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_CODEFORCES_ACCOUNT),
  getContestResults: (accountId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_CONTEST_RESULTS, accountId),

  // 站点管理
  getAllSites: () => ipcRenderer.invoke(IPC_CHANNELS.SITES.GET_ALL),
  getSiteById: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SITES.GET_BY_ID, id),
  createSite: (data: SiteConfigCreateInput) => ipcRenderer.invoke(IPC_CHANNELS.SITES.CREATE, data),
  toggleSite: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SITES.TOGGLE, id, enabled),
  deleteSite: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SITES.DELETE, id),
  exportSitesConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SITES.EXPORT_CONFIG) as Promise<SiteExportResult>,
  importSitesConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SITES.IMPORT_CONFIG) as Promise<SiteImportResult>,
  confirmImportSites: (sites: SiteConfigRecord[], overwriteIds: string[]) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SITES.CONFIRM_IMPORT,
      sites,
      overwriteIds,
    ) as Promise<SiteConfirmImportResult>,

  // Scripts
  scriptsGetAll: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.GET_ALL),
  scriptsSave: (id: string, data: UserScriptSaveInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.SAVE, id, data),
  scriptsImportFile: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.IMPORT_FILE),
  scriptsOpenFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.OPEN_FOLDER),
  scriptsGetCode: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.GET_CODE, id) as Promise<UserScriptCodeView>,
  scriptsOpenEditor: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.OPEN_EDITOR, id) as Promise<UserScriptOpenEditorResult>,
  scriptsToggle: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.TOGGLE, id, enabled),
  scriptsDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.DELETE, id),
  scriptsCheckUpdates: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SCRIPTS.CHECK_UPDATES,
    ) as Promise<UserScriptUpdateSummary | null>,

  // 配置
  getHomeShortcuts: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG.GET_HOME_SHORTCUTS) as Promise<string[]>,
  getSearchEngine: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG.GET_SEARCH_ENGINE) as Promise<SearchEngineConfig>,
  setSearchEngine: (search: SearchEngineConfig) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CONFIG.SET_SEARCH_ENGINE,
      search,
    ) as Promise<SearchEngineConfig>,
  getTheme: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG.GET_THEME) as Promise<ThemePreference>,
  setTheme: (theme: ThemePreference) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG.SET_THEME, theme) as Promise<ThemePreference>,

  // 备份与导入导出
  createDatabaseBackup: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP.CREATE_DATABASE_BACKUP) as Promise<DatabaseBackupResult>,
  exportLearningData: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BACKUP.EXPORT_LEARNING_DATA,
    ) as Promise<LearningDataExportFileResult>,
  previewLearningDataImport: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BACKUP.PREVIEW_LEARNING_DATA_IMPORT,
    ) as Promise<LearningDataImportPreviewResult>,
  confirmLearningDataImport: (overwriteConflicts: boolean) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.BACKUP.CONFIRM_LEARNING_DATA_IMPORT,
      overwriteConflicts,
    ) as Promise<LearningDataImportResult>,

  // 标签页管理
  createTab: (url?: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB.CREATE, url) as Promise<string>,
  closeTab: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.CLOSE, tabId),
  reopenClosedTab: () => ipcRenderer.invoke(IPC_CHANNELS.TAB.REOPEN_CLOSED) as Promise<string>,
  switchTab: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.SWITCH, tabId),
  reorderTab: (tabId: string, targetIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.TAB.REORDER, tabId, targetIndex) as Promise<boolean>,
  moveTabToNewWindow: (tabId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TAB.MOVE_TO_NEW_WINDOW, tabId) as Promise<boolean>,
  finishTabDrag: (tabId: string, targetIndex: number, screenX: number, screenY: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.TAB.FINISH_DRAG,
      tabId,
      targetIndex,
      screenX,
      screenY,
    ) as Promise<boolean>,
  reloadTab: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.RELOAD, tabId),
  dismissUnresponsiveTab: (tabId: string) =>
    ipcRenderer.send(IPC_CHANNELS.TAB.DISMISS_UNRESPONSIVE, tabId),
  openInternalTab: (page: InternalPage) =>
    ipcRenderer.invoke(IPC_CHANNELS.TAB.OPEN_INTERNAL, page) as Promise<string>,
  getTabList: () => ipcRenderer.invoke(IPC_CHANNELS.TAB.GET_LIST),
  onTabListChanged: (callback: (tabs: TabInfo[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tabs: TabInfo[]) => callback(tabs)
    ipcRenderer.on(IPC_CHANNELS.TAB.LIST_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.TAB.LIST_CHANGED, handler)
    }
  },

  // Omnibox 与应用菜单
  getOmniboxSuggestions: (query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BROWSER.OMNIBOX_SUGGEST, query) as Promise<OmniboxSuggestion[]>,
  setOmniboxOpen: (open: boolean) => ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_OMNIBOX_OPEN, open),
  showAppMenu: (anchor: AppMenuAnchor) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_APP_MENU, anchor),
  showShellContextMenu: (kind: ShellContextMenuKind) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_SHELL_CONTEXT_MENU, kind),
  showTabContextMenu: (tabId: string) =>
    ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_TAB_CONTEXT_MENU, tabId),

  // 笔记（本地题解 Markdown）
  listNotesByProblem: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.LIST_BY_PROBLEM, problemId) as Promise<NoteRecord[]>,
  getNote: (noteId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.GET, noteId) as Promise<NoteRecord | null>,
  createNote: (problemId: string | null, title: string, content: string | null, noteType: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.NOTES.CREATE,
      problemId,
      title,
      content,
      noteType,
    ) as Promise<NoteRecord>,
  updateNoteTitle: (noteId: string, title: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_TITLE, noteId, title) as Promise<boolean>,
  updateNoteContent: (noteId: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_CONTENT, noteId, content) as Promise<boolean>,
  saveNoteImage: (noteId: string, fileName: string, mimeType: string, data: ArrayBuffer) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.NOTES.SAVE_IMAGE,
      noteId,
      fileName,
      mimeType,
      data,
    ) as Promise<SaveNoteImageResult>,
  updateNoteType: (noteId: string, noteType: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_TYPE, noteId, noteType) as Promise<boolean>,
  deleteNote: (noteId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.DELETE, noteId) as Promise<boolean>,
  getNotesForDelete: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.GET_FOR_DELETE, problemId) as Promise<NoteRecord[]>,
  deleteNotesByProblem: (problemId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTES.DELETE_BY_PROBLEM, problemId) as Promise<number>,
  openNotesDir: () => ipcRenderer.invoke(IPC_CHANNELS.NOTES.OPEN_DIR),

  // P6-004: AI 上下文导出
  exportAIContext: () => ipcRenderer.invoke(IPC_CHANNELS.AI.EXPORT_CONTEXT),
  exportAIContextMarkdown: () => ipcRenderer.invoke(IPC_CHANNELS.AI.EXPORT_CONTEXT_MARKDOWN),

  // P6-005 / P6-006: AI 建议与薄弱分析（本地规则引擎）
  getReviewRecommendations: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_REVIEW_RECOMMENDATIONS, limit),
  getWeaknessAnalysis: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_WEAKNESS_ANALYSIS, limit),

  // P6-007: 阶段学习总结（本地规则引擎）
  getPeriodSummary: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_PERIOD_SUMMARY, startDate, endDate),
  getPeriodSummaryMarkdown: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_PERIOD_SUMMARY_MARKDOWN, startDate, endDate),

  // P6-008: 复习计划生成（本地规则引擎）
  getReviewPlan: (planDays?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_REVIEW_PLAN, planDays),
  getReviewPlanMarkdown: (planDays?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.GET_REVIEW_PLAN_MARKDOWN, planDays),

  // P6-009: AI 输出本地保存
  saveAIOutput: (input: AIOutputSaveInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.SAVE_OUTPUT, input),
  getAIOutput: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.GET_OUTPUT, id),
  listAIOutputs: (outputType?: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI.LIST_OUTPUTS, outputType, limit),
  deleteAIOutput: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.AI.DELETE_OUTPUT, id),
  updateAIOutput: (
    id: string,
    updates: Partial<Pick<AIOutputSaveInput, 'title' | 'content' | 'content_markdown'>>,
  ) => ipcRenderer.invoke(IPC_CHANNELS.AI.UPDATE_OUTPUT, id, updates),

  // Coach 桌宠（阶段 1 视觉壳 + 阶段 2 规则引擎预留接口）
  coachGetPetState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_PET_STATE) as Promise<CoachPetState>,
  coachSetPetState: (state: CoachPetState) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.SET_PET_STATE, state) as Promise<boolean>,
  coachToggleIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.TOGGLE_IGNORE_MOUSE_EVENTS, ignore) as Promise<boolean>,
  coachStartDrag: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.START_DRAG) as Promise<boolean>,
  coachEndDrag: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.END_DRAG) as Promise<boolean>,
  coachResetPosition: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.RESET_POSITION) as Promise<boolean>,
  coachGetConfig: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_CONFIG) as Promise<CoachConfig>,
  coachSaveConfig: (partial: Partial<CoachConfig>) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_CONFIG, partial) as Promise<boolean>,
  coachTestHint: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.TEST_HINT) as Promise<CoachBubblePayload>,
  coachShowBubble: (payload: CoachBubblePayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.SHOW_BUBBLE, payload) as Promise<boolean>,
  coachDismissBubble: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.DISMISS_BUBBLE) as Promise<boolean>,
  coachTriggerHint: (bubbleId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.TRIGGER_HINT, bubbleId) as Promise<{
      accepted: boolean
      level: number
      note?: string
      interventionId?: string
    }>,
  coachDismissHint: (bubbleId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.DISMISS_HINT, bubbleId) as Promise<boolean>,
  coachFeedback: (feedback: {
    bubbleId?: string
    interventionId?: string
    type: CoachFeedbackType
  }) => ipcRenderer.invoke(IPC_CHANNELS.COACH.FEEDBACK, feedback) as Promise<boolean>,
  coachDismissDisclaimer: (permanent: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.DISMISS_DISCLAIMER, permanent) as Promise<boolean>,
  coachPetClick: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.PET_CLICK) as Promise<{
      triggered: boolean
      level: number
      llmEnabled: boolean
      note?: string
    }>,
  coachChat: (params: {
    message: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.CHAT, params) as Promise<{
      reply: string
      success: boolean
      error?: string
    }>,
  coachRequestHint: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.REQUEST_HINT) as Promise<{
      message: string
      success: boolean
      error?: string
    }>,
  coachGetWorkArea: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_WORK_AREA) as Promise<{
      x: number
      y: number
      width: number
      height: number
    }>,

  // 阶段 2：规则引擎 + 比赛模式 + 审计日志
  coachGetState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_STATE) as Promise<CoachStateSnapshot | null>,
  coachGetSession: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_SESSION) as Promise<ProblemSession | null>,
  coachGetSessionHistory: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_SESSION_HISTORY, limit) as Promise<ProblemSession[]>,
  coachGetMetrics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_METRICS) as Promise<CoachMetricsSnapshot | null>,
  coachListEvents: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.LIST_EVENTS, limit) as Promise<CoachEvent[]>,
  coachListInterventions: (limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.LIST_INTERVENTIONS, limit) as Promise<
      CoachIntervention[]
    >,
  coachExportAuditLog: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.EXPORT_AUDIT_LOG) as Promise<ContestAuditRecord[]>,
  // 阶段 4：过程复盘 + 答辩数据
  coachGetProblemTimeline: (problemId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.COACH.GET_PROBLEM_TIMELINE,
      problemId,
    ) as Promise<ProblemTimelineData | null>,
  coachGetMetricsBundle: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_METRICS_BUNDLE) as Promise<CoachMetricsBundle | null>,
  // 阶段 5：LLM 配置
  coachGetLlmConfig: () =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_LLM_CONFIG) as Promise<LlmConfigStatus | null>,
  coachSaveLlmApiKey: (apiKey: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_LLM_API_KEY, apiKey) as Promise<boolean>,
  coachSaveLlmConfig: (partial: { base_url?: string; model?: string; enabled?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_LLM_CONFIG, partial) as Promise<boolean>,
  coachTestLlmConnection: (config: { api_key: string; base_url: string; model: string }) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.COACH.TEST_LLM_CONNECTION,
      config,
    ) as Promise<LlmConnectionTestOutput>,
  onCoachPetStateChanged: (callback: (state: CoachPetState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CoachPetState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.COACH.PET_STATE_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.COACH.PET_STATE_CHANGED, handler)
    }
  },
  onCoachConfigChanged: (callback: (config: CoachConfig) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: CoachConfig) => callback(config)
    ipcRenderer.on(IPC_CHANNELS.COACH.CONFIG_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.COACH.CONFIG_CHANGED, handler)
    }
  },
  onCoachShowBubble: (callback: (payload: CoachBubblePayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: CoachBubblePayload) =>
      callback(payload)
    ipcRenderer.on(IPC_CHANNELS.COACH.SHOW_BUBBLE, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.COACH.SHOW_BUBBLE, handler)
    }
  },
  onCoachDismissBubble: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on(IPC_CHANNELS.COACH.DISMISS_BUBBLE, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.COACH.DISMISS_BUBBLE, handler)
    }
  },
  onCoachContestModeChanged: (
    callback: (payload: {
      isContestMode: boolean
      contest: { url: string; platform: string; contest_id: string; entered_at: string } | null
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: {
        isContestMode: boolean
        contest: { url: string; platform: string; contest_id: string; entered_at: string } | null
      },
    ) => callback(payload)
    ipcRenderer.on(IPC_CHANNELS.COACH.CONTEST_MODE_CHANGED, handler)
    return () => {
      ipcRenderer.off(IPC_CHANNELS.COACH.CONTEST_MODE_CHANGED, handler)
    }
  },
})
