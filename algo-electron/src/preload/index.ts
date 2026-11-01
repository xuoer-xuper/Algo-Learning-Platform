import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { z } from 'zod'
import { BROWSER_LAYOUT } from '../../electron/browser/browserLayout'
import { IPC_CHANNELS, type IpcChannel } from '../shared/constants/channels'

/*
 * 阶段 2 R3：renderer 唯一的跨进程入口 `window.api`。
 *
 * 三条不变量（架构守卫与 tests/ipc/* 按此写死，改形状先改守卫）：
 * 1. **域分组**——方法按域对象组织（下面 16 个域），域内方法名不再重复域前缀
 *    （`coachGetPetState` → `coach.getPetState`）。域按 channel 家族划分，个别归并在
 *    域注释里说明（scripts 收编脚本安装流的 `browser:` 通道与 `userscript:` 家族）。
 * 2. **单对象参数**——invoke 一律 `invoke(channel, input)`：多参数通道的 wire 形状在本
 *    阶段从位置参数收成单对象（27 个通道，schema 与主进程 handler 同步改）；单参数
 *    通道保持原形状（标量或已是对象）。没有任何方法收两个及以上参数——preloadSurface
 *    测试按"每个方法至多转发一个实参"断言。
 * 3. **`as Promise<X>` 只住在这里**——`ipcRenderer.invoke` 返回 `Promise<any>`，这是全仓
 *    唯一合法的断言点；X 一律 import 自 `@shared/types`（渲染层类型从 `window.api`
 *    推导：删掉任何一个方法，对应调用点当场 tsc 报错——AC 的 typeof 推导）。
 *
 * 域类型单一来源在 `src/shared/types/*`（R2）；输入形状单一来源在
 * `src/shared/types/ipc/*` 的 zod schema——单对象通道的参数类型用 `InputOf` 从 schema
 * 推导（type-only import，不给 preload 的运行时包加 zod），preload 与主进程 handler
 * 不可能各写一份漂移。
 *
 * R3 同时删除了 31 个"暴露而无消费者"的方法（docs/DESIGN/QUALITY_HARDENING_PLAN.md
 * §9 的清单，实施时 grep 复测一致）；主进程 handler 保留，等对应 UI 落地时随
 * `apiConsumers` 守卫一起放回 preload。
 */

/** channel 的输入 schema 元组 → 该 channel 的输入类型（单对象通道即元组唯一元素）。 */
type InputOf<S extends readonly z.ZodTypeAny[]> = z.infer<S[number]>

// 单对象通道的输入 schema（type-only：只借类型，运行时零开销）。
import type { listRecentInput } from '../shared/types/ipc/problem'
import type {
  findInPageInput,
  respondHostPermissionInput,
  setZoomInput,
  tabFinishDragInput,
  tabReorderInput,
} from '../shared/types/ipc/browser'
import type {
  autofillRespondInput,
  captureRespondInput,
  renameInput,
} from '../shared/types/ipc/credentials'
import type { getUnreviewedInput } from '../shared/types/ipc/stats'
import type { bindHandleInput, getAccountInput } from '../shared/types/ipc/rating'
import type { confirmImportInput, toggleInput as sitesToggleInput } from '../shared/types/ipc/sites'
import type {
  confirmRemoteInstallInput,
  saveInput as scriptsSaveInput,
  toggleInput as scriptsToggleInput,
} from '../shared/types/ipc/scripts'
import type {
  createInput as notesCreateInput,
  saveImageInput,
  updateContentInput,
  updateTitleInput,
  updateTypeInput,
} from '../shared/types/ipc/notes'

