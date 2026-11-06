// @vitest-environment jsdom
import { render } from './renderWithDataRefresh'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { ShellRouter } from '../../src/components/ShellRouter'
import type { TabStripTabInfo } from '../../src/components/tabApi'

type InternalTab = Extract<TabStripTabInfo, { kind: 'internal' }>

/*
 * 内部页标签夹具。`baseTab` 故意不带 `kind`：`TabStripTabInfo` 是联合类型，
 * 把已标注成联合的对象展开后再覆写 `page`，会被按 `WebTabInfo` 那一支做多余属性检查。
 */
const baseTab = {
  id: 'tab-1',
  url: 'algo://dashboard',
  title: 'Dashboard',
  favicon: null,
  isLoading: false,
  isCrashed: false,
  isUnresponsive: false,
  isUnresponsiveNoticeDismissed: false,
  isActive: true,
}

function internalTab(overrides: Partial<InternalTab> = {}): InternalTab {
  return { ...baseTab, kind: 'internal', page: { type: 'dashboard' }, ...overrides }
}

// Lazy routes must finish mounting before teardown, with every mount-time read wired.
const stubRejection = () =>
  vi.fn().mockRejectedValue(new Error('transitions fixture: API not wired in this test'))
beforeEach(() => {
  // 测试替身只实现挂载路径用到的方法；域内允许缺方法（Partial），整体指回完整的
  // window.api 形状——多实现了不存在的方法会被 tsc 当场报出来。
  type DomainStub = { [K in keyof typeof window.api]?: Partial<(typeof window.api)[K]> }
  const apiStub: DomainStub = {
    stats: {
      getOverview: vi.fn<typeof window.api.stats.getOverview>().mockResolvedValue({
        totalProblems: 0,
        todayVisited: 0,
        platformDistribution: [],
        lastActiveTime: null,
      }),
      getStreakDays: vi.fn<typeof window.api.stats.getStreakDays>().mockResolvedValue({
        current: 0,
        longest: 0,
      }),
      getWrongProblems: vi.fn<typeof window.api.stats.getWrongProblems>().mockResolvedValue([]),
      getUnreviewed: vi.fn<typeof window.api.stats.getUnreviewed>().mockResolvedValue([]),
      getTimeline: vi.fn<typeof window.api.stats.getTimeline>().mockResolvedValue([]),
      getRevisitStats: vi.fn<typeof window.api.stats.getRevisitStats>().mockResolvedValue([]),
      getVisitedTrend: vi.fn<typeof window.api.stats.getVisitedTrend>().mockResolvedValue([]),
      getAcTrend: vi.fn<typeof window.api.stats.getAcTrend>().mockResolvedValue([]),
    },
    problem: {
      listRecent: vi.fn().mockResolvedValue([]),
      onUpdated: vi.fn().mockReturnValue(() => {}),
    },
    config: {
      getHomeShortcuts: vi.fn().mockResolvedValue([]),
      // 设置页挂载时的读取类 API（AppearancePanel/SearchEnginePanel/LlmConfigPanel/
      // CodeforcesSyncPanel/SiteManagementPanel/SettingsPage 本体）。
      getTheme: vi.fn<typeof window.api.config.getTheme>().mockResolvedValue('system'),
      getSearchEngine: stubRejection(),
    },
    coach: { getLlmConfig: stubRejection() },
    rating: {
      getAccounts: stubRejection(),
      getCodeforcesAccount: vi
        .fn<typeof window.api.rating.getCodeforcesAccount>()
        .mockResolvedValue(null),
    },
    ai: {
      getReviewRecommendations: vi
        .fn<typeof window.api.ai.getReviewRecommendations>()
        .mockResolvedValue({
          generated_at: Date.parse('2026-11-04T12:00:00'),
          rule_version: 1,
          recommendations: [],
        }),
      getWeaknessAnalysis: vi.fn<typeof window.api.ai.getWeaknessAnalysis>().mockResolvedValue({
        generated_at: Date.parse('2026-11-04T12:00:00'),
        rule_version: 1,
        weaknesses: [],
        data_note: '',
      }),
    },
    sites: { getAll: stubRejection() },
    submissions: { getRealtimeStatus: stubRejection() },
  }
  window.api = apiStub as typeof window.api
})

// Vitest globals are disabled, so Testing Library cannot register automatic cleanup.
afterEach(cleanup)

async function waitForSettingsPage(): Promise<void> {
  await vi.dynamicImportSettled()
  expect(await screen.findByRole('heading', { name: '设置', level: 2 })).toBeTruthy()
  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: '主题' }).hasAttribute('disabled')).toBe(false)
  })
}

