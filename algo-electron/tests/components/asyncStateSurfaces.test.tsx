// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/*
 * 三个界面的"加载中不许伪装成空"契约（B5.2）。
 *
 * 改造前三处对同一处境给了三种答案，其中两种在说谎：
 *   - 题库侧栏：加载中显示"暂无记录"
 *   - Dashboard：加载中显示 `?? 0`，即"总题数 0"
 *   - 首页：正确区分，但加载中整块不渲染，数据到了突然弹出
 *
 * 所以这里的每条断言都指向一个具体的谎言，而不是"渲染了骨架"这种同义反复：
 * 加载中**不得**出现终态文案（"暂无记录"/"0"），加载完成后**必须**出现。
 */

/*
 * jsdom 没有 ResizeObserver，而侧栏用它同步宽度给主进程（壳要据此挪 WebContentsView）。
 * 只在本文件补一个空实现，不加全局 setupFile —— 那会改到所有测试的运行环境。
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const loadRecentProblems = vi.fn()
const subscribeProblemsUpdated = vi.fn(() => () => {})

vi.mock('../../src/features/problems/problemsApi', () => ({
  loadRecentProblems: (...args: unknown[]) => loadRecentProblems(...args),
  setProblemSidebarWidth: vi.fn(),
  subscribeProblemsUpdated: (fn: () => void) => subscribeProblemsUpdated(fn),
}))

const loadHomeOverviewStats = vi.fn()
const loadHomeRecentProblems = vi.fn()

vi.mock('../../src/features/home/homeApi', () => ({
  loadHomeOverviewStats: () => loadHomeOverviewStats(),
  loadHomeRecentProblems: (limit: number) => loadHomeRecentProblems(limit),
  loadHomeShortcuts: vi.fn(async () => []),
  loadHomeRecommendations: vi.fn(async () => []),
  subscribeHomeProblemsUpdated: vi.fn(() => () => {}),
}))

import { DashboardListsPanel } from '../../src/features/analytics/DashboardListsPanel'
import { HomePage } from '../../src/features/home/HomePage'
import { ProblemSidebar } from '../../src/features/problems/ProblemSidebar'

const problem = {
  id: 'p1',
  platform: 'codeforces',
  platform_problem_id: '4A',
  title: '两数之和',
  canonical_url: 'https://codeforces.com/problemset/problem/4/A',
  status: 'solved',
  submission_count: 2,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('题库侧栏的三态', () => {
  it('加载中出骨架，且绝不出现"暂无记录"', async () => {
    const gate = deferred<unknown[]>()
    loadRecentProblems.mockReturnValue(gate.promise)

    render(<ProblemSidebar onNavigate={() => {}} onShowDetail={() => {}} onShowNotes={() => {}} />)

    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByText('暂无记录')).toBeNull()
    // 标题也不许报 0：`题库 (0)` 同样会被读成"空的"
    expect(screen.getByText('题库')).toBeTruthy()

    gate.resolve([])
    await waitFor(() => expect(screen.getByText('暂无记录')).toBeTruthy())
  })

  it('读到空列表才显示"暂无记录"，并给出下一步提示', async () => {
    loadRecentProblems.mockResolvedValue([])
    render(<ProblemSidebar onNavigate={() => {}} onShowDetail={() => {}} onShowNotes={() => {}} />)

    await waitFor(() => expect(screen.getByText('暂无记录')).toBeTruthy())
    expect(screen.getByText('浏览题目页面后会自动记录在这里')).toBeTruthy()
    expect(screen.getByText('题库 (0)')).toBeTruthy()
  })

  it('筛选无结果与真的没有记录说不同的话', async () => {
    /*
     * 改造前这两种处境共用"暂无记录"。原代码里有一行注释承认了这件事，
     * 但只是记下来没有分开——筛掉全部结果时用户会以为题库被清空了。
     */
    loadRecentProblems.mockResolvedValue([problem])
    render(<ProblemSidebar onNavigate={() => {}} onShowDetail={() => {}} onShowNotes={() => {}} />)
    await waitFor(() => expect(screen.getByText('两数之和')).toBeTruthy())

    loadRecentProblems.mockResolvedValue([])
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'acwing' } })

    await waitFor(() => expect(screen.getByText('没有符合筛选条件的题目')).toBeTruthy())
    expect(screen.queryByText('暂无记录')).toBeNull()
  })

  it('读失败落到空态而不是永久骨架', async () => {
    loadRecentProblems.mockRejectedValue(new Error('boom'))
    render(<ProblemSidebar onNavigate={() => {}} onShowDetail={() => {}} onShowNotes={() => {}} />)

    await waitFor(() => expect(screen.getByText('暂无记录')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('题目行键盘可达，且主区域里不嵌图标按钮', async () => {
    const onNavigate = vi.fn()
    loadRecentProblems.mockResolvedValue([problem])
    render(<ProblemSidebar onNavigate={onNavigate} onShowDetail={() => {}} onShowNotes={() => {}} />)

    const row = await waitFor(() => screen.getByRole('button', { name: '打开 两数之和' }))
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith(problem.canonical_url)
    expect(row.querySelector('button')).toBeNull()
  })

  it('折叠后仍是同一个 .sidebar 根节点，且能用键盘展开', async () => {
    // 同一个根节点是过渡动画的前提：两棵不同子树之间没有可插值的宽度。
    loadRecentProblems.mockResolvedValue([])
    const { container } = render(
      <ProblemSidebar onNavigate={() => {}} onShowDetail={() => {}} onShowNotes={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText('暂无记录')).toBeTruthy())

    fireEvent.click(screen.getByTitle('收起题库'))
    const collapsed = container.querySelector('.sidebar')
    expect(collapsed).toBeTruthy()
    expect(collapsed?.classList.contains('sidebar-is-collapsed')).toBe(true)

    fireEvent.keyDown(screen.getByRole('button', { name: '展开题库' }), { key: 'Enter' })
    await waitFor(() => expect(container.querySelector('.sidebar-is-collapsed')).toBeNull())
  })
})

describe('Dashboard 列表的三态', () => {
  const props = {
    timeline: null,
    wrongProblems: null,
    unreviewed: null,
    revisits: null,
    onNavigate: () => {},
  }

  it('null 出骨架，绝不出现"暂无数据"', () => {
    render(<DashboardListsPanel {...props} />)
    expect(screen.queryByText('暂无数据')).toBeNull()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('空数组才是"暂无数据"', () => {
    render(<DashboardListsPanel {...props} timeline={[]} wrongProblems={[]} unreviewed={[]} revisits={[]} />)
    expect(screen.getAllByText('暂无数据')).toHaveLength(4)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('列表行键盘可达', () => {
    const onNavigate = vi.fn()
    render(
      <DashboardListsPanel
        {...props}
        timeline={[]}
        wrongProblems={[{ ...problem, wrong_count: 3 } as never]}
        unreviewed={[]}
        revisits={[]}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '打开 两数之和' }), { key: ' ' })
    expect(onNavigate).toHaveBeenCalledWith(problem.canonical_url)
  })
})

describe('首页的加载态', () => {
  it('加载中出骨架，不出"还没有学习记录"', async () => {
    const stats = deferred<unknown>()
    loadHomeOverviewStats.mockReturnValue(stats.promise)
    loadHomeRecentProblems.mockReturnValue(new Promise(() => {}))

    render(<HomePage onNavigate={() => {}} />)

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(screen.queryByText('还没有学习记录')).toBeNull()

    stats.resolve({ totalProblems: 0, todayVisited: 0, platformDistribution: [] })
    await waitFor(() => expect(screen.getByText('还没有学习记录')).toBeTruthy())
  })

  it('最近访问加载完成后行是键盘可达的', async () => {
    const onNavigate = vi.fn()
    loadHomeOverviewStats.mockResolvedValue({ totalProblems: 1, todayVisited: 1, platformDistribution: [] })
    loadHomeRecentProblems.mockResolvedValue([problem])

    render(<HomePage onNavigate={onNavigate} />)

    const row = await waitFor(() => screen.getByRole('button', { name: '打开 两数之和' }))
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith(problem.canonical_url)
  })
})
