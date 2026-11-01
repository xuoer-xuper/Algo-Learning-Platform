/**
 * IPC channel 名的唯一来源（主进程 / preload / 架构守卫共用）。
 *
 * 两个不变量：
 * 1. **值即契约**——channel 字符串一经发布就不再改动：渲染进程的 bundle 与主进程的
 *    bundle 可能来自不同次构建，字符串对不上就是静默失联。改名 = 新 channel，不是重构。
 * 2. **注册处零字面量**——`ipcMain.(handle|on)` 与 `ipcRenderer.(invoke|send|on)` 只准
 *    引用这里的常量（架构守卫 `tests/architecture/check-architecture.mjs` 强制）。
 *    拼写错误在编译期就报，而不是等一次静默的 runtime miss。
 *
 * 分组按 channel 前缀的真实域家族组织（`ai:`、`coach:`、`tab:` …），键名是后缀的
 * UPPER_SNAKE 形式；`PROBLEM.UPDATED` 的值是 `problems:updated`（复数前缀是历史 wire
 * 契约，分组键不代表前缀拼写）。主进程→渲染进程的推送与渲染进程→主进程的调用共用
 * 同一个键——`coach:showBubble` 这类双向 channel 两端引用同一常量。
 *
 * 不收录的字符串（曾经被误认成 channel 的邻居，别加回来）：
 * - `__algo_submission_v1`：window.postMessage 桥键，不是 IPC channel（ojBridge.ts）；
 * - `xhr:*` / `value:*` / `runtime:*` / `menu:*` / `clipboard:*`：userscript 运行时
 *   MessagePort 协议的消息 `type` 判别字段（userScriptRuntimeProtocol.ts）；
 * - `persist:oj-main`：session partition 名；`about:blank`、`node:*`：URL 与模块说明符。
 */