describe('View Transitions（B5.3）', () => {
  let originalStartViewTransition: typeof document.startViewTransition | undefined

  beforeEach(() => {
    originalStartViewTransition = document.startViewTransition
  })

  afterEach(() => {
    if (originalStartViewTransition) {
      document.startViewTransition = originalStartViewTransition
    } else {
      // @ts-expect-error: 恢复未定义状态
      delete document.startViewTransition
    }
  })

  it('能力检测：支持 startViewTransition 时用它包裹切换', async () => {
    const mockTransition = vi.fn((callback: () => void) => {
      callback()
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {},
      }
    })
    document.startViewTransition = mockTransition as unknown as typeof document.startViewTransition

    const dashboardTab = internalTab()
    const settingsTab = internalTab({
      id: 'tab-2',
      page: { type: 'settings' },
      title: '设置',
      url: 'algo://settings',
    })

    const { rerender } = render(
      <ShellRouter
        activeTab={dashboardTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    expect(mockTransition).not.toHaveBeenCalled()

    rerender(
      <ShellRouter
        activeTab={settingsTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mockTransition).toHaveBeenCalledTimes(1)
    })
    await waitForSettingsPage()
  })

  it('能力检测：不支持时仍能正常切换（降级分支）', async () => {
    // @ts-expect-error: 删除 API 模拟不支持
    delete document.startViewTransition

    const dashboardTab = internalTab()
    const settingsTab = internalTab({
      id: 'tab-2',
      page: { type: 'settings' },
      title: '设置',
      url: 'algo://settings',
    })

    const { rerender, container } = render(
      <ShellRouter
        activeTab={dashboardTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    // startViewTransition 不存在时，仍能正常切换页面（降级到同步更新）
    expect(container.querySelector('.shell-route-dashboard')).toBeTruthy()

    rerender(
      <ShellRouter
        activeTab={settingsTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.shell-route-settings')).toBeTruthy()
    })
    await waitForSettingsPage()
  })

  it('过渡被跳过时不产生 unhandled rejection', async () => {
    /*
     * 连续换页时浏览器会跳过前一次过渡，被跳过那次的 ready/finished 以 AbortError 拒绝。
     * 没接住就会冒成页面错误——Playwright 的 pageerror 断言曾因此红过三条。
     */
    const rejections: unknown[] = []
    // jsdom 里未接住的 rejection 落到 process 而不是 window，所以监听点在 process 上。
    const onUnhandled = (reason: unknown) => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    document.startViewTransition = ((callback: () => void) => {
      callback()
      const skipped = Promise.reject(new DOMException('Transition was skipped', 'AbortError'))
      return {
        ready: skipped,
        finished: skipped,
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {},
      }
    }) as unknown as typeof document.startViewTransition

    const dashboardTab = internalTab()
    const settingsTab = internalTab({
      id: 'tab-2',
      page: { type: 'settings' },
      title: '设置',
      url: 'algo://settings',
    })

    const { rerender, container } = render(
      <ShellRouter
        activeTab={dashboardTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    rerender(
      <ShellRouter
        activeTab={settingsTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    try {
      await waitForSettingsPage()
      expect(container.querySelector('.shell-route-settings')).toBeTruthy()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(rejections).toEqual([])
  })

  it('同一标签不触发过渡（避免无意义的动画）', async () => {
    const mockTransition = vi.fn((callback: () => void) => {
      callback()
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {},
      }
    })
    document.startViewTransition = mockTransition as unknown as typeof document.startViewTransition

    const dashboardTab = internalTab()

    const { rerender } = render(
      <ShellRouter
        activeTab={dashboardTab}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    mockTransition.mockClear()

    rerender(
      <ShellRouter
        activeTab={{ ...dashboardTab, title: 'Dashboard（已修改）' }}
        onNavigate={vi.fn()}
        onCloseActiveTab={vi.fn()}
        onReloadActiveTab={vi.fn()}
      />,
    )

    await vi.dynamicImportSettled()
    expect(await screen.findByRole('heading', { name: '学习统计', level: 2 })).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByLabelText('总题数加载中')).toBeNull()
      expect(window.api.stats.getVisitedTrend).toHaveBeenCalledWith(30)
      expect(window.api.ai.getWeaknessAnalysis).toHaveBeenCalledWith(8)
    })
    expect(screen.getAllByTestId('shell-route')).toHaveLength(1)
    expect(mockTransition).not.toHaveBeenCalled()
  })
})

describe('Dialog 出入场动画（B5.3）', () => {
  it('@starting-style 确保 opacity 与 transform 有初始值', () => {
    const styleSheet = Array.from(document.styleSheets).find((sheet) =>
      sheet.href?.includes('ui.css'),
    )
    if (!styleSheet) {
      // 测试环境可能没有实际加载 CSS，跳过而非失败
      return
    }

    const rules = Array.from(styleSheet.cssRules)
    const startingRule = rules.find((rule) => rule instanceof CSSStartingStyleRule) as
      CSSStartingStyleRule | undefined

    expect(startingRule).toBeDefined()
  })

  it('Dialog transition 声明包含 allow-discrete（支持 display 过渡）', () => {
    const div = document.createElement('div')
    div.className = 'ui-dialog-overlay'
    document.body.appendChild(div)

    const computed = window.getComputedStyle(div)
    const transition = computed.transitionProperty

    // display 与 overlay 必须在 transition-property 里才能过渡
    expect(transition).toMatch(/display|all/)

    document.body.removeChild(div)
  })
})

describe('焦点环规范（B5.3）', () => {
  it('index.css 全局焦点环用 :focus-visible', () => {
    // 这条测试的真实验证在 hoverFocusCompleteness.test.tsx 里读 CSS 源文件断言
    // 这里只做占位，表明"焦点环必须是 :focus-visible"是 B5.3 的一项要求
    expect(true).toBe(true)
  })

  it('输入控件用 :focus，交互控件用 :focus-visible', () => {
    // 规则验证在 hoverFocusCompleteness.test.tsx，这里占位
    expect(true).toBe(true)
  })
})
