import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { CoachOrchestrator } from '../../electron/coach/CoachOrchestrator.ts'
import { AppWindow } from '../../electron/windows/AppWindow.ts'
import { setEnabledSitesFetcher } from '../../electron/parsers/registry.ts'
import type { BrowserPageEvent, TabManager } from '../../electron/browser/TabManager.ts'

/**
 * 约束抽取必须打在"发出事件的那个页面"上，而不是"URL 恰好相同的任意标签"。
 *
 * 这个文件原先是三条 `expect(source).toContain(...)` 的源码字符串断言，理由大概是
 * `CoachOrchestrator` 有 1248 行、构造函数里现造十来个协作者、看着不可测。实测不是：
 * 在 electron 替身下它能直接构造出来（见下面的 `orchestrator()`），也不需要真实数据库。
 *
 * 换掉的原因不是风格：源码断言会为**任何**包含那几个子串的文件放行。把
 * `executeScriptForPage(pageEvent, code)` 那一行原样留着、另加一条按 URL 找标签的分支，
 * 三条断言全都照过——而那正是它声称要防的回归。它也没法覆盖真正的判定
 * （`isPageActive` 为假时不注入、`destroyed` 命中当前页时作废、非主 frame 忽略），
 * 因为那些是控制流而不是文本。
 */

interface ScriptCall { pageEvent: BrowserPageEvent, code: string }

class FakeTabManager {
  readonly scriptCalls: ScriptCall[] = []
  activePage: BrowserPageEvent | null = null
  pageActive = true
  private pageListener: ((event: BrowserPageEvent) => void) | null = null

  addPageEventListener(listener: (event: BrowserPageEvent) => void): () => void {
    this.pageListener = listener
    return () => { this.pageListener = null }
  }

  addActiveTabChangeListener(_listener: () => void): () => void {
    return () => {}
  }

  /*
   * 比赛 URL 聚合会挂到同一个 TabManager 上（`attachAppWindow` →
   * `installContestNavigationTracking`）。本测试不验比赛模式，给个空实现即可——
   * 但不能省：省了 `start()` 就在挂监听那一步抛出，四条用例全红。
   */
  addWebContentsUrlListener(_listener: (snapshot: unknown) => void): () => void {
    return () => {}
  }

  getActivePageEvent(): BrowserPageEvent | null {
    return this.activePage
  }

  /** `ProblemSessionTracker.switchWindow` 会读一次当前 URL 来开会话。 */
  getUrl(): string | null {
    return this.activePage?.url ?? null
  }

  isPageActive(pageEvent: BrowserPageEvent): boolean {
    return this.pageActive && pageEvent.url === this.activePage?.url
  }

  /**
   * 置为 true 时注入不 resolve，把"抓取仍在飞"这个中间态留住。
   *
   * 需要它是因为默认实现同步 resolve，`constraintFetchPending` 在测试观察到之前
   * 就被 `.then()` 清掉了——那条去重分支于是永远测不到（见下面最后一条用例）。
   */
  holdScripts = false
  private readonly heldResolvers: Array<(value: unknown) => void> = []

  async executeScriptForPage(pageEvent: BrowserPageEvent, code: string): Promise<unknown> {
    this.scriptCalls.push({ pageEvent, code })
    if (this.holdScripts) {
      return new Promise<unknown>((resolve) => { this.heldResolvers.push(resolve) })
    }
    // 返回 null 让 ConstraintParser 走"取不到"的静默分支：本测试验的是注入去了哪儿，
    // 不是解析结果对不对（那由 constraintParser.test.ts 负责）。
    return null
  }

  /** 放行所有挂住的注入，让 `.then()` 收尾跑起来。 */
  releaseScripts(): void {
    for (const resolve of this.heldResolvers.splice(0)) resolve(null)
  }

  /** 驱动生产代码注册的那个监听器。 */
  emitPageEvent(event: BrowserPageEvent): void {
    this.pageListener?.(event)
  }

  get hasPageListener(): boolean {
    return this.pageListener !== null
  }
}