// 域类型（输出与既有单对象输入）一律来自 shared/types，本文件不手抄任何形状。
import type { ReviewRecommendationResult, WeaknessAnalysisResult } from '../shared/types/ai'
import type {
  DatabaseBackupResult,
  LearningDataExportFileResult,
  LearningDataImportPreviewResult,
  LearningDataImportResult,
} from '../shared/types/backup'
import type {
  FindInPageViewState,
  InternalPage,
  ManagedDownloadResult,
  TabInfo,
  ZoomState,
} from '../shared/types/browser'
import type {
  CoachBubblePayload,
  CoachConfig,
  CoachContestModePayload,
  CoachFeedbackType,
  CoachMetricsBundle,
  CoachPetState,
  CoachStateSnapshot,
  LlmConfigStatus,
  LlmConnectionTestOutput,
  ProblemTimelineData,
} from '../shared/types/coach'
import type { SearchEngineConfig, ThemePreference } from '../shared/types/config'
import type { CookieSafeSiteSummary } from '../shared/types/cookies'
import type {
  CredentialAutofillPrompt,
  CredentialCapturePrompt,
  CredentialCaptureResult,
  CredentialSummary,
} from '../shared/types/credentials'
import type { NoteRecord, SaveNoteImageResult } from '../shared/types/notes'
import type { OmniboxSuggestion, ProblemDetailRecord, ProblemRecord } from '../shared/types/problem'
import type {
  CodeforcesSyncOutput,
  PlatformAccount,
  RatingHistoryRecord,
} from '../shared/types/rating'
import type {
  PendingUserScriptInstall,
  UserScriptCodeView,
  UserScriptHostPermissionPrompt,
  UserScriptHostPermissionResponse,
  UserScriptInstallInstallResult,
  UserScriptInstallPreview,
  UserScriptOpenEditorResult,
  UserScriptRecord,
  UserScriptUpdateSummary,
} from '../shared/types/scripts'
import type {
  SiteConfigCreateInput,
  SiteConfigRecord,
  SiteConfirmImportResult,
  SiteExportResult,
  SiteImportResult,
} from '../shared/types/sites'
import type {
  OverviewStats,
  ProblemVisitStats,
  RevisitStatsItem,
  TimelineEvent,
  TrendPoint,
  UnreviewedProblemItem,
  WrongProblemItem,
} from '../shared/types/stats'
import type { RealtimeSubmissionStatus, SyncResult } from '../shared/types/submission'
import type { AppMenuAnchor, ShellContextMenuKind, UiCommand } from '../shared/types/window'

/**
 * 主进程 → 渲染进程订阅的统一形态：注册一个剥掉 event 的 handler，返回退订函数。
 *
 * 全部 `on*` 方法都经这里（ipcContracts 测试据此断言"订阅通道闭集 + 主进程有发送方"，
 * preloadSurface 测试据此验证退订后不再收到事件）。`channel` 参数是 `IpcChannel` 闭集，
 * 拼写错误在编译期报。
 */
function subscribe<T>(channel: IpcChannel) {
  return (handler: (payload: T) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: T) => handler(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.off(channel, wrapped)
    }
  }
}

