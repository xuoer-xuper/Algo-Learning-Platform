import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'
import { MOCK_METRICS_BUNDLE } from '../../src/features/coach/mockMetricsBundle'

const now = '2026-07-03T10:00:00+08:00'

const screenshotNote = {
  id: 'note-1',
  problem_id: 'problem-cf-1',
  title: '边界条件复盘',
  content: '## 核心思路\n\n先检查最小规模和重复元素。\n\n```cpp\nfor (int i = 0; i < n; ++i) {\n  // keep the invariant\n}\n```',
  note_type: 'solution',
  word_count: 42,
  updated_at: now,
}

const problems: ProblemRecord[] = [
  {
    id: 'problem-cf-1',
    platform: 'codeforces',
    platform_problem_id: '1000A',
    canonical_url: 'https://codeforces.com/contest/1000/problem/A',
    title: 'A. Example Problem',
    status: 'solved',
    last_visited_at: now,
    submission_count: 2,
  },
  {
    id: 'problem-acwing-1',
    platform: 'acwing',
    platform_problem_id: '123',
    canonical_url: 'https://www.acwing.com/problem/content/123/',
    title: 'AcWing Test',
    status: 'attempted',
    last_visited_at: now,
    submission_count: 1,
  },
  {
    id: 'problem-nowcoder-1',
    platform: 'nowcoder',
    platform_problem_id: 'contest-132048-A',
    canonical_url: 'https://ac.nowcoder.com/acm/contest/132048/A',
    title: '牛客竞赛 A',
    status: 'visited',
    last_visited_at: now,
    submission_count: 0,
  },
]

const overview: OverviewStats = {
  totalProblems: problems.length,
  todayVisited: 2,
  platformDistribution: [
    { platform: 'codeforces', count: 1 },
    { platform: 'acwing', count: 1 },
    { platform: 'nowcoder', count: 1 },
  ],
  lastActiveTime: now,
}

const sites: SiteConfigRecord[] = [
  {
    id: 'codeforces',
    name: 'Codeforces',
    domains: ['codeforces.com'],
    homeUrl: 'https://codeforces.com',
    enabled: true,
    problemUrlPatterns: [],
    submitUrlPatterns: [],
    cookiePolicy: 'local',
    adapter: 'codeforces',
    isBuiltin: true,
  },
  {
    id: 'acwing',
    name: 'AcWing',
    domains: ['acwing.com'],
    homeUrl: 'https://www.acwing.com',
    enabled: true,
    problemUrlPatterns: [],
    submitUrlPatterns: [],
    cookiePolicy: 'local',
    adapter: 'acwing',
    isBuiltin: true,
  },
  {
    id: 'nowcoder',
    name: '牛客',
    domains: ['nowcoder.com', 'ac.nowcoder.com'],
    homeUrl: 'https://ac.nowcoder.com',
    enabled: true,
    problemUrlPatterns: [],
    submitUrlPatterns: [],
    cookiePolicy: 'local',
    adapter: 'nowcoder',
    isBuiltin: true,
  },
]

const codeforcesAccount: PlatformAccount = {
  id: 'account-codeforces',
  platform: 'codeforces',
  handle: 'demo_handle',
  display_name: 'demo_handle',
  current_rating: 1420,
  peak_rating: 1510,
  last_synced_at: now,
}

function filterProblems(limit = 50, platform?: string, status?: string): ProblemRecord[] {
  return problems
    .filter((problem) => !platform || problem.platform === platform)
    .filter((problem) => !status || problem.status === status)
    .slice(0, limit)
}