function pageEvent(overrides: Partial<BrowserPageEvent> = {}): BrowserPageEvent {
  return {
    url: 'https://codeforces.com/problemset/problem/1/A',
    tabId: 'tab-1',
    webContentsId: 11,
    isMainFrame: true,
    reason: 'did-navigate',
    ...overrides,
  } as BrowserPageEvent
}

function orchestrator(tabManager: FakeTabManager): {
  coach: CoachOrchestrator
  appWindow: AppWindow
} {
  const appWindow = new AppWindow({
    id: 'window-1',
    browserWindow: new MockBrowserWindow() as never,
    tabManager: tabManager as unknown as TabManager,
  })
  const coach = new CoachOrchestrator({
    getAppWindows: () => [appWindow],
    getMostRecentAppWindow: () => appWindow,
    addMostRecentWindowChangeListener: () => () => {},
    isAnyAppWindowFocused: () => true,
    // 只有 addProblemDetectedListener 会被 ProblemSessionTracker 调到。
    getTrackingService: () => ({ addProblemDetectedListener: () => () => {} }) as never,
    getRealtimeSubmissionService: () => null,
    getCoachPetWindow: () => null,
  })
  return { coach, appWindow }
}

/*
 * 必须注册启用站点，否则 `parseUrl` 一律返回 null。
 *
 * 这一步是本文件写出来之后第一次真跑才发现的，值得记下来：少了它，四条用例**全绿**，
 * 因为 `maybeFetchConstraints` 在 `parseUrl` 那一步就 return 了，"没有注入"成了默认结论。
 * 三条"不应注入"的用例于是完全空转——它们断言的 `scriptCalls.length` 永远等于 baseline，
 * 无论生产代码怎么改。只有第一条"应该注入"的用例会红，反而是它救了另外三条。
 *
 * 教训不是"记得初始化替身"，而是：只有一条正向用例的套件里，那条正向用例同时也是
 * 其余反向用例的脚手架检查。写反向断言时得确认正向路径真的走通了。
 *
 * 生产里这份名单来自数据库（`setEnabledSitesFetcher` 在 main 启动时接上仓库查询），
 * 本测试不碰数据库，直接给一条 codeforces 记录。
 */
beforeEach(() => {
  resetElectronMock()
  setEnabledSitesFetcher(() => [
    { id: 'codeforces', domains: ['codeforces.com'], enabled: true },
  ])
})

// 模块级状态，跑完还回去：Vitest 默认按文件隔离，但不指望这一点。
afterEach(() => {
  setEnabledSitesFetcher(() => [])
})

test('约束脚本只打在发出事件的那个页面上', async () => {
  const tabManager = new FakeTabManager()
  const active = pageEvent()
  tabManager.activePage = active
  const { coach } = orchestrator(tabManager)

  coach.start()
  // start() 走的是 windowFollower.applyNow（同步），所以监听器此刻已经挂上了。
  assert.strictEqual(tabManager.hasPageListener, true, 'start() 应挂上 page 事件监听')
  await Promise.resolve()

  assert.ok(tabManager.scriptCalls.length > 0, '活动题目页应触发约束抽取')
  for (const call of tabManager.scriptCalls) {
    // 承重断言：拿到的是 pageEvent 本身（含 tabId/webContentsId），不是一个 URL 字符串。
    // 生产代码若改回按 URL 找标签，这里的 pageEvent 就对不上。
    assert.strictEqual(call.pageEvent, active, '注入目标必须是发出事件的那个 page')
    assert.strictEqual(call.pageEvent.tabId, 'tab-1')
    assert.strictEqual(call.pageEvent.webContentsId, 11)
  }
  coach.stop()
})

test('页面不再是活动页时不注入', async () => {
  const tabManager = new FakeTabManager()
  tabManager.activePage = pageEvent()
  const { coach } = orchestrator(tabManager)
  coach.start()
  await Promise.resolve()
  const baseline = tabManager.scriptCalls.length

  /*
   * 用户切到别的标签之后，同一个 page 事件迟到了。
   *
   * 这条守的是 `maybeFetchConstraints` 里的 `isPageActive(pageEvent)`：少了它，
   * 后台标签的题面会被注入脚本，而且抓到的约束会覆盖用户正在看的那道题。
   */
  tabManager.pageActive = false
  tabManager.emitPageEvent(pageEvent({ url: 'https://codeforces.com/problemset/problem/2/B' }))
  await Promise.resolve()

  assert.strictEqual(tabManager.scriptCalls.length, baseline, '非活动页不应被注入')
  coach.stop()
})

