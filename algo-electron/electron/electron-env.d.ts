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
  setSidebarWidth: (width: number) => void
  hideBrowserView: () => void
  showBrowserView: () => void
  onUrlChanged: (callback: (url: string) => void) => () => void
  listRecentProblems: (limit?: number) => Promise<ProblemRecord[]>
  onProblemsUpdated: (callback: () => void) => () => void
  getOverviewStats: () => Promise<OverviewStats>
  getDefaultHomeUrl: () => Promise<string>
  setDefaultHomeUrl: (url: string) => void
}

interface Window {
  electronAPI: ElectronAPI
}
