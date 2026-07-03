export interface SettingsOverviewStats {
  totalProblems: number
  todayVisited: number
  platformDistribution: { platform: string; count: number }[]
  lastActiveTime: string | null
}

export interface RealtimeSubmissionStatus {
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

export interface CodeforcesAccount {
  id?: string
  handle: string
  current_rating?: number | null
  peak_rating?: number | null
}
