/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

interface ProblemRecord {
  id: string
  platform: string
  platform_problem_id: string
  canonical_url: string
  title: string | null
  status: string
  last_visited_at: string | null
  submission_count?: number
}

interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

interface RealtimeSubmissionStatus {
  ipcRegistered: boolean
  supportedAdapterIds: string[]
  lastPage?: {
    url: string
    realtimeAdapterId?: string
    realtimeSupported: boolean
    at: string
  }
  lastHook?: {
    adapterId: string
    url: string
    status: 'success' | 'failed' | 'skipped'
    reason?: string
    error?: string
    at: string
  }
  lastDetection?: {
    senderUrl?: string
    inserted: boolean
    error?: string
    platform?: string
    verdict?: string
    problemId?: string
    at: string
  }
}

interface CookieSafeDomainSummary {
  site_id: string
  domain: string
  cookie_names: string[]
  cookie_count: number
  http_only_count: number
  secure_count: number
  earliest_expires_at: string | null
  last_seen_at: string | null
  sync_excluded: true
}

interface CookieSafeSiteSummary {
  site_id: string
  has_cookies: boolean
  domains: CookieSafeDomainSummary[]
}

interface OverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

interface SubmissionRecord {
  id: string
  problem_id?: string
  platform?: string
  verdict: string
  language?: string | null
  submitted_at?: string | null
}

interface ProblemVisitStats {
  total_visits: number
  total_duration: number
  total_active: number
  avg_duration: number
}

interface ProblemDetailRecord extends ProblemRecord {
  submission_count: number
  ac_count: number
  first_seen_at?: string | null
  submissions?: SubmissionRecord[]
}

interface DailyActiveStats {
  local_day: string
  active_seconds: number
  duration_seconds: number
  visited: number
  solved: number
  submissions: number
  ac: number
}

interface TrendPoint {
  local_day: string
  count: number
}

interface SubmissionTrendPoint {
  local_day: string
  total: number
  ac: number
}

interface TimelineEvent {
  id: string
  event_type: string
  occurred_at: string
  platform: string | null
  url: string | null
  problem_id: string | null
}

interface RevisitStatsItem {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  visit_count: number
  last_visit: string
}

interface WrongProblemItem {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  wrong_count: number
  last_attempt: string
}

interface UnreviewedProblemItem {
  id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  last_visited_at: string
  days_since: number
}

interface PlatformAccount {
  id: string
  platform: string
  handle: string
  display_name?: string | null
  current_rating?: number | null
  peak_rating?: number | null
  last_synced_at?: string | null
  created_at?: string
  updated_at?: string
}

interface RatingHistoryRecord {
  id?: string
  account_id?: string
  platform?: string
  contest_id?: string
  contest_name: string
  rank?: number | null
  rating_before?: number | null
  rating_after: number
  delta: number
  contest_at?: string | null
}

interface ContestResultRecord extends RatingHistoryRecord {}

interface SiteConfigRecord {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  enabled: boolean
  problemUrlPatterns?: string[]
  submitUrlPatterns?: string[]
  cookiePolicy?: string
  adapter?: string
  isBuiltin: boolean
}

type SiteConfigCreateInput = Omit<SiteConfigRecord, 'isBuiltin'>
type SiteConfigUpdateInput = Partial<SiteConfigRecord>

interface SiteImportConflict {
  id: string
  name: string
  existing: SiteConfigRecord
  incoming: SiteConfigRecord
}

interface SiteImportPreview {
  newSites: SiteConfigRecord[]
  conflicts: SiteImportConflict[]
  builtinSkipped: SiteConfigRecord[]
}

interface SiteExportResult {
  success: boolean
  path?: string
  count?: number
  error?: string
}

interface SiteImportResult {
  success: boolean
  preview?: SiteImportPreview
  error?: string
}

interface SiteConfirmImportResult {
  success: boolean
  imported?: number
  overwritten?: number
  error?: string
}

interface LearningDataImportConflict {
  entity_type: string
  entity_id: string
  reason: string
}

interface LearningDataImportPreview {
  valid: boolean
  schema_version?: number
  counts: Record<string, number>
  new_counts: Record<string, number>
  duplicate_counts: Record<string, number>
  conflicts: LearningDataImportConflict[]
  error?: string
}

interface DatabaseBackupResult {
  success: boolean
  path?: string
  error?: string
}

