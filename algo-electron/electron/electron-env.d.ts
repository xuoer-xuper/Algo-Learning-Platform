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
}

interface SyncResult {
  platform: string
  fetched: number
  inserted: number
  error?: string
}

interface OverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

interface ElectronAPI {
  navigate: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  goHome: () => void
  setSidebarWidth: (width: number) => void
  hideBrowserView: () => void
  showBrowserView: () => void
  captureBrowserPreview: () => Promise<string | null>
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
  onUrlChanged: (callback: (url: string) => void) => () => void
  listRecentProblems: (limit?: number, platform?: string, status?: string) => Promise<ProblemRecord[]>
  getProblemDetail: (problemId: string) => Promise<any>
  deleteProblem: (problemId: string) => Promise<boolean>
  onProblemsUpdated: (callback: () => void) => () => void
  syncCodeforces: (handle: string) => Promise<SyncResult>
  syncVjudge: () => Promise<SyncResult>
  syncCurrentPage: () => Promise<SyncResult>
  getOverviewStats: () => Promise<OverviewStats>
  getDailyActiveStats: (days?: number) => Promise<any[]>
  getVisitedTrend: (days?: number) => Promise<any[]>
  getAcTrend: (days?: number) => Promise<any[]>
  getSubmissionTrend: (days?: number) => Promise<any[]>
  getPlatformDistribution: () => Promise<{ platform: string; count: number }[]>
  getProblemVisitStats: (problemId: string) => Promise<any>
  getTimeline: (limit?: number) => Promise<any[]>
  getLastActiveTime: () => Promise<string | null>
  getRevisitStats: (limit?: number) => Promise<any[]>
  recomputeDailyStats: (date?: string) => Promise<boolean>
  getStreakDays: () => Promise<{ current: number; longest: number }>
  getWrongProblems: (limit?: number) => Promise<any[]>
  getUnreviewedProblems: (days?: number, limit?: number) => Promise<any[]>
  recomputeAllDailyStats: () => Promise<number>
  bindHandle: (platform: string, handle: string) => Promise<{ id: string; handle: string }>
  getAccount: (platform: string, handle: string) => Promise<any>
  getAccounts: (platform: string) => Promise<any[]>
  syncCodeforcesRating: (handle: string) => Promise<{ success: boolean; historyCount?: number; inserted?: number; peak?: number; error?: string }>
  getRatingHistory: (accountId: string) => Promise<any[]>
  getCodeforcesAccount: () => Promise<any>
  getContestResults: (accountId: string) => Promise<any[]>
  getAllSites: () => Promise<any[]>
  getSiteById: (id: string) => Promise<any>
  createSite: (data: any) => Promise<string>
  updateSite: (id: string, data: any) => Promise<boolean>
  toggleSite: (id: string, enabled: boolean) => Promise<boolean>
  deleteSite: (id: string) => Promise<boolean>
  exportSitesConfig: () => Promise<{ success: boolean; path?: string; count?: number; error?: string }>
  importSitesConfig: () => Promise<{ success: boolean; preview?: any; error?: string }>
  confirmImportSites: (sites: any[], overwriteIds: string[]) => Promise<{ success: boolean; imported?: number; overwritten?: number; error?: string }>
  getDefaultHomeUrl: () => Promise<string>
  setDefaultHomeUrl: (url: string) => void
}

interface Window {
  electronAPI: ElectronAPI
}
