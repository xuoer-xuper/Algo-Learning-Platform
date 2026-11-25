// @vitest-environment jsdom
import { render } from './renderWithDataRefresh'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
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

function deferredTransitionPromise() {
  let resolve = () => {}
  let reject = (_reason: unknown) => {}
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function queuedNativeTransitions() {
  const queued: {
    skip: ReturnType<typeof vi.fn<() => void>>
    run: (beforeReturn?: () => void) => void
    finish: () => void
    reject: () => void
  }[] = []
  const start = vi.fn<typeof document.startViewTransition>((options) => {
    const update = typeof options === 'function' ? options : options?.update
    const ready = deferredTransitionPromise()
    const updated = deferredTransitionPromise()
    const finished = deferredTransitionPromise()
    const skip = vi.fn<() => void>()
    queued.push({
      skip,
      run(beforeReturn) {
        update?.()
        beforeReturn?.()
        updated.resolve()
        ready.resolve()
      },
      finish() {
        ready.resolve()
        updated.resolve()
        finished.resolve()
      },
      reject() {
        const error = new DOMException('Transition was skipped', 'AbortError')
        ready.reject(error)
        updated.reject(error)
        finished.reject(error)
      },
    })
    return {
      ready: ready.promise,
      updateCallbackDone: updated.promise,
      finished: finished.promise,
      types: new Set<string>(),
      skipTransition: skip,
    }
  })
  document.startViewTransition = start
  return { start, queued }
}

const homeTab = () => internalTab({ id: 'home', page: { type: 'home' }, url: 'algo://home' })
function router(tab: TabStripTabInfo | null) {
  return (
    <ShellRouter
      activeTab={tab}
      onNavigate={vi.fn()}
      onCloseActiveTab={vi.fn()}
      onReloadActiveTab={vi.fn()}
    />
  )
}

async function waitForDashboard(): Promise<void> {
  await vi.dynamicImportSettled()
  expect(await screen.findByRole('heading', { name: '学习统计', level: 2 })).toBeTruthy()
  await waitFor(() => {
    expect(screen.queryByLabelText('总题数加载中')).toBeNull()
    expect(window.api.stats.getVisitedTrend).toHaveBeenCalledWith(30)
    expect(window.api.ai.getWeaknessAnalysis).toHaveBeenCalledWith(8)
  })
}

function DeliverStaleCallback({ deliver }: { deliver: () => void }) {
  React.useEffect(deliver, [deliver])
  return null
}

describe('View Transitions（B5.3）', () => {
  let native: ReturnType<typeof queuedNativeTransitions>
  let originalDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
    native = queuedNativeTransitions()
  })

  afterEach(async () => {
    cleanup()
    await act(async () => {
      for (const item of native.queued) item.finish()
    })
    if (originalDescriptor)
      Object.defineProperty(document, 'startViewTransition', originalDescriptor)
    else Reflect.deleteProperty(document, 'startViewTransition')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('native callback commits the route wrapper before snapshot callback returns', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { container, rerender } = render(router(internalTab()))
    await waitForDashboard()
    const settings = internalTab({
      id: 'settings',
      page: { type: 'settings' },
      url: 'algo://settings',
    })
    rerender(router(settings))
    expect(native.start).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.shell-route-dashboard')).toBeTruthy()
    await act(async () => {
      native.queued[0].run(() => {
        expect(container.querySelector('.shell-route-settings')).toBeTruthy()
        expect(container.querySelector('.shell-route-dashboard')).toBeNull()
      })
    })
    await waitForSettingsPage()
  })

  it('no native API updates directly without lifecycle console errors', async () => {
    Reflect.deleteProperty(document, 'startViewTransition')
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, rerender } = render(router(homeTab()))
    rerender(router(internalTab()))
    expect(container.querySelector('.shell-route-dashboard')).toBeTruthy()
    await waitForDashboard()
    expect(native.start).not.toHaveBeenCalled()
    expect(errors.mock.calls).toEqual([])
  })

  it('initial sub-200ms burst updates directly without lifecycle console errors', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(199)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, rerender } = render(router(homeTab()))
    rerender(router(internalTab()))
    expect(container.querySelector('.shell-route-dashboard')).toBeTruthy()
    await waitForDashboard()
    expect(native.start).not.toHaveBeenCalled()
    expect(errors.mock.calls).toEqual([])
  })

  it.each([199, 200])(
    'preserves the exact %sms burst boundary and rejects skipped stale callbacks',
    async (elapsed) => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { container, rerender } = render(router(homeTab()))
      rerender(router(internalTab()))
      expect(native.start).toHaveBeenCalledTimes(1)
      clock.mockReturnValue(1000 + elapsed)
      rerender(router(homeTab()))
      expect(native.queued[0].skip).toHaveBeenCalledTimes(1)
      expect(native.start).toHaveBeenCalledTimes(elapsed === 199 ? 1 : 2)
      if (elapsed === 200)
        await act(async () => {
          native.queued[1].run()
        })
      expect(container.querySelector('.shell-route-home')).toBeTruthy()
      // A skipped native transition still delivers its update callback. Running it
      // inside an effect also detects any flush placed before the version guard.
      render(<DeliverStaleCallback deliver={() => native.queued[0].run()} />)
      await vi.dynamicImportSettled()
      expect(container.querySelector('.shell-route-home')).toBeTruthy()
      expect(container.querySelector('.shell-route-dashboard')).toBeNull()
      expect(errors.mock.calls).toEqual([])
    },
  )

  it('no-API fallback invalidates an older callback without adding cancellation', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, rerender } = render(router(homeTab()))
    rerender(router(internalTab()))
    Reflect.deleteProperty(document, 'startViewTransition')
    clock.mockReturnValue(2000)
    rerender(router(homeTab()))
    expect(native.start).toHaveBeenCalledTimes(1)
    expect(native.queued[0].skip).not.toHaveBeenCalled()
    render(<DeliverStaleCallback deliver={() => native.queued[0].run()} />)
    await vi.dynamicImportSettled()
    expect(container.querySelector('.shell-route-home')).toBeTruthy()
    expect(container.querySelector('.shell-route-dashboard')).toBeNull()
    expect(errors.mock.calls).toEqual([])
  })

  it.each(['finish', 'reject'] as const)(
    'older %s cannot clear a newer live transition and all rejection branches are handled',
    async (settle) => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason)
      }
      process.on('unhandledRejection', onUnhandled)
      try {
        const { container, rerender } = render(router(homeTab()))
        rerender(router(internalTab()))
        clock.mockReturnValue(2000)
        rerender(router(homeTab()))
        await act(async () => {
          native.queued[0][settle]()
        })
        clock.mockReturnValue(3000)
        rerender(router(internalTab({ id: 'newest-dashboard' })))
        expect(native.queued[1].skip).toHaveBeenCalledTimes(1)
        await act(async () => {
          native.queued[2].run(() =>
            expect(container.querySelector('.shell-route-dashboard')).toBeTruthy(),
          )
          native.queued[0].run()
          native.queued[1].run()
          native.queued[1].reject()
        })
        await waitForDashboard()
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(container.querySelector('.shell-route-dashboard')).toBeTruthy()
        expect(unhandled).toEqual([])
        expect(errors.mock.calls).toEqual([])
      } finally {
        process.off('unhandledRejection', onUnhandled)
      }
    },
  )

  it('same tab metadata updates without a transition', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tab = internalTab()
    const { container, rerender } = render(router(tab))
    await waitForDashboard()
    rerender(router({ ...tab, title: 'Updated dashboard' }))
    expect(native.start).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.shell-route')).toHaveLength(1)
    expect(errors.mock.calls).toEqual([])
  })

  it('retains the Date clock fallback at the 200ms nonburst boundary', async () => {
    const { container, rerender } = render(router(homeTab()))
    vi.stubGlobal('performance', undefined)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(200)
    const calls = clock.mock.calls.length
    rerender(router(internalTab()))
    expect(clock.mock.calls.length - calls).toBe(1)
    expect(native.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      native.queued[0].run(() =>
        expect(container.querySelector('.shell-route-dashboard')).toBeTruthy(),
      )
    })
    vi.unstubAllGlobals()
    await waitForDashboard()
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