export const IPC_CHANNELS = {
  /** `ai:` 域——AI 复习建议、薄弱分析与本地输出存档 */
  AI: {
    DELETE_OUTPUT: 'ai:deleteOutput',
    EXPORT_CONTEXT: 'ai:exportContext',
    EXPORT_CONTEXT_MARKDOWN: 'ai:exportContextMarkdown',
    GET_OUTPUT: 'ai:getOutput',
    GET_PERIOD_SUMMARY: 'ai:getPeriodSummary',
    GET_PERIOD_SUMMARY_MARKDOWN: 'ai:getPeriodSummaryMarkdown',
    GET_REVIEW_PLAN: 'ai:getReviewPlan',
    GET_REVIEW_PLAN_MARKDOWN: 'ai:getReviewPlanMarkdown',
    GET_REVIEW_RECOMMENDATIONS: 'ai:getReviewRecommendations',
    GET_WEAKNESS_ANALYSIS: 'ai:getWeaknessAnalysis',
    LIST_OUTPUTS: 'ai:listOutputs',
    SAVE_OUTPUT: 'ai:saveOutput',
    UPDATE_OUTPUT: 'ai:updateOutput',
  },
  /** `backup:` 域——数据库备份与学习数据导入导出 */
  BACKUP: {
    CONFIRM_LEARNING_DATA_IMPORT: 'backup:confirmLearningDataImport',
    CREATE_DATABASE_BACKUP: 'backup:createDatabaseBackup',
    EXPORT_LEARNING_DATA: 'backup:exportLearningData',
    PREVIEW_LEARNING_DATA_IMPORT: 'backup:previewLearningDataImport',
  },
  /** `browser:` 域——内嵌浏览器壳：导航、缩放、omnibox、查找与上下文菜单 */
  BROWSER: {
    CANCEL_USER_SCRIPT_INSTALL: 'browser:cancelUserScriptInstall',
    FIND_IN_PAGE: 'browser:findInPage',
    FIND_IN_PAGE_RESULT: 'browser:findInPageResult',
    GET_DIAGNOSTICS: 'browser:getDiagnostics',
    GET_USER_SCRIPT_INSTALL: 'browser:getUserScriptInstall',
    GO_BACK: 'browser:goBack',
    GO_FORWARD: 'browser:goForward',
    GO_HOME: 'browser:goHome',
    NAVIGATE: 'browser:navigate',
    OMNIBOX_SUGGEST: 'browser:omniboxSuggest',
    RELOAD: 'browser:reload',
    SET_DOWNLOAD_NOTICE_VISIBLE: 'browser:setDownloadNoticeVisible',
    SET_ERROR_NOTICE_VISIBLE: 'browser:setErrorNoticeVisible',
    SET_OMNIBOX_OPEN: 'browser:setOmniboxOpen',
    SET_SIDEBAR_WIDTH: 'browser:setSidebarWidth',
    SET_ZOOM: 'browser:setZoom',
    SHOW_APP_MENU: 'browser:showAppMenu',
    SHOW_SHELL_CONTEXT_MENU: 'browser:showShellContextMenu',
    SHOW_TAB_CONTEXT_MENU: 'browser:showTabContextMenu',
    URL_CHANGED: 'browser:urlChanged',
    ZOOM_CHANGED: 'browser:zoomChanged',
  },
  /** `coach:` 域——桌宠窗口、规则引擎指标与 LLM 配置 */
  COACH: {
    CHAT: 'coach:chat',
    CONFIG_CHANGED: 'coach:configChanged',
    CONTEST_MODE_CHANGED: 'coach:contestModeChanged',
    DISMISS_BUBBLE: 'coach:dismissBubble',
    DISMISS_DISCLAIMER: 'coach:dismissDisclaimer',
    DISMISS_HINT: 'coach:dismissHint',
    END_DRAG: 'coach:endDrag',
    EXPORT_AUDIT_LOG: 'coach:exportAuditLog',
    FEEDBACK: 'coach:feedback',
    GET_CONFIG: 'coach:getConfig',
    GET_LLM_CONFIG: 'coach:getLlmConfig',
    GET_METRICS: 'coach:getMetrics',
    GET_METRICS_BUNDLE: 'coach:getMetricsBundle',
    GET_PET_STATE: 'coach:getPetState',
    GET_PROBLEM_TIMELINE: 'coach:getProblemTimeline',
    GET_SESSION: 'coach:getSession',
    GET_SESSION_HISTORY: 'coach:getSessionHistory',
    GET_STATE: 'coach:getState',
    GET_WORK_AREA: 'coach:getWorkArea',
    LIST_EVENTS: 'coach:listEvents',
    LIST_INTERVENTIONS: 'coach:listInterventions',
    PET_CLICK: 'coach:petClick',
    PET_STATE_CHANGED: 'coach:petStateChanged',
    REQUEST_HINT: 'coach:requestHint',
    RESET_POSITION: 'coach:resetPosition',
    SAVE_CONFIG: 'coach:saveConfig',
    SAVE_LLM_API_KEY: 'coach:saveLlmApiKey',
    SAVE_LLM_CONFIG: 'coach:saveLlmConfig',
    SET_PET_STATE: 'coach:setPetState',
    SHOW_BUBBLE: 'coach:showBubble',
    START_DRAG: 'coach:startDrag',
    TEST_HINT: 'coach:testHint',
    TEST_LLM_CONNECTION: 'coach:testLlmConnection',
    TOGGLE_IGNORE_MOUSE_EVENTS: 'coach:toggleIgnoreMouseEvents',
    TRIGGER_HINT: 'coach:triggerHint',
  },
  /** `config:` 域——主题、搜索引擎与首页快捷方式 */
  CONFIG: {
    GET_HOME_SHORTCUTS: 'config:getHomeShortcuts',
    GET_SEARCH_ENGINE: 'config:getSearchEngine',
    GET_THEME: 'config:getTheme',
    SET_SEARCH_ENGINE: 'config:setSearchEngine',
    SET_THEME: 'config:setTheme',
  },
  /** `cookies:` 域——站点 cookie 的脱敏摘要 */
  COOKIES: {
    GET_DOMAIN_SUMMARY: 'cookies:getDomainSummary',
    GET_SITE_SUMMARY: 'cookies:getSiteSummary',
  },
  /** `credentials:` 域——凭据管理与自动填充/捕获的提示流 */
  CREDENTIALS: {
    AUTOFILL_PROMPT: 'credentials:autofillPrompt',
    AUTOFILL_RESPOND: 'credentials:autofillRespond',
    CAPTURE_PROMPT: 'credentials:capturePrompt',
    CAPTURE_RESPOND: 'credentials:captureRespond',
    CAPTURE_RESULT: 'credentials:captureResult',
    DELETE: 'credentials:delete',
    LIST: 'credentials:list',
    RENAME: 'credentials:rename',
  },
  /** 主进程→渲染进程的下载结果推送 */
  DOWNLOAD: {
    RESULT: 'download:result',
  },
  /** 渲染进程调试日志进主进程（注册在 coach IPC，供任何渲染窗使用） */
  DIAGNOSTICS: {
    LOG_TO_MAIN: 'log-to-main',
  },
  /** `notes:` 域——本地题解 Markdown */
  NOTES: {
    CREATE: 'notes:create',
    DELETE: 'notes:delete',
    DELETE_BY_PROBLEM: 'notes:deleteByProblem',
    GET: 'notes:get',
    GET_FOR_DELETE: 'notes:getForDelete',
    LIST_BY_PROBLEM: 'notes:listByProblem',
    OPEN_DIR: 'notes:openDir',
    SAVE_IMAGE: 'notes:saveImage',
    UPDATE_CONTENT: 'notes:updateContent',
    UPDATE_TITLE: 'notes:updateTitle',
    UPDATE_TYPE: 'notes:updateType',
  },
  /**
   * `oj-*` 域——OJ 隔离 preload（`browser/ojPreload.ts`）与主进程之间的 channel。
   * 前缀是 `oj-credentials:` / `oj-submission:`（连字符域），这些 channel 不进壳
   * preload：凭据载荷绝不能从 shell renderer 触达。
   */
  OJ: {
    CREDENTIALS_CAPTURE: 'oj-credentials:capture',
    CREDENTIALS_FILL: 'oj-credentials:fill',
    SUBMISSION_DETECTED: 'oj-submission:detected',
    SUBMISSION_GET_TOKEN: 'oj-submission:getDocumentToken',
  },
  /** `problem:` 域——题目列表/详情；UPDATED 的值是历史前缀 `problems:updated` */
  PROBLEM: {
    DELETE: 'problem:delete',
    GET_DETAIL: 'problem:getDetail',
    LIST_RECENT: 'problem:listRecent',
    UPDATED: 'problems:updated',
  },
  /** `rating:` 域——CF 账号绑定与比赛数据 */
  RATING: {
    BIND_HANDLE: 'rating:bindHandle',
    GET_ACCOUNT: 'rating:getAccount',
    GET_ACCOUNTS: 'rating:getAccounts',
    GET_CODEFORCES_ACCOUNT: 'rating:getCodeforcesAccount',
    GET_CONTEST_RESULTS: 'rating:getContestResults',
    GET_HISTORY: 'rating:getHistory',
    SYNC_CODEFORCES: 'rating:syncCodeforces',
  },
  /** `realtimeSubmission:` 域——实时提交状态查询 */
  REALTIME_SUBMISSION: {
    GET_STATUS: 'realtimeSubmission:getStatus',
  },
  /** `scripts:` 域——用户脚本的增删改查、编辑器与远程安装流 */
  SCRIPTS: {
    CANCEL_REMOTE_INSTALL: 'scripts:cancelRemoteInstall',
    CHECK_UPDATES: 'scripts:checkUpdates',
    CONFIRM_REMOTE_INSTALL: 'scripts:confirmRemoteInstall',
    DELETE: 'scripts:delete',
    GET_ALL: 'scripts:getAll',
    GET_CODE: 'scripts:getCode',
    GET_REMOTE_INSTALL_PREVIEW: 'scripts:getRemoteInstallPreview',
    IMPORT_FILE: 'scripts:importFile',
    OPEN_EDITOR: 'scripts:openEditor',
    OPEN_FOLDER: 'scripts:openFolder',
    SAVE: 'scripts:save',
    TOGGLE: 'scripts:toggle',
  },
  /** `sites:` 域——站点配置与导入导出 */
  SITES: {
    CONFIRM_IMPORT: 'sites:confirmImport',
    CREATE: 'sites:create',
    DELETE: 'sites:delete',
    EXPORT_CONFIG: 'sites:exportConfig',
    GET_ALL: 'sites:getAll',
    GET_BY_ID: 'sites:getById',
    IMPORT_CONFIG: 'sites:importConfig',
    TOGGLE: 'sites:toggle',
  },
  /** `stats:` 域——统计面板的取数与重算 */
  STATS: {
    GET_AC_TREND: 'stats:getAcTrend',
    GET_DAILY_ACTIVE: 'stats:getDailyActive',
    GET_LAST_ACTIVE_TIME: 'stats:getLastActiveTime',
    GET_OVERVIEW: 'stats:getOverview',
    GET_PLATFORM_DISTRIBUTION: 'stats:getPlatformDistribution',
    GET_PROBLEM_VISIT_STATS: 'stats:getProblemVisitStats',
    GET_REVISIT_STATS: 'stats:getRevisitStats',
    GET_STREAK_DAYS: 'stats:getStreakDays',
    GET_SUBMISSION_TREND: 'stats:getSubmissionTrend',
    GET_TIMELINE: 'stats:getTimeline',
    GET_UNREVIEWED: 'stats:getUnreviewed',
    GET_VISITED_TREND: 'stats:getVisitedTrend',
    GET_WRONG_PROBLEMS: 'stats:getWrongProblems',
    RECOMPUTE_ALL: 'stats:recomputeAll',
    RECOMPUTE_DAILY: 'stats:recomputeDaily',
  },
  /** `submissions:` 域——提交记录同步 */
  SUBMISSIONS: {
    SYNC_CODEFORCES: 'submissions:syncCodeforces',
    SYNC_CURRENT_PAGE: 'submissions:syncCurrentPage',
    SYNC_VJUDGE: 'submissions:syncVjudge',
  },
  /** `tab:` 域——标签页生命周期与拖拽 */
  TAB: {
    CLOSE: 'tab:close',
    CREATE: 'tab:create',
    DISMISS_UNRESPONSIVE: 'tab:dismissUnresponsive',
    FINISH_DRAG: 'tab:finishDrag',
    GET_LIST: 'tab:getList',
    LIST_CHANGED: 'tab:listChanged',
    MOVE_TO_NEW_WINDOW: 'tab:moveToNewWindow',
    OPEN_INTERNAL: 'tab:openInternal',
    RELOAD: 'tab:reload',
    REOPEN_CLOSED: 'tab:reopenClosed',
    REORDER: 'tab:reorder',
    SWITCH: 'tab:switch',
  },
  /** 主进程→渲染进程的一对多 UI 指令（导航拦截、聚焦地址栏等） */
  UI: {
    COMMAND: 'ui:command',
  },
  /** `userscript:` 域——宿主权限提示流（壳 preload 可见） */
  USERSCRIPT: {
    GET_HOST_PERMISSION_PROMPT: 'userscript:getHostPermissionPrompt',
    HOST_PERMISSION_REQUESTED: 'userscript:hostPermissionRequested',
    RESPOND_HOST_PERMISSION: 'userscript:respondHostPermission',
  },
  /**
   * `userscript-runtime:` 域——userscript 引导 preload 的握手与 MessagePort 移交。
   * 值原先定义在 `electron/scripts/userScriptRuntimeProtocol.ts`（现为 re-export），
   * 收进这里是为了让"全部 channel 在同一份清单"成立。
   */
  USERSCRIPT_RUNTIME: {
    INIT: 'userscript-runtime:init',
    PORT: 'userscript-runtime:port',
  },
  /** `window:` 域——无框窗口的最小化/最大化/关闭与状态推送 */
  WINDOW: {
    CLOSE: 'window:close',
    IS_MAXIMIZED: 'window:isMaximized',
    MAXIMIZE: 'window:maximize',
    MAXIMIZED: 'window:maximized',
    MINIMIZE: 'window:minimize',
  },
} as const

/**
 * 全部合法 IPC channel 的闭集。注册/发送处的 `channel` 参数都用它收窄。
 *
 * 不能写成 `(typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS][keyof …]` 的两段直取：
 * `keyof` 作用在域的**并集**上得到的是各域键集的**交集**（各域键名互不相同，交集为空），
 * 整个类型会塌成 `never`。先按域映射出每个域自己的叶子并集、再对域取并，才是闭集。
 */
export type IpcChannel = {
  [
    Group in keyof typeof IPC_CHANNELS
  ]: (typeof IPC_CHANNELS)[Group][keyof (typeof IPC_CHANNELS)[Group]]
}[keyof typeof IPC_CHANNELS]