function createApiMock(): ElectronAPI {
  let currentUrl = 'algo://home'
  const tabListeners = new Set<(tabs: TabInfo[]) => void>()
  const tabs: TabInfo[] = [{
    id: 'home',
    kind: 'internal',
    page: { type: 'home' },
    url: 'algo://home',
    title: '首页',
    favicon: null,
    isLoading: false,
    isCrashed: false,
    isUnresponsive: false,
    isUnresponsiveNoticeDismissed: false,
    isActive: true,
  }]

  const emitTabs = () => {
    const snapshot = tabs.map((tab) => ({ ...tab }))
    for (const listener of tabListeners) listener(snapshot)
  }

  const activateTab = (tabId: string) => {
    for (const tab of tabs) tab.isActive = tab.id === tabId
    const active = tabs.find((tab) => tab.isActive)
    currentUrl = active?.url ?? ''
    emitTabs()
  }

  const internalUrl = (page: InternalPage) => {
    if (page.type === 'problem-detail') return `algo://problem-detail?problemId=${page.problemId}`
    if (page.type === 'notes') return `algo://problem-notes?problemId=${page.problemId}`
    if (page.type === 'script-install') return `algo://script-install?installId=${page.installId}`
    return `algo://${page.type}`
  }

  return {
    browserLayout: { toolbarHeight: 42, tabBarHeight: 36, noticeBarHeight: 38, topOffset: 78 },
    navigate: (url) => { currentUrl = url },
    goBack: () => {},
    goForward: () => {},
    reload: () => {},
    goHome: () => {
      const home = tabs.find((tab) => tab.kind === 'internal' && tab.page.type === 'home')
      if (home) activateTab(home.id)
    },
    setSidebarWidth: () => {},
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
    isWindowMaximized: async () => false,
    onWindowMaximized: () => () => {},
    onUrlChanged: () => () => {},
    onUiCommand: () => () => {},

    listRecentProblems: async (limit, platform, status) => filterProblems(limit, platform, status),
    getProblemDetail: async (problemId) => {
      const problem = problems.find((item) => item.id === problemId)
      if (!problem) return null
      return {
        ...problem,
        submission_count: problem.submission_count ?? 0,
        ac_count: problem.status === 'solved' ? 1 : 0,
        first_seen_at: now,
        submissions: [
          {
            id: 'submission-1',
            problem_id: problem.id,
            platform: problem.platform,
            verdict: problem.status === 'solved' ? 'AC' : 'WA',
            language: 'GNU C++23',
            submitted_at: now,
          },
        ],
      }
    },
    deleteProblem: async () => true,
    onProblemsUpdated: () => () => {},

    syncCodeforces: async () => ({ platform: 'codeforces', fetched: 2, inserted: 1 }),
    syncVjudge: async () => ({ platform: 'vjudge', fetched: 0, inserted: 0 }),
    syncCurrentPage: async () => ({ platform: 'current', fetched: 1, inserted: 1 }),
    getRealtimeSubmissionStatus: async () => ({
      ipcRegistered: true,
      supportedAdapterIds: ['codeforces', 'acwing', 'nowcoder', 'vjudge', 'pta', 'luogu', 'leetcode-cn'],
      lastPage: {
        url: 'https://codeforces.com/contest/1000/problem/A',
        realtimeAdapterId: 'codeforces',
        realtimeSupported: true,
        at: now,
      },
      lastHook: {
        adapterId: 'codeforces',
        url: 'https://codeforces.com/contest/1000/problem/A',
        status: 'success',
        at: now,
      },
      lastDetection: {
        senderUrl: 'https://codeforces.com/contest/1000/problem/A',
        inserted: true,
        platform: 'codeforces',
        verdict: 'AC',
        problemId: 'problem-cf-1',
        at: now,
      },
    }),

    getOverviewStats: async () => overview,
    getDailyActiveStats: async () => [{
      local_day: '2026-07-03',
      active_seconds: 1800,
      duration_seconds: 2400,
      visited: 2,
      solved: 1,
      submissions: 3,
      ac: 1,
    }],
    getVisitedTrend: async () => [
      { local_day: '2026-07-01', count: 1 },
      { local_day: '2026-07-02', count: 2 },
      { local_day: '2026-07-03', count: 3 },
    ],
    getAcTrend: async () => [
      { local_day: '2026-07-01', count: 0 },
      { local_day: '2026-07-02', count: 1 },
      { local_day: '2026-07-03', count: 1 },
    ],
    getSubmissionTrend: async () => [{ local_day: '2026-07-03', total: 3, ac: 1 }],
    getPlatformDistribution: async () => overview.platformDistribution,
    getProblemVisitStats: async () => ({
      total_visits: 3,
      total_duration: 2400,
      total_active: 1800,
      avg_duration: 800,
    }),
    getTimeline: async () => [
      {
        id: 'event-1',
        event_type: 'visit_start',
        occurred_at: now,
        platform: 'codeforces',
        url: 'https://codeforces.com/contest/1000/problem/A',
        problem_id: 'problem-cf-1',
      },
    ],
    getLastActiveTime: async () => now,
    getRevisitStats: async () => [{
      problem_id: 'problem-cf-1',
      platform: 'codeforces',
      platform_problem_id: '1000A',
      title: 'A. Example Problem',
      canonical_url: 'https://codeforces.com/contest/1000/problem/A',
      visit_count: 3,
      last_visit: now,
    }],
    recomputeDailyStats: async () => true,
    getStreakDays: async () => ({ current: 3, longest: 5 }),
    getWrongProblems: async () => [{
      id: 'problem-acwing-1',
      platform: 'acwing',
      platform_problem_id: '123',
      title: 'AcWing Test',
      canonical_url: 'https://www.acwing.com/problem/content/123/',
      wrong_count: 2,
      last_attempt: now,
    }],
    getUnreviewedProblems: async () => [{
      id: 'problem-nowcoder-1',
      platform: 'nowcoder',
      platform_problem_id: 'contest-132048-A',
      title: '牛客竞赛 A',
      canonical_url: 'https://ac.nowcoder.com/acm/contest/132048/A',
      last_visited_at: now,
      days_since: 7,
    }],
    recomputeAllDailyStats: async () => 1,

    bindHandle: async (_platform, handle) => ({ id: codeforcesAccount.id, handle }),
    getAccount: async () => codeforcesAccount,
    getAccounts: async () => [codeforcesAccount],
    syncCodeforcesRating: async () => ({ success: true, historyCount: 2, inserted: 1, peak: 1510 }),
    getRatingHistory: async () => [
      { contest_name: 'Codeforces Round 1', rating_before: 1200, rating_after: 1300, delta: 100, contest_at: now },
      { contest_name: 'Codeforces Round 2', rating_before: 1300, rating_after: 1420, delta: 120, contest_at: now },
    ],
    getCodeforcesAccount: async () => codeforcesAccount,
    getContestResults: async () => [],

    getAllSites: async () => sites,
    getSiteById: async (id) => sites.find((site) => site.id === id) ?? null,
    createSite: async (data) => data.id,
    updateSite: async () => true,
    toggleSite: async () => true,
    deleteSite: async () => true,
    exportSitesConfig: async () => ({ success: true, count: sites.length, path: 'mock-sites.json' }),
    importSitesConfig: async () => ({ success: false, error: '未选择文件' }),
    confirmImportSites: async () => ({ success: true, imported: 0, overwritten: 0 }),

    scriptsGetAll: async () => [],
    scriptsSave: async () => 'script-1',
    scriptsImportFile: async () => null,
    scriptsOpenFolder: async () => {},
    scriptsToggle: async () => true,
    scriptsDelete: async () => true,

    getHomeShortcuts: async () => ['https://codeforces.com/'],

    createTab: async (url) => {
      const id = `tab-${tabs.length + 1}`
      for (const tab of tabs) tab.isActive = false
      tabs.push(url ? {
        id,
        kind: 'web',
        url,
        title: url,
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: true,
      } : {
        id,
        kind: 'internal',
        page: { type: 'home' },
        url: 'algo://home',
        title: '首页',
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: true,
      })
      currentUrl = tabs[tabs.length - 1].url
      emitTabs()
      return id
    },
    closeTab: (tabId) => {
      const index = tabs.findIndex((tab) => tab.id === tabId)
      if (index < 0) return
      const wasActive = tabs[index].isActive
      tabs.splice(index, 1)
      if (wasActive && tabs.length > 0) activateTab(tabs[Math.min(index, tabs.length - 1)].id)
      else emitTabs()
    },
    reopenClosedTab: async () => '',
    switchTab: activateTab,
    reorderTab: async (tabId, targetIndex) => {
      const sourceIndex = tabs.findIndex((tab) => tab.id === tabId)
      if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return false
      const destinationIndex = Math.max(0, Math.min(targetIndex, tabs.length - 1))
      if (sourceIndex === destinationIndex) return false
      const [tab] = tabs.splice(sourceIndex, 1)
      tabs.splice(destinationIndex, 0, tab)
      emitTabs()
      return true
    },
    detachTab: () => {},
    reloadTab: () => {},
    dismissUnresponsiveTab: () => {},
    openInternalTab: async (page) => {
      const id = `tab-${tabs.length + 1}`
      for (const tab of tabs) tab.isActive = false
      tabs.push({
        id,
        kind: 'internal',
        page,
        url: internalUrl(page),
        title: page.type,
        favicon: null,
        isLoading: false,
        isCrashed: false,
        isUnresponsive: false,
        isUnresponsiveNoticeDismissed: false,
        isActive: true,
      })
      currentUrl = tabs[tabs.length - 1].url
      emitTabs()
      return id
    },
    getTabList: async () => tabs,
    onTabListChanged: (callback) => {
      callback(tabs)
      tabListeners.add(callback)
      return () => { tabListeners.delete(callback) }
    },

    listNotesByProblem: async () => [screenshotNote],
    getNote: async () => screenshotNote,
    createNote: async () => screenshotNote,
    updateNoteTitle: async () => true,
    updateNoteContent: async () => true,
    saveNoteImage: async () => ({ markdownUrl: 'note-asset://local/note-1/image.png' }),
    updateNoteType: async () => true,
    deleteNote: async () => true,
    getNotesForDelete: async () => [],
    deleteNotesByProblem: async () => 0,
    openNotesDir: async () => {},

    exportAIContext: async () => ({}),
    exportAIContextMarkdown: async () => '# 本地学习上下文',
    getReviewRecommendations: async () => ({
      generated_at: now,
      rule_version: 1,
      recommendations: [{
        problem_id: 'problem-acwing-1',
        platform: 'acwing',
        platform_problem_id: '123',
        title: 'AcWing Test',
        canonical_url: 'https://www.acwing.com/problem/content/123/',
        reason: '最近错误较多',
        score: 72,
        source: {
          wrong_count: 2,
          last_attempt: now,
          days_since_attempt: 3,
          visit_count: 2,
          has_ac: false,
        },
      }],
    }),
    getWeaknessAnalysis: async () => ({
      generated_at: now,
      rule_version: 1,
      data_note: '截图测试数据',
      weaknesses: [{
        tag: 'dynamic-programming',
        total: 3,
        solved: 1,
        attempted: 2,
        ac_rate: 33,
        wrong_submissions: 4,
        total_duration_seconds: 3600,
        weakness_score: 68,
        evidence: '错误提交较多，AC 率偏低',
      }],
    }),
    getPeriodSummary: async () => ({}),
    getPeriodSummaryMarkdown: async () => '# 阶段总结',
    getReviewPlan: async () => ({}),
    getReviewPlanMarkdown: async () => '# 复习计划',
    saveAIOutput: async () => 'ai-output-1',
    getAIOutput: async () => null,
    listAIOutputs: async () => [],
    deleteAIOutput: async () => true,
    updateAIOutput: async () => true,

    coachGetConfig: async () => ({
      enabled: true,
      sound: true,
      bubbleFrequency: 'medium' as const,
      position: null,
      scale: 1,
      opacity: 1,
    }),
    coachSaveConfig: async () => true,
    coachTestHint: async () => ({
      id: 'test-hint',
      title: '测试提示',
      message: '这是一个测试气泡',
      source: 'local' as const,
      level: 1,
    }),
    coachResetPosition: async () => true,
    coachGetMetricsBundle: async () => MOCK_METRICS_BUNDLE,
    coachGetLlmConfig: async () => ({
      enabled: false,
      has_key: false,
      key_masked: '',
      base_url: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-1-6-flash-250715',
    }),
    coachSaveLlmApiKey: async () => true,
    coachSaveLlmConfig: async () => true,
    coachTestLlmConnection: async () => ({
      success: true,
      message: '截图测试连接成功',
      latency_ms: 12,
      model: 'doubao-seed-1-6-flash-250715',
    }),
  }
}

window.confirm = () => true
window.electronAPI = createApiMock()

async function bootstrap(): Promise<void> {
  const { applyBrowserLayoutVariables } = await import('../../src/browserLayout')
  applyBrowserLayoutVariables(window.electronAPI.browserLayout, document.documentElement.style)
  const { default: App } = await import('../../src/App')
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Missing root element')
  createRoot(rootEl).render(<App />)
  window.dispatchEvent(new Event('algo-screenshot-rendered'))
}

void bootstrap().catch((error) => {
  document.body.textContent = error instanceof Error ? error.stack ?? error.message : String(error)
})