const api = {
  // `browserLayout` 是唯一的非函数成员：main.tsx 同步读取的布局常量（不是 IPC 调用）。
  // 它不是域对象，架构守卫与 preloadSurface 测试都按"这一个例外"写死。
  browserLayout: BROWSER_LAYOUT,

  // `browser:` 家族 + 两条伴生推送（download:result、ui:command）——都是浏览器壳
  // 生命周期里的事件，消费方都在 browserShellApi 一处。
  browser: {
    navigate: (url: string) => ipcRenderer.send(IPC_CHANNELS.BROWSER.NAVIGATE, url),
    goBack: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_BACK),
    goForward: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_FORWARD),
    reload: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.RELOAD),
    goHome: () => ipcRenderer.send(IPC_CHANNELS.BROWSER.GO_HOME),
    setSidebarWidth: (width: number) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_SIDEBAR_WIDTH, width),
    getOmniboxSuggestions: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER.OMNIBOX_SUGGEST, query) as Promise<
        OmniboxSuggestion[]
      >,
    setOmniboxOpen: (open: boolean) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_OMNIBOX_OPEN, open),
    showAppMenu: (anchor: AppMenuAnchor) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_APP_MENU, anchor),
    showShellContextMenu: (kind: ShellContextMenuKind) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_SHELL_CONTEXT_MENU, kind),
    showTabContextMenu: (tabId: string) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SHOW_TAB_CONTEXT_MENU, tabId),
    findInPage: (input: InputOf<typeof findInPageInput>) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.BROWSER.FIND_IN_PAGE,
        input,
      ) as Promise<FindInPageViewState | null>,
    onFindInPageResult: subscribe<FindInPageViewState>(IPC_CHANNELS.BROWSER.FIND_IN_PAGE_RESULT),
    setZoom: (input: InputOf<typeof setZoomInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.BROWSER.SET_ZOOM, input) as Promise<ZoomState | null>,
    onZoomChanged: subscribe<ZoomState>(IPC_CHANNELS.BROWSER.ZOOM_CHANGED),
    setDownloadNoticeVisible: (visible: boolean) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_DOWNLOAD_NOTICE_VISIBLE, visible),
    setErrorNoticeVisible: (visible: boolean) =>
      ipcRenderer.send(IPC_CHANNELS.BROWSER.SET_ERROR_NOTICE_VISIBLE, visible),
    onDownloadResult: subscribe<ManagedDownloadResult>(IPC_CHANNELS.DOWNLOAD.RESULT),
    onUrlChanged: subscribe<string>(IPC_CHANNELS.BROWSER.URL_CHANGED),
    onUiCommand: subscribe<UiCommand>(IPC_CHANNELS.UI.COMMAND),
  },

  tab: {
    create: (url?: string) => ipcRenderer.invoke(IPC_CHANNELS.TAB.CREATE, url) as Promise<string>,
    close: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.CLOSE, tabId),
    reopenClosed: () => ipcRenderer.invoke(IPC_CHANNELS.TAB.REOPEN_CLOSED) as Promise<string>,
    switch: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.SWITCH, tabId),
    reorder: (input: InputOf<typeof tabReorderInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAB.REORDER, input) as Promise<boolean>,
    moveToNewWindow: (tabId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAB.MOVE_TO_NEW_WINDOW, tabId) as Promise<boolean>,
    finishDrag: (input: InputOf<typeof tabFinishDragInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAB.FINISH_DRAG, input) as Promise<boolean>,
    reload: (tabId: string) => ipcRenderer.send(IPC_CHANNELS.TAB.RELOAD, tabId),
    dismissUnresponsive: (tabId: string) =>
      ipcRenderer.send(IPC_CHANNELS.TAB.DISMISS_UNRESPONSIVE, tabId),
    openInternal: (page: InternalPage) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAB.OPEN_INTERNAL, page) as Promise<string>,
    getList: () => ipcRenderer.invoke(IPC_CHANNELS.TAB.GET_LIST) as Promise<TabInfo[]>,
    onListChanged: subscribe<TabInfo[]>(IPC_CHANNELS.TAB.LIST_CHANGED),
  },

  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED) as Promise<boolean>,
    onMaximized: subscribe<boolean>(IPC_CHANNELS.WINDOW.MAXIMIZED),
  },

  problem: {
    listRecent: (input: InputOf<typeof listRecentInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.LIST_RECENT, input) as Promise<ProblemRecord[]>,
    getDetail: (problemId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.PROBLEM.GET_DETAIL,
        problemId,
      ) as Promise<ProblemDetailRecord | null>,
    delete: (problemId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROBLEM.DELETE, problemId) as Promise<boolean>,
    // problems:updated 无 payload（sendToAll 只发 channel 名），回调不收参数。
    onUpdated: subscribe<void>(IPC_CHANNELS.PROBLEM.UPDATED),
  },

  submissions: {
    syncCodeforces: (handle: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBMISSIONS.SYNC_CODEFORCES, handle) as Promise<SyncResult>,
    syncCurrentPage: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBMISSIONS.SYNC_CURRENT_PAGE) as Promise<SyncResult>,
    getRealtimeStatus: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.REALTIME_SUBMISSION.GET_STATUS,
      ) as Promise<RealtimeSubmissionStatus | null>,
  },

  cookies: {
    getSiteSummary: (siteId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.COOKIES.GET_SITE_SUMMARY,
        siteId,
      ) as Promise<CookieSafeSiteSummary>,
  },

  credentials: {
    list: (siteId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.LIST, siteId) as Promise<CredentialSummary[]>,
    delete: (credentialId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.DELETE, credentialId) as Promise<boolean>,
    rename: (input: InputOf<typeof renameInput>) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CREDENTIALS.RENAME,
        input,
      ) as Promise<CredentialSummary | null>,
    getAutofillPrompt: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CREDENTIALS.AUTOFILL_PROMPT,
      ) as Promise<CredentialAutofillPrompt | null>,
    respondAutofill: (input: InputOf<typeof autofillRespondInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.AUTOFILL_RESPOND, input) as Promise<boolean>,
    onAutofillPrompt: subscribe<CredentialAutofillPrompt>(IPC_CHANNELS.CREDENTIALS.AUTOFILL_PROMPT),
    getCapturePrompt: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CREDENTIALS.CAPTURE_PROMPT,
      ) as Promise<CredentialCapturePrompt | null>,
    respondCapture: (input: InputOf<typeof captureRespondInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIALS.CAPTURE_RESPOND, input) as Promise<boolean>,
    onCapturePrompt: subscribe<CredentialCapturePrompt>(IPC_CHANNELS.CREDENTIALS.CAPTURE_PROMPT),
    onCaptureResult: subscribe<CredentialCaptureResult>(IPC_CHANNELS.CREDENTIALS.CAPTURE_RESULT),
  },

  stats: {
    getOverview: () =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_OVERVIEW) as Promise<OverviewStats>,
    getVisitedTrend: (days?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_VISITED_TREND, days) as Promise<TrendPoint[]>,
    getAcTrend: (days?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_AC_TREND, days) as Promise<TrendPoint[]>,
    getProblemVisitStats: (problemId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.STATS.GET_PROBLEM_VISIT_STATS,
        problemId,
      ) as Promise<ProblemVisitStats>,
    getTimeline: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_TIMELINE, limit) as Promise<TimelineEvent[]>,
    getRevisitStats: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_REVISIT_STATS, limit) as Promise<
        RevisitStatsItem[]
      >,
    getStreakDays: () =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_STREAK_DAYS) as Promise<{
        current: number
        longest: number
      }>,
    getWrongProblems: (limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_WRONG_PROBLEMS, limit) as Promise<
        WrongProblemItem[]
      >,
    getUnreviewed: (input: InputOf<typeof getUnreviewedInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATS.GET_UNREVIEWED, input) as Promise<
        UnreviewedProblemItem[]
      >,
    recomputeAll: () => ipcRenderer.invoke(IPC_CHANNELS.STATS.RECOMPUTE_ALL) as Promise<number>,
  },

  ai: {
    getReviewRecommendations: (limit?: number) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI.GET_REVIEW_RECOMMENDATIONS,
        limit,
      ) as Promise<ReviewRecommendationResult>,
    getWeaknessAnalysis: (limit?: number) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI.GET_WEAKNESS_ANALYSIS,
        limit,
      ) as Promise<WeaknessAnalysisResult>,
  },

  notes: {
    listByProblem: (problemId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.LIST_BY_PROBLEM, problemId) as Promise<NoteRecord[]>,
    get: (noteId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.GET, noteId) as Promise<NoteRecord | null>,
    create: (input: InputOf<typeof notesCreateInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, input) as Promise<NoteRecord>,
    updateTitle: (input: InputOf<typeof updateTitleInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_TITLE, input) as Promise<boolean>,
    updateContent: (input: InputOf<typeof updateContentInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_CONTENT, input) as Promise<boolean>,
    saveImage: (input: InputOf<typeof saveImageInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.SAVE_IMAGE, input) as Promise<SaveNoteImageResult>,
    updateType: (input: InputOf<typeof updateTypeInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.UPDATE_TYPE, input) as Promise<boolean>,
    delete: (noteId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.DELETE, noteId) as Promise<boolean>,
    getForDelete: (problemId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.GET_FOR_DELETE, problemId) as Promise<NoteRecord[]>,
    deleteByProblem: (problemId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTES.DELETE_BY_PROBLEM, problemId) as Promise<number>,
    openDir: () => ipcRenderer.invoke(IPC_CHANNELS.NOTES.OPEN_DIR) as Promise<void>,
  },

  sites: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SITES.GET_ALL) as Promise<SiteConfigRecord[]>,
    getById: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SITES.GET_BY_ID, id) as Promise<SiteConfigRecord | null>,
    create: (data: SiteConfigCreateInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.SITES.CREATE, data) as Promise<string>,
    toggle: (input: InputOf<typeof sitesToggleInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SITES.TOGGLE, input) as Promise<boolean>,
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SITES.DELETE, id) as Promise<boolean>,
    exportConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SITES.EXPORT_CONFIG) as Promise<SiteExportResult>,
    importConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SITES.IMPORT_CONFIG) as Promise<SiteImportResult>,
    confirmImport: (input: InputOf<typeof confirmImportInput>) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SITES.CONFIRM_IMPORT,
        input,
      ) as Promise<SiteConfirmImportResult>,
  },

  /*
   * 用户脚本域：`scripts:` 家族 + 脚本安装/宿主授权流（`browser:getUserScriptInstall`
   * 等两条 browser: 通道与 `userscript:` 家族）。它们服务同一个功能面
   * （UserScriptInstallPage / UserScriptManager），渲染层消费方也都在 scriptsApi 一处。
   */
  scripts: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.GET_ALL) as Promise<UserScriptRecord[]>,
    save: (input: InputOf<typeof scriptsSaveInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.SAVE, input) as Promise<string>,
    importFile: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.IMPORT_FILE) as Promise<string | null>,
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.OPEN_FOLDER) as Promise<string>,
    getCode: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.GET_CODE, id) as Promise<UserScriptCodeView>,
    openEditor: (id: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SCRIPTS.OPEN_EDITOR,
        id,
      ) as Promise<UserScriptOpenEditorResult>,
    toggle: (input: InputOf<typeof scriptsToggleInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.TOGGLE, input) as Promise<boolean>,
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.DELETE, id) as Promise<boolean>,
    checkUpdates: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SCRIPTS.CHECK_UPDATES,
      ) as Promise<UserScriptUpdateSummary | null>,
    getPendingInstall: (installId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.BROWSER.GET_USER_SCRIPT_INSTALL,
        installId,
      ) as Promise<PendingUserScriptInstall | null>,
    cancelPendingInstall: (installId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.BROWSER.CANCEL_USER_SCRIPT_INSTALL,
        installId,
      ) as Promise<boolean>,
    getRemoteInstallPreview: (installId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SCRIPTS.GET_REMOTE_INSTALL_PREVIEW,
        installId,
      ) as Promise<UserScriptInstallPreview | null>,
    confirmRemoteInstall: (input: InputOf<typeof confirmRemoteInstallInput>) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SCRIPTS.CONFIRM_REMOTE_INSTALL,
        input,
      ) as Promise<UserScriptInstallInstallResult | null>,
    cancelRemoteInstall: (installId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SCRIPTS.CANCEL_REMOTE_INSTALL, installId) as Promise<boolean>,
    getHostPermissionPrompt: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.USERSCRIPT.GET_HOST_PERMISSION_PROMPT,
      ) as Promise<UserScriptHostPermissionPrompt | null>,
    respondHostPermission: (input: InputOf<typeof respondHostPermissionInput>) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.USERSCRIPT.RESPOND_HOST_PERMISSION,
        input,
      ) as Promise<UserScriptHostPermissionResponse>,
    onHostPermissionPrompt: subscribe<UserScriptHostPermissionPrompt>(
      IPC_CHANNELS.USERSCRIPT.HOST_PERMISSION_REQUESTED,
    ),
  },

  backup: {
    createDatabaseBackup: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.BACKUP.CREATE_DATABASE_BACKUP,
      ) as Promise<DatabaseBackupResult>,
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
  },

  config: {
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
  },

  rating: {
    bindHandle: (input: InputOf<typeof bindHandleInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.RATING.BIND_HANDLE, input) as Promise<{
        id: string
        handle: string
      }>,
    getAccount: (input: InputOf<typeof getAccountInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_ACCOUNT, input) as Promise<PlatformAccount | null>,
    getAccounts: (platform: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_ACCOUNTS, platform) as Promise<PlatformAccount[]>,
    syncCodeforces: (handle: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.RATING.SYNC_CODEFORCES,
        handle,
      ) as Promise<CodeforcesSyncOutput>,
    getHistory: (accountId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.RATING.GET_HISTORY, accountId) as Promise<
        RatingHistoryRecord[]
      >,
    getCodeforcesAccount: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.RATING.GET_CODEFORCES_ACCOUNT,
      ) as Promise<PlatformAccount | null>,
  },

  coach: {
    getPetState: () =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_PET_STATE) as Promise<CoachPetState>,
    toggleIgnoreMouseEvents: (ignore: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.TOGGLE_IGNORE_MOUSE_EVENTS, ignore) as Promise<boolean>,
    startDrag: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.START_DRAG) as Promise<boolean>,
    endDrag: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.END_DRAG) as Promise<boolean>,
    resetPosition: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.RESET_POSITION) as Promise<boolean>,
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_CONFIG) as Promise<CoachConfig>,
    saveConfig: (partial: Partial<CoachConfig>) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_CONFIG, partial) as Promise<boolean>,
    testHint: () => ipcRenderer.invoke(IPC_CHANNELS.COACH.TEST_HINT) as Promise<CoachBubblePayload>,
    triggerHint: (bubbleId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.TRIGGER_HINT, bubbleId) as Promise<{
        accepted: boolean
        level: number
        note?: string
        interventionId?: string
      }>,
    dismissHint: (bubbleId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.DISMISS_HINT, bubbleId) as Promise<boolean>,
    feedback: (feedback: { bubbleId?: string; interventionId?: string; type: CoachFeedbackType }) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.FEEDBACK, feedback) as Promise<boolean>,
    dismissDisclaimer: (permanent: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.DISMISS_DISCLAIMER, permanent) as Promise<boolean>,
    petClick: () =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.PET_CLICK) as Promise<{
        triggered: boolean
        level: number
        llmEnabled: boolean
        note?: string
      }>,
    chat: (params: {
      message: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.CHAT, params) as Promise<{
        reply: string
        success: boolean
        error?: string
      }>,
    getState: () =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_STATE) as Promise<CoachStateSnapshot | null>,
    getProblemTimeline: (problemId: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.COACH.GET_PROBLEM_TIMELINE,
        problemId,
      ) as Promise<ProblemTimelineData | null>,
    getMetricsBundle: () =>
      ipcRenderer.invoke(
        IPC_CHANNELS.COACH.GET_METRICS_BUNDLE,
      ) as Promise<CoachMetricsBundle | null>,
    getLlmConfig: () =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.GET_LLM_CONFIG) as Promise<LlmConfigStatus | null>,
    saveLlmApiKey: (apiKey: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_LLM_API_KEY, apiKey) as Promise<boolean>,
    saveLlmConfig: (partial: { base_url?: string; model?: string; enabled?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH.SAVE_LLM_CONFIG, partial) as Promise<boolean>,
    testLlmConnection: (config: { api_key: string; base_url: string; model: string }) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.COACH.TEST_LLM_CONNECTION,
        config,
      ) as Promise<LlmConnectionTestOutput>,
    onPetStateChanged: subscribe<CoachPetState>(IPC_CHANNELS.COACH.PET_STATE_CHANGED),
    onConfigChanged: subscribe<CoachConfig>(IPC_CHANNELS.COACH.CONFIG_CHANGED),
    onShowBubble: subscribe<CoachBubblePayload>(IPC_CHANNELS.COACH.SHOW_BUBBLE),
    onDismissBubble: subscribe<void>(IPC_CHANNELS.COACH.DISMISS_BUBBLE),
    onContestModeChanged: subscribe<CoachContestModePayload>(
      IPC_CHANNELS.COACH.CONTEST_MODE_CHANGED,
    ),
  },
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: typeof api
  }
}