interface LearningDataExportFileResult {
  success: boolean
  path?: string
  counts?: Record<string, number>
  error?: string
}

interface LearningDataImportPreviewResult {
  success: boolean
  preview?: LearningDataImportPreview
  error?: string
}

interface LearningDataImportResult {
  success: boolean
  inserted: Record<string, number>
  updated: Record<string, number>
  skipped: Record<string, number>
  conflicts: LearningDataImportConflict[]
  error?: string
}

interface UserScriptRecord {
  id: string
  name: string
  description: string | null
  version: string | null
  match_urls_json: string
  code: string
  file_path: string | null
  site_ids_json: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

type UserScriptSaveInput = Partial<Omit<UserScriptRecord, 'id' | 'created_at' | 'updated_at'>>

interface NoteRecord {
  id: string
  problem_id?: string | null
  title: string
  content: string
  note_type: string
  word_count: number
  updated_at: string
}

interface TabInfo {
  id: string
  url: string
  title: string
  isActive: boolean
}

interface SaveNoteImageResult {
  markdownUrl: string
}

interface ReviewRecommendation {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  reason: string
  score: number
  source: {
    wrong_count: number
    last_attempt: string
    days_since_attempt: number
    visit_count: number
    has_ac: boolean
  }
}

interface ReviewRecommendationResult {
  generated_at: string
  rule_version: number
  recommendations: ReviewRecommendation[]
}

interface TagWeakness {
  tag: string
  total: number
  solved: number
  attempted: number
  ac_rate: number
  wrong_submissions: number
  total_duration_seconds: number
  weakness_score: number
  evidence: string
}

interface WeaknessAnalysisResult {
  generated_at: string
  rule_version: number
  weaknesses: TagWeakness[]
  data_note: string
}

interface AIOutputSaveInput {
  output_type: string
  title: string
  content: string
  content_markdown?: string
  input_summary?: Record<string, unknown>
  source_refs?: Record<string, unknown>
  model_info?: Record<string, unknown>
}

interface AIOutputRecord extends AIOutputSaveInput {
  id: string
  created_at?: string
  updated_at?: string
}

// --- Coach 桌宠类型（阶段 1 视觉壳） ---

type CoachPetState = 'idle' | 'thinking' | 'alert' | 'celebrate' | 'sleep' | 'focus'

type CoachHintSource = 'local' | 'llm'

interface CoachBubblePayload {
  id: string
  title: string
  message: string
  source: CoachHintSource
  problemId?: string
  eventId?: string
  level?: number
}

type CoachFeedbackType = 'helpful' | 'not_helpful' | 'dismiss' | 'never_today'

interface CoachConfig {
  enabled: boolean
  sound: boolean
  bubbleFrequency: 'low' | 'medium' | 'high'
  position: { x: number; y: number } | null
  scale: number
  opacity: number
}

// --- Coach 阶段 2 类型（事件触发 + 比赛模式） ---

type CoachEventType =
  | 'idle_too_long'
  | 'multiple_wrong'
  | 'same_error'
  | 'review_due'
  | 'long_session'
  | 'first_ac'
  | 'boundary_suspected'
  | 'complexity_warning'

type CoachEventSeverity = 'info' | 'warn' | 'critical'

type CoachScore = number

type CoachInterventionLevel = 0 | 1 | 2 | 3 | 4 | 5

type CoachInterventionSourceType =
  | 'local_rule'
  | 'local_hint'
  | 'llm'
  | 'contest_audit'

type CoachInterventionUserAction =
  | 'shown'
  | 'hint_requested'
  | 'dismissed'
  | 'never_today'
  | 'feedback'
  | 'no_action'

type ProblemSessionPhase = 'reading' | 'coding' | 'stuck'

type StuckLevel = 0 | 1 | 2 | 3

type ProblemSessionStatus = 'active' | 'suspended' | 'closed'

interface CoachEventEvidence {
  verdict?: string
  wrong_count?: number
  same_verdict_repeat?: number
  active_seconds?: number
  submit_count?: number
  problem_rating?: number
  contest_id?: string
  source_url?: string
  [key: string]: unknown
}

interface CoachEvent {
  event_id: string
  session_id: string | null
  event_type: CoachEventType
  severity: CoachEventSeverity
  score: CoachScore
  problem_id: string | null
  platform: string | null
  evidence: CoachEventEvidence
  created_at: string
}

interface ProblemSession {
  session_id: string
  problem_id: string | null
  platform: string
  platform_problem_id: string
  started_at: number
  last_active_at: number
  active_seconds: number
  submit_count: number
  wrong_count: number
  current_status: ProblemSessionStatus
  phase: ProblemSessionPhase
  detected_stuck_level: StuckLevel
  verdict_history: string[]
  problem_rating: number | null
}

interface CoachIntervention {
  intervention_id: string
  event_id: string | null
  trigger_reason: string
  intervention_level: CoachInterventionLevel
  source_type: CoachInterventionSourceType
  message: string
  related_tags: string[]
  user_action: CoachInterventionUserAction
  problem_id: string | null
  platform: string | null
  session_id: string | null
  created_at: string
  is_contest_mode: boolean
  contest_url: string | null
  contest_start: string | null
  contest_end: string | null
  zero_intervention: boolean
}

interface ContestAuditRecord {
  audit_id: string
  contest_url: string
  platform: string
  contest_id: string
  contest_start: string
  contest_end: string
  duration_seconds: number
  zero_intervention: boolean
  had_any_intervention: boolean
  exported_at: string
}

interface CoachStateSnapshot {
  current_session: ProblemSession | null
  is_contest_mode: boolean
  contest: {
    url: string
    platform: string
    contest_id: string
    entered_at: string
  } | null
  pet_state: CoachPetState
  llm_enabled: boolean
  suppressed_types: CoachEventType[]
  last_event_at: string | null
}

interface CoachMetricsSnapshot {
  total_events: number
  events_by_type: Record<CoachEventType, number>
  total_interventions: number
  hint_requested_count: number
  never_today_count: number
  contest_audit_count: number
  contest_total_seconds: number
  since: string
  until: string
}

// --- Coach 阶段 4 类型（过程复盘 + 答辩数据） ---

interface ProblemVisitPoint {
  visit_id: string
  entered_at: string
  left_at: string | null
  duration_seconds: number | null
  active_seconds: number | null
  leave_reason: string | null
  url: string
}

interface TimelineSubmissionPoint {
  submission_id: string
  submitted_at: string
  verdict: string
  language: string | null
  runtime_ms: number | null
}

interface TimelineEventPoint {
  event_id: string
  event_type: CoachEventType
  severity: CoachEventSeverity
  created_at: string
  evidence: CoachEventEvidence
}

interface TimelineInterventionPoint {
  intervention_id: string
  created_at: string
  intervention_level: CoachInterventionLevel
  source_type: CoachInterventionSourceType
  trigger_reason: string
  message: string
  user_action: CoachInterventionUserAction
  is_contest_mode: boolean
}

interface ProblemTimelineData {
  problem_id: string
  platform: string
  platform_problem_id: string
  title: string | null
  canonical_url: string
  status: string
  first_seen_at: string | null
  last_visited_at: string | null
  visits: ProblemVisitPoint[]
  submissions: TimelineSubmissionPoint[]
  events: TimelineEventPoint[]
  interventions: TimelineInterventionPoint[]
  first_ac_at: string | null
  last_activity_at: string | null
}

interface CoachFeedbackRecord {
  feedback_id: string
  intervention_id: string | null
  bubble_id: string | null
  feedback_type: CoachFeedbackType
  event_type: CoachEventType | null
  problem_id: string | null
  local_day: string
  created_at: string
}

interface ProblemAcStatus {
  problem_id: string
  first_ac_at: string | null
}

interface CoachMetricsBundle {
  since: string
  until: string
  events: CoachEvent[]
  interventions: CoachIntervention[]
  feedback: CoachFeedbackRecord[]
  problem_ac_status: ProblemAcStatus[]
}

interface CoachContestModePayload {
  isContestMode: boolean
  contest: { url: string; platform: string; contest_id: string; entered_at: string } | null
}

interface ElectronAPI {
  navigate: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  goHome: () => void
  setSidebarWidth: (width: number) => void
  hideView: () => void
  showView: () => void
  captureBrowserPreview: () => Promise<string | null>
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
  onUrlChanged: (callback: (url: string) => void) => () => void
  listRecentProblems: (limit?: number, platform?: string, status?: string) => Promise<ProblemRecord[]>
  getProblemDetail: (problemId: string) => Promise<ProblemDetailRecord | null>
  deleteProblem: (problemId: string) => Promise<boolean>
  onProblemsUpdated: (callback: () => void) => () => void
  syncCodeforces: (handle: string) => Promise<SyncResult>
  syncVjudge: () => Promise<SyncResult>
  syncCurrentPage: () => Promise<SyncResult>
  getRealtimeSubmissionStatus: () => Promise<RealtimeSubmissionStatus | null>
  getCookieSummaryForSite: (siteId: string) => Promise<CookieSafeSiteSummary>
  getCookieSummaryForDomain: (siteId: string, domain: string) => Promise<CookieSafeDomainSummary>
  getOverviewStats: () => Promise<OverviewStats>
  getDailyActiveStats: (days?: number) => Promise<DailyActiveStats[]>
  getVisitedTrend: (days?: number) => Promise<TrendPoint[]>
  getAcTrend: (days?: number) => Promise<TrendPoint[]>
  getSubmissionTrend: (days?: number) => Promise<SubmissionTrendPoint[]>
  getPlatformDistribution: () => Promise<{ platform: string; count: number }[]>
  getProblemVisitStats: (problemId: string) => Promise<ProblemVisitStats>
  getTimeline: (limit?: number) => Promise<TimelineEvent[]>
  getLastActiveTime: () => Promise<string | null>
  getRevisitStats: (limit?: number) => Promise<RevisitStatsItem[]>
  recomputeDailyStats: (date?: string) => Promise<boolean>
  getStreakDays: () => Promise<{ current: number; longest: number }>
  getWrongProblems: (limit?: number) => Promise<WrongProblemItem[]>
  getUnreviewedProblems: (days?: number, limit?: number) => Promise<UnreviewedProblemItem[]>
  recomputeAllDailyStats: () => Promise<number>
  bindHandle: (platform: string, handle: string) => Promise<{ id: string; handle: string }>
  getAccount: (platform: string, handle: string) => Promise<PlatformAccount | null>
  getAccounts: (platform: string) => Promise<PlatformAccount[]>
  syncCodeforcesRating: (handle: string) => Promise<{ success: boolean; historyCount?: number; inserted?: number; peak?: number; error?: string }>
  getRatingHistory: (accountId: string) => Promise<RatingHistoryRecord[]>
  getCodeforcesAccount: () => Promise<PlatformAccount | null>
  getContestResults: (accountId: string) => Promise<ContestResultRecord[]>
  getAllSites: () => Promise<SiteConfigRecord[]>
  getSiteById: (id: string) => Promise<SiteConfigRecord | null>
  createSite: (data: SiteConfigCreateInput) => Promise<string>
  updateSite: (id: string, data: SiteConfigUpdateInput) => Promise<boolean>
  toggleSite: (id: string, enabled: boolean) => Promise<boolean>
  deleteSite: (id: string) => Promise<boolean>
  exportSitesConfig: () => Promise<SiteExportResult>
  importSitesConfig: () => Promise<SiteImportResult>
  confirmImportSites: (sites: SiteConfigRecord[], overwriteIds: string[]) => Promise<SiteConfirmImportResult>

