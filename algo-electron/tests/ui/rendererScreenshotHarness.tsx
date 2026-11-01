import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import '../../src/App.css'
import { MOCK_METRICS_BUNDLE } from '../../src/features/coach/mockMetricsBundle'
import { getInternalPageTitle, getInternalPageUrl } from '../../electron/browser/internalPage'
import type { ThemePreference } from '@shared/types/config'
import type { OverviewStats } from '@shared/types/stats'
import type { SiteConfigRecord } from '@shared/types/sites'
import type { PlatformAccount } from '@shared/types/rating'
import type { FindInPageCommand, TabInfo, ZoomCommand } from '@shared/types/browser'
import type { OmniboxSuggestion, ProblemRecord } from '@shared/types/problem'

const now = '2026-07-03T10:00:00+08:00'

const screenshotNote = {
  id: 'note-1',
  problem_id: 'problem-cf-1',
  title: '边界条件复盘',
  content:
    '## 核心思路\n\n先检查最小规模和重复元素。\n\n```cpp\nfor (int i = 0; i < n; ++i) {\n  // keep the invariant\n}\n```',
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

const omniboxSuggestions: OmniboxSuggestion[] = [
  {
    problemId: problems[0].id,
    title: problems[0].title,
    platform: problems[0].platform,
    platformProblemId: problems[0].platform_problem_id,
    url: problems[0].canonical_url,
    lastVisitedAt: problems[0].last_visited_at,
    source: 'history',
  },
  {
    problemId: problems[1].id,
    title: problems[1].title,
    platform: problems[1].platform,
    platformProblemId: problems[1].platform_problem_id,
    url: problems[1].canonical_url,
    lastVisitedAt: problems[1].last_visited_at,
    source: 'problem',
  },
]

let storedTheme: ThemePreference = 'system'

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

/**
 * 截图范围之外的接口：调到就抛。
 *
 * 抛而不是返回假值，是因为 `rendererScreenshots.pw.spec.ts` 断言 `pageErrors` 为空——
 * 一旦某张截图的界面真的调了它，测试会带着接口名当场失败，提示"该给这个接口补个真替身了"，
 * 而不是拿一个编出来的返回值把界面渲染成看似正常的样子。
 *
 * 返回 `never` 让这一个实现能顶替所有签名：`never` 可赋给任何返回类型，零参函数也可赋给带参函数。
 * 已核对过这 32 个接口在被截图的界面里都只挂在点击回调上（如 BackupPanel 的三个按钮），
 * 没有一个在挂载副作用里调用。
 */
const outOfScreenshotScope = (name: string) => (): never => {
  throw new Error(`rendererScreenshotHarness 未为 ${name} 提供替身：这个接口不在截图建模范围内`)
}

function createApiMock(): typeof window.api {
  let currentUrl = 'algo://home'
  const tabListeners = new Set<(tabs: TabInfo[]) => void>()
  const tabs: TabInfo[] = [
    {
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
    },
  ]

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

  return {
    browserLayout: {
      toolbarHeight: 42,
      tabBarHeight: 36,
      noticeBarHeight: 38,
      findBarHeight: 38,
      topOffset: 78,
    },
    browser: {
      navigate: (url) => {
        currentUrl = url
      },
      goBack: () => {},
      goForward: () => {},
      reload: () => {},
      goHome: () => {
        const home = tabs.find((tab) => tab.kind === 'internal' && tab.page.type === 'home')
        if (home) activateTab(home.id)
      },
      setSidebarWidth: () => {},
      onUrlChanged: () => () => {},
      onUiCommand: () => () => {},
      findInPage: async (input) => {
        // command 在通道上是 z.unknown()（判别校验在主进程 TabManager.findInPage），
        // 替身要按它造返回值，这里用共享类型收窄。
        const command = input.command as FindInPageCommand
        return {
          open: command.type !== 'close',
          tabId: command.type === 'close' ? null : input.tabId,
          query: command.type === 'query' ? command.query : '',
          requestId: null,
          activeMatchOrdinal: 0,
          matches: 0,
          finalUpdate: true,
        }
      },
      onFindInPageResult: () => () => {},
      setZoom: async (input) => {
        // 同 findInPage：isZoomCommand 的判别在主进程，替身按 ZoomCommand 收窄。
        const command = input.command as ZoomCommand
        return {
          tabId: input.tabId,
          factor: command === 'in' ? 1.1 : command === 'out' ? 0.9 : 1,
        }
      },
      onZoomChanged: () => () => {},
      setDownloadNoticeVisible: () => {},
      onDownloadResult: () => () => {},
      getOmniboxSuggestions: async (query) => {
        const normalizedQuery = query.trim().toLocaleLowerCase()
        if (!normalizedQuery) return omniboxSuggestions
        return omniboxSuggestions.filter(
          (suggestion) =>
            suggestion.title?.toLocaleLowerCase().includes(normalizedQuery) ||
            suggestion.platformProblemId.toLocaleLowerCase().includes(normalizedQuery) ||
            suggestion.url.toLocaleLowerCase().includes(normalizedQuery),
        )
      },
      setOmniboxOpen: () => {},
      showAppMenu: () => {},
      showShellContextMenu: () => {},
      showTabContextMenu: () => {},
      setErrorNoticeVisible: () => {},
    },
    tab: {
      create: async (url) => {
        const id = `tab-${tabs.length + 1}`
        for (const tab of tabs) tab.isActive = false
        tabs.push(
          url
            ? {
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
              }
            : {
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
              },
        )
        currentUrl = tabs[tabs.length - 1].url
        emitTabs()
        return id
      },
      close: (tabId) => {
        const index = tabs.findIndex((tab) => tab.id === tabId)
        if (index < 0) return
        const wasActive = tabs[index].isActive
        tabs.splice(index, 1)
        if (wasActive && tabs.length > 0) activateTab(tabs[Math.min(index, tabs.length - 1)].id)
        else emitTabs()
      },
      reopenClosed: async () => '',
      switch: activateTab,
      reorder: async (input) => {
        const { tabId, targetIndex } = input
        const sourceIndex = tabs.findIndex((tab) => tab.id === tabId)
        if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return false
        const destinationIndex = Math.max(0, Math.min(targetIndex, tabs.length - 1))
        if (sourceIndex === destinationIndex) return false
        const [tab] = tabs.splice(sourceIndex, 1)
        tabs.splice(destinationIndex, 0, tab)
        emitTabs()
        return true
      },
      moveToNewWindow: async () => true,
      finishDrag: async (input) => {
        const { tabId, targetIndex } = input
        const sourceIndex = tabs.findIndex((tab) => tab.id === tabId)
        if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return false
        const [tab] = tabs.splice(sourceIndex, 1)
        tabs.splice(Math.max(0, Math.min(targetIndex, tabs.length)), 0, tab)
        emitTabs()
        return true
      },
      reload: () => {},
      dismissUnresponsive: () => {},
      openInternal: async (page) => {
        const id = `tab-${tabs.length + 1}`
        for (const tab of tabs) tab.isActive = false
        tabs.push({
          id,
          kind: 'internal',
          page,
          url: getInternalPageUrl(page),
          title: getInternalPageTitle(page),
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
      getList: async () => tabs,
      onListChanged: (callback) => {
        callback(tabs)
        tabListeners.add(callback)
        return () => {
          tabListeners.delete(callback)
        }
      },
    },
    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      isMaximized: async () => false,
      onMaximized: () => () => {},
    },
    problem: {
      listRecent: async (input) => filterProblems(input.limit, input.platform, input.status),
      getDetail: async (problemId) => {
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
      delete: async () => true,
      onUpdated: () => () => {},
    },
    submissions: {
      syncCodeforces: async () => ({ platform: 'codeforces', fetched: 2, inserted: 1 }),
      syncCurrentPage: async () => ({ platform: 'current', fetched: 1, inserted: 1 }),
      getRealtimeStatus: async () => ({
        ipcRegistered: true,
        supportedAdapterIds: [
          'codeforces',
          'acwing',
          'nowcoder',
          'vjudge',
          'pta',
          'luogu',
          'leetcode-cn',
        ],
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
    },
    cookies: {
      getSiteSummary: outOfScreenshotScope('cookies.getSiteSummary'),
    },
    credentials: {
      getAutofillPrompt: async () => null,
      respondAutofill: async () => true,
      onAutofillPrompt: () => () => {},
      getCapturePrompt: async () => null,
      respondCapture: async () => true,
      onCapturePrompt: () => () => {},
      onCaptureResult: () => () => {},
      list: outOfScreenshotScope('credentials.list'),
      delete: outOfScreenshotScope('credentials.delete'),
      rename: outOfScreenshotScope('credentials.rename'),
    },
    stats: {
      getOverview: async () => overview,
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
      getRevisitStats: async () => [
        {
          problem_id: 'problem-cf-1',
          platform: 'codeforces',
          platform_problem_id: '1000A',
          title: 'A. Example Problem',
          canonical_url: 'https://codeforces.com/contest/1000/problem/A',
          visit_count: 3,
          last_visit: now,
        },
      ],
      getStreakDays: async () => ({ current: 3, longest: 5 }),
      getWrongProblems: async () => [
        {
          id: 'problem-acwing-1',
          platform: 'acwing',
          platform_problem_id: '123',
          title: 'AcWing Test',
          canonical_url: 'https://www.acwing.com/problem/content/123/',
          wrong_count: 2,
          last_attempt: now,
        },
      ],
      getUnreviewed: async () => [
        {
          id: 'problem-nowcoder-1',
          platform: 'nowcoder',
          platform_problem_id: 'contest-132048-A',
          title: '牛客竞赛 A',
          canonical_url: 'https://ac.nowcoder.com/acm/contest/132048/A',
          last_visited_at: now,
          days_since: 7,
        },
      ],
      recomputeAll: async () => 1,
    },
    ai: {
      getReviewRecommendations: async () => ({
        generated_at: now,
        rule_version: 1,
        recommendations: [
          {
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
          },
        ],
      }),
      getWeaknessAnalysis: async () => ({
        generated_at: now,
        rule_version: 1,
        data_note: '截图测试数据',
        weaknesses: [
          {
            tag: 'dynamic-programming',
            total: 3,
            solved: 1,
            attempted: 2,
            ac_rate: 33,
            wrong_submissions: 4,
            total_duration_seconds: 3600,
            weakness_score: 68,
            evidence: '错误提交较多，AC 率偏低',
          },
        ],
      }),
    },
    notes: {
      listByProblem: async () => [screenshotNote],
      get: async () => screenshotNote,
      create: async () => screenshotNote,
      updateTitle: async () => true,
      updateContent: async (input) => {
        screenshotNote.content = input.content
        return true
      },
      saveImage: async () => ({ markdownUrl: 'note-asset://local/note-1/image.png' }),
      updateType: async () => true,
      delete: async () => true,
      getForDelete: async () => [],
      deleteByProblem: async () => 0,
      openDir: async () => {},
    },
    sites: {
      getAll: async () => sites,
      getById: async (id) => sites.find((site) => site.id === id) ?? null,
      create: async (data) => data.id,
      toggle: async () => true,
      delete: async () => true,
      exportConfig: async () => ({
        success: true as const,
        data: { count: sites.length, path: 'mock-sites.json' },
      }),
      importConfig: async () => ({ success: false as const, error: '未选择文件' }),
      confirmImport: async () => ({
        success: true as const,
        data: { imported: 0, overwritten: 0 },
      }),
    },
    scripts: {
      getPendingInstall: async () => null,
      cancelPendingInstall: async () => true,
      getRemoteInstallPreview: async () => null,
      confirmRemoteInstall: async () => null,
      cancelRemoteInstall: async () => true,
      getHostPermissionPrompt: async () => null,
      respondHostPermission: async () => 'stale',
      onHostPermissionPrompt: () => () => {},
      getAll: async () => [],
      save: async () => 'script-1',
      importFile: async () => null,
      // `shell.openPath` 成功时返回空串、失败时返回错误信息，所以声明的 `Promise<string>` 是准的；
      // 原先这个替身返回 void，是替身写错了。空串就是"打开成功"。
      openFolder: async () => '',
      getCode: async () => ({ status: 'not-found' as const }),
      openEditor: async () => ({ status: 'ok' as const }),
      toggle: async () => true,
      delete: async () => true,
      checkUpdates: async () => ({
        checked: 0,
        updated: 0,
        current: 0,
        skipped: 0,
        failed: 0,
        results: [],
      }),
    },
    backup: {
      createDatabaseBackup: outOfScreenshotScope('backup.createDatabaseBackup'),
      exportLearningData: outOfScreenshotScope('backup.exportLearningData'),
      previewLearningDataImport: outOfScreenshotScope('backup.previewLearningDataImport'),
      confirmLearningDataImport: outOfScreenshotScope('backup.confirmLearningDataImport'),
    },
    config: {
      getHomeShortcuts: async () => ['https://codeforces.com/'],
      getSearchEngine: async () => ({ engine: 'bing', customTemplate: null }),
      setSearchEngine: async (search) => search,
      // 截图基线固定跑浅色：主题偏好在替身里不落盘，改档只影响当次会话。
      getTheme: async () => storedTheme,
      setTheme: async (theme) => {
        storedTheme = theme
        return storedTheme
      },
    },
    rating: {
      bindHandle: async (input) => ({ id: codeforcesAccount.id, handle: input.handle }),
      getAccount: async () => codeforcesAccount,
      getAccounts: async () => [codeforcesAccount],
      syncCodeforces: async () => ({
        success: true as const,
        data: { historyCount: 2, inserted: 1, peak: 1510 },
      }),
      getHistory: async () => [
        {
          contest_name: 'Codeforces Round 1',
          rating_before: 1200,
          rating_after: 1300,
          delta: 100,
          contest_at: now,
        },
        {
          contest_name: 'Codeforces Round 2',
          rating_before: 1300,
          rating_after: 1420,
          delta: 120,
          contest_at: now,
        },
      ],
      getCodeforcesAccount: async () => codeforcesAccount,
    },
    coach: {
      getConfig: async () => ({
        enabled: true,
        sound: true,
        bubbleFrequency: 'medium' as const,
        position: null,
        scale: 1,
        opacity: 1,
        pinMode: 'follow' as const,
      }),
      saveConfig: async () => true,
      testHint: async () => ({
        id: 'test-hint',
        title: '测试提示',
        message: '这是一个测试气泡',
        source: 'local' as const,
        level: 1,
      }),
      resetPosition: async () => true,
      getState: async () => null,
      getMetricsBundle: async () => MOCK_METRICS_BUNDLE,
      getLlmConfig: async () => ({
        enabled: false,
        has_key: false,
        key_masked: '',
        base_url: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-1-6-flash-250715',
      }),
      saveLlmApiKey: async () => true,
      saveLlmConfig: async () => true,
      testLlmConnection: async () => ({
        success: true as const,
        data: {
          message: '截图测试连接成功',
          latency_ms: 12,
          model: 'doubao-seed-1-6-flash-250715',
        },
      }),
      onContestModeChanged: () => () => {},
      // 下面这些是截图 harness 不建模的接口。原先它们干脆没写，而 `createApiMock` 的返回类型
      // 声明的是完整 `ElectronAPI`——`tsc` 一直没看过 tests/，于是这 37 个成员缺了 37 个也没人知道。
      // 补齐之后，以后 ElectronAPI 加成员会在这里编译失败，而不是等某张截图跑出 TypeError。
      onPetStateChanged: () => () => {},
      onConfigChanged: () => () => {},
      onShowBubble: () => () => {},
      onDismissBubble: () => () => {},
      getPetState: outOfScreenshotScope('coach.getPetState'),
      toggleIgnoreMouseEvents: outOfScreenshotScope('coach.toggleIgnoreMouseEvents'),
      startDrag: outOfScreenshotScope('coach.startDrag'),
      endDrag: outOfScreenshotScope('coach.endDrag'),
      triggerHint: outOfScreenshotScope('coach.triggerHint'),
      dismissHint: outOfScreenshotScope('coach.dismissHint'),
      feedback: outOfScreenshotScope('coach.feedback'),
      dismissDisclaimer: outOfScreenshotScope('coach.dismissDisclaimer'),
      petClick: outOfScreenshotScope('coach.petClick'),
      chat: outOfScreenshotScope('coach.chat'),
      getProblemTimeline: outOfScreenshotScope('coach.getProblemTimeline'),
    },
  }
}

window.confirm = () => true
window.api = createApiMock()

async function bootstrap(): Promise<void> {
  const { applyBrowserLayoutVariables } = await import('../../src/browserLayout')
  applyBrowserLayoutVariables(window.api.browserLayout, document.documentElement.style)
  const { default: App } = await import('../../src/App')
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Missing root element')
  createRoot(rootEl).render(<App />)
  window.dispatchEvent(new Event('algo-screenshot-rendered'))
}

void bootstrap().catch((error) => {
  document.body.textContent =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
})