test('非主 frame 的事件被忽略', async () => {
  const tabManager = new FakeTabManager()
  tabManager.activePage = pageEvent()
  const { coach } = orchestrator(tabManager)
  coach.start()
  await Promise.resolve()
  const baseline = tabManager.scriptCalls.length

  // iframe 广告位换页不该触发一次题面重抓。
  tabManager.emitPageEvent(pageEvent({ isMainFrame: false, reason: 'did-navigate' }))
  await Promise.resolve()

  assert.strictEqual(tabManager.scriptCalls.length, baseline, '子 frame 事件不应触发抽取')
  coach.stop()
})

test('抓取还在飞时，同题同页的非导航事件不再重复注入', async () => {
  const tabManager = new FakeTabManager()
  const active = pageEvent()
  tabManager.activePage = active
  tabManager.holdScripts = true
  const { coach } = orchestrator(tabManager)

  coach.start()
  await Promise.resolve()
  assert.strictEqual(tabManager.scriptCalls.length, 1, '第一次应真的注入')

  /*
   * 这条守的是 `maybeFetchConstraints` 去重条件末项里的 `constraintFetchPending`
   * （CoachOrchestrator.ts:382）。它是那个条件的**唯一**在飞态判据：另一半
   * `currentConstraints !== null` 在抓取完成前恒为 null，指望不上。
   *
   * 为什么补这条：把 `constraintFetchPending = true` 改成 `= false`，388 条 coach
   * 用例全绿——包括那份 1839 行、把这个文件从 30.94% 抬到 94.91% 的生命周期套件。
   * 覆盖率把这一行算作"已覆盖"（赋值语句确实执行了），但没有任何断言在乎它的值。
   * 这正是 94.91% 会藏起来的东西：行被跑到 ≠ 行为被固定。
   *
   * 事件的 reason 必须是 `active-tab-changed`，这一点是写这条用例时踩出来的：
   * 页面监听器只放行 `did-navigate` / `did-navigate-in-page` / `active-tab-changed`
   * 三种（CoachOrchestrator.ts:448）。初版用的 `page-title-updated` 在监听器那一层
   * 就被挡掉，压根到不了去重判定——断言照过，但过的理由是错的，又是一次空转。
   * 而前两种都算导航、会跳过整个去重条件，所以能触达这条分支的只有第三种。
   *
   * 真实后果：用户切走再切回同一个标签（两次 `active-tab-changed`）时，若抓取还没回来，
   * 少了这个标志就会对同一个页面再注入一遍，重新拉一次题面。
   */
  tabManager.emitPageEvent(pageEvent({ reason: 'active-tab-changed' }))
  await Promise.resolve()
  assert.strictEqual(tabManager.scriptCalls.length, 1, '在飞期间不应重复注入')

  // 放行之后 pending 落回 false，此时同一个事件应当能重新触发——否则就是反过来卡死了。
  // 用 setImmediate 排空而不是数几个 `await Promise.resolve()`：收尾要穿过
  // `fetchAndParse` 的 await、它的 return、再到 `.then()`，靠数微任务轮次很脆。
  tabManager.releaseScripts()
  await new Promise((resolve) => { setImmediate(resolve) })
  tabManager.holdScripts = false
  tabManager.emitPageEvent(pageEvent({ reason: 'active-tab-changed' }))
  await Promise.resolve()
  assert.strictEqual(tabManager.scriptCalls.length, 2, '抓取收尾后应恢复可触发')

  coach.stop()
})

test('非题目页与空 URL 不触发抽取', async () => {
  const tabManager = new FakeTabManager()
  // 活动页是首页，`parseUrl` 认不出题目身份。
  tabManager.activePage = pageEvent({ url: 'https://codeforces.com/' })
  const { coach } = orchestrator(tabManager)

  coach.start()
  await Promise.resolve()

  assert.deepStrictEqual(tabManager.scriptCalls, [], '非题目页不应触发抽取')
  coach.stop()
})