  // Scripts
  scriptsGetAll: () => Promise<UserScriptRecord[]>
  scriptsSave: (id: string | null, data: UserScriptSaveInput) => Promise<string>
  scriptsImportFile: () => Promise<string | null>
  scriptsOpenFolder: () => Promise<void>
  scriptsToggle: (id: string, enabled: boolean) => Promise<boolean>
  scriptsDelete: (id: string) => Promise<boolean>

  getDefaultHomeUrl: () => Promise<string>
  setDefaultHomeUrl: (url: string) => void
  createDatabaseBackup: () => Promise<DatabaseBackupResult>
  exportLearningData: () => Promise<LearningDataExportFileResult>
  previewLearningDataImport: () => Promise<LearningDataImportPreviewResult>
  confirmLearningDataImport: (overwriteConflicts: boolean) => Promise<LearningDataImportResult>

  // 标签页管理
  createTab: (url?: string) => Promise<string>
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  detachTab: (tabId: string) => void
  getTabList: () => Promise<TabInfo[]>
  onTabListChanged: (callback: (tabs: TabInfo[]) => void) => () => void

  // 笔记（本地题解 Markdown）
  listNotesByProblem: (problemId: string) => Promise<NoteRecord[]>
  getNote: (noteId: string) => Promise<NoteRecord | null>
  createNote: (problemId: string | null, title: string, content: string | null, noteType: string) => Promise<NoteRecord>
  updateNoteTitle: (noteId: string, title: string) => Promise<boolean>
  updateNoteContent: (noteId: string, content: string) => Promise<boolean>
  saveNoteImage: (noteId: string, fileName: string, mimeType: string, data: ArrayBuffer) => Promise<SaveNoteImageResult>
  updateNoteType: (noteId: string, noteType: string) => Promise<boolean>
  deleteNote: (noteId: string) => Promise<boolean>
  getNotesForDelete: (problemId: string) => Promise<NoteRecord[]>
  deleteNotesByProblem: (problemId: string) => Promise<number>
  openNotesDir: () => Promise<void>

