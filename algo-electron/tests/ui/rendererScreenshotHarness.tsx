import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'

const now = '2026-07-03T10:00:00+08:00'

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
  let currentUrl = ''
  const tabs: TabInfo[] = [{ id: 'home', url: '', title: '首页', isActive: true }]

  return {
    navigate: (url) => { currentUrl = url },
    goBack: () => {},
    goForward: () => {},
    reload: () => {},
    goHome: () => { currentUrl = '' },
    setSidebarWidth: () => {},
    hideView: () => {},
    showView: () => {},
    captureBrowserPreview: async () => null,
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
    isWindowMaximized: async () => false,
    onWindowMaximized: () => () => {},
    onUrlChanged: () => () => {},

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

    getDefaultHomeUrl: async () => 'https://codeforces.com',
    setDefaultHomeUrl: () => {},

    createTab: async (url) => {
      currentUrl = url ?? ''
      tabs.push({ id: `tab-${tabs.length + 1}`, url: currentUrl, title: currentUrl || '首页', isActive: true })
      return tabs[tabs.length - 1].id
    },
    closeTab: () => {},
    switchTab: () => {},
    detachTab: () => {},
    getTabList: async () => tabs,
    onTabListChanged: (callback) => {
      callback(tabs)
      return () => {}
    },

    listNotesByProblem: async () => [],
    getNote: async () => null,
    createNote: async () => ({
      id: 'note-1',
      problem_id: 'problem-cf-1',
      title: '未命名笔记',
      content: '',
      note_type: 'solution',
      word_count: 0,
      updated_at: now,
    }),
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
  }
}

window.confirm = () => true
window.electronAPI = createApiMock()

async function bootstrap(): Promise<void> {
  const { default: App } = await import('../../src/App')
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Missing root element')
  createRoot(rootEl).render(<App />)
  window.dispatchEvent(new Event('algo-screenshot-rendered'))
}

void bootstrap().catch((error) => {
  document.body.textContent = error instanceof Error ? error.stack ?? error.message : String(error)
})