  // P6-004: AI 上下文导出
  exportAIContext: () => Promise<Record<string, unknown>>
  exportAIContextMarkdown: () => Promise<string>

  // P6-005 / P6-006: AI 建议与薄弱分析（本地规则引擎）
  getReviewRecommendations: (limit?: number) => Promise<ReviewRecommendationResult>
  getWeaknessAnalysis: (limit?: number) => Promise<WeaknessAnalysisResult>

  // P6-007 / P6-008 / P6-009: AI 输出能力
  getPeriodSummary: (startDate: string, endDate: string) => Promise<Record<string, unknown>>
  getPeriodSummaryMarkdown: (startDate: string, endDate: string) => Promise<string>
  getReviewPlan: (planDays?: number) => Promise<Record<string, unknown>>
  getReviewPlanMarkdown: (planDays?: number) => Promise<string>
  saveAIOutput: (input: AIOutputSaveInput) => Promise<string>
  getAIOutput: (id: string) => Promise<AIOutputRecord | null>
  listAIOutputs: (outputType?: string, limit?: number) => Promise<AIOutputRecord[]>
  deleteAIOutput: (id: string) => Promise<boolean>
  updateAIOutput: (id: string, updates: Partial<Pick<AIOutputSaveInput, 'title' | 'content' | 'content_markdown'>>) => Promise<boolean>

  // Coach 桌宠（阶段 1 视觉壳 + 阶段 2 规则引擎预留接口）
  coachGetPetState: () => Promise<CoachPetState>
  coachSetPetState: (state: CoachPetState) => Promise<boolean>
  coachToggleIgnoreMouseEvents: (ignore: boolean) => Promise<boolean>
  coachStartDrag: (screenX: number, screenY: number) => Promise<boolean>
  coachEndDrag: () => Promise<boolean>
  coachResetPosition: () => Promise<boolean>
  coachGetConfig: () => Promise<CoachConfig>
  coachSaveConfig: (partial: Partial<CoachConfig>) => Promise<boolean>
  coachTestHint: () => Promise<CoachBubblePayload>
  coachShowBubble: (payload: CoachBubblePayload) => Promise<boolean>
  coachDismissBubble: () => Promise<boolean>
  coachTriggerHint: (bubbleId?: string) => Promise<{ accepted: boolean; level: number; note?: string; interventionId?: string }>
  coachDismissHint: (bubbleId?: string) => Promise<boolean>
  coachFeedback: (feedback: { bubbleId?: string; interventionId?: string; type: CoachFeedbackType }) => Promise<boolean>
  coachGetWorkArea: () => Promise<{ x: number; y: number; width: number; height: number }>

  // 阶段 2：规则引擎 + 比赛模式 + 审计日志
  coachGetState: () => Promise<CoachStateSnapshot | null>
  coachGetSession: () => Promise<ProblemSession | null>
  coachGetSessionHistory: (limit?: number) => Promise<ProblemSession[]>
  coachGetMetrics: () => Promise<CoachMetricsSnapshot | null>
  coachListEvents: (limit?: number) => Promise<CoachEvent[]>
  coachListInterventions: (limit?: number) => Promise<CoachIntervention[]>
  coachExportAuditLog: () => Promise<ContestAuditRecord[]>
  // 阶段 4：过程复盘 + 答辩数据
  coachGetProblemTimeline: (problemId: string) => Promise<ProblemTimelineData | null>
  coachGetMetricsBundle: () => Promise<CoachMetricsBundle | null>

  onCoachPetStateChanged: (callback: (state: CoachPetState) => void) => () => void
  onCoachConfigChanged: (callback: (config: CoachConfig) => void) => () => void
  onCoachShowBubble: (callback: (payload: CoachBubblePayload) => void) => () => void
  onCoachDismissBubble: (callback: () => void) => () => void
  onCoachContestModeChanged: (callback: (payload: CoachContestModePayload) => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
}
