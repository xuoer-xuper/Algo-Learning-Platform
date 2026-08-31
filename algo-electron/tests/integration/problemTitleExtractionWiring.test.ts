import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'
import type { BrowserPageEvent, TabManager } from '../../electron/browser/TabManager.ts'
import type { ProblemIdentity } from '../../electron/shared/types.ts'
import type { Logger } from '../../electron/shared/logger.ts'
import { BrowserDiagnostics } from '../../electron/diagnostics/BrowserDiagnostics.ts'
import { createProblemTitleFallbackScript } from '../../electron/parsers/problemTitleFallback.ts'
import { setEnabledSitesFetcher } from '../../electron/parsers/registry.ts'
import { installProblemTitleTracking } from '../../electron/tracking/problemTitleTracking.ts'

/**
 * 标题抽取的接线：事件进来之后，标题到底有没有落库、DOM 兜底打在了哪个页面上。
 *
 * 这个文件原先是五条 `assert.ok(source.includes(...))`，读 `main.ts` 和
 * `problemTitleTracking.ts` 的源码文本。换掉的理由不是风格：那五条断言对
 * **任何**含有那几个子串的文件放行。把 `executeScriptForPage(event, script)`
 * 原样留在文件里、另加一条按 URL 找标签的分支，五条全过——而那正是它声称要防的回归。
 * 反过来，把 `scheduleTitleExtraction` 改个名字、行为一模一样，它却变红。
 *
 * 与 `tests/tracking/problemTitleTrackingPageEvents.test.ts` 的分工：那份把
 * `resolveBrowserTitleProblemIdentity` 和 `parseUrl` 都换成了替身，验的是控制流
 * （谁被调、调几次）。所以"真实 URL 能解析出身份、真实标题能洗干净"这一段没人管：
 * 那边的替身里"标题以 DOM 结尾就算有效"，跟线上规则无关。本文件走真解析器栈，
 * 只把 `upsertProblem`（唯一的数据库写）换掉，用它捕获最终落库的身份。
 *
 * 另外记一笔契约事实：`installProblemTitleTracking` 返回的是 `BrowserDiagnostics`，
 * **不是** disposer。它把 `addPageEventListener` / `addActiveTabChangeListener` 的
 * 退订句柄直接丢掉了，`main.ts` 也没接返回值。所以"用返回的 disposer 拆监听"这条
 * 无法测——它不存在。真实存在的拆除路径是 `destroyed` 事件作废该页的待执行抽取，
 * 见最后两条用例。
 */

const persisted = vi.hoisted(() => {
  const identities: ProblemIdentity[] = []
  return { identities }
})

// 唯一被换掉的协作者：真 `upsertProblem` 要开数据库连接，而本文件关心的是
// "解析器产出的身份有没有原样递到持久化层"，捕获入参比查库更直接。
vi.mock('../../electron/db/repositories/problemRepository', () => ({
  upsertProblem: (identity: ProblemIdentity) => { persisted.identities.push(identity) },
}))

// 诊断默认写 appLogger，会把跳过/失败刷到测试输出里；注入静默 logger 只为闭嘴，
// 顺带拿到 getSnapshot() 这个可断言面。
const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  getLogFilePath: () => null,
}

interface ScriptCall { event: BrowserPageEvent, code: string }
interface NavigateCall { event: BrowserPageEvent, url: string }

class FakeTabManager {
  /** 按 webContentsId 配的 DOM 兜底返回值与浏览器标题，用来分辨"打在了哪个页面上"。 */
  readonly domTitles = new Map<number, string>()
  readonly browserTitles = new Map<number, string>()
  readonly scriptCalls: ScriptCall[] = []
  readonly titleCalls: BrowserPageEvent[] = []
  readonly navigateCalls: NavigateCall[] = []
  private pageListener: ((event: BrowserPageEvent) => void) | null = null

  addPageEventListener(listener: (event: BrowserPageEvent) => void): () => void {
    this.pageListener = listener
    return () => { this.pageListener = null }
  }

  /*
   * 安装时会顺手挂一条活动标签监听（用于没有 page 事件时的窗口级兜底）。
   * 本文件不触发它，但不能省：省了 installProblemTitleTracking 当场抛错，全部用例红。
   */
  addActiveTabChangeListener(_listener: (url: string) => void): () => void {
    return () => {}
  }

  /** 延迟抽取的第一步是重读一次浏览器标题；记录入参是为了断言读的是哪个页面。 */
  getTitleForPage(event: BrowserPageEvent): string | null {
    this.titleCalls.push(event)
    return this.browserTitles.get(event.webContentsId) ?? null
  }

  /** DOM 兜底的落点。承重：记下的是 event 本身，不是 URL 字符串。 */
  executeScriptForPage(event: BrowserPageEvent, code: string): Promise<unknown> {
    this.scriptCalls.push({ event, code })
    return Promise.resolve(this.domTitles.get(event.webContentsId) ?? '')
  }

  /** Codeforces 报 "Illegal contest ID" 时会被改导航到 gym 附件页。 */
  navigatePage(event: BrowserPageEvent, url: string): Promise<void> {
    this.navigateCalls.push({ event, url })
    return Promise.resolve()
  }

  /** 驱动生产代码注册的那个监听器。 */
  emitPageEvent(event: BrowserPageEvent): void {
    this.pageListener?.(event)
  }
}

const LEETCODE_URL = 'https://leetcode.cn/problems/two-sum/'
const CODEFORCES_URL = 'https://codeforces.com/problemset/problem/1/A'

function pageEvent(overrides: Partial<BrowserPageEvent> = {}): BrowserPageEvent {
  return {
    windowId: 'window-1',
    tabId: 'tab-101',
    webContentsId: 101,
    url: LEETCODE_URL,
    isMainFrame: true,
    reason: 'page-title-updated',
    ...overrides,
  }
}

function install(tabManager: FakeTabManager): { diagnostics: BrowserDiagnostics, notifyCount: () => number } {
  let notified = 0
  const diagnostics = installProblemTitleTracking({
    tabManager: tabManager as unknown as TabManager,
    // page-title-updated 与 destroyed 两条路径都不需要 TrackingService：前者根本不碰它，
    // 后者只有 `getTrackingService()?.endVisitForPage(event)` 一处可选链。返回 null 就
    // 不用再造第二个替身，也省掉一次类型断言。endVisitForPage 由姊妹文件覆盖。
    getTrackingService: () => null,
    notifyProblemsUpdated: () => { notified += 1 },
    diagnostics: new BrowserDiagnostics(silentLogger),
  })
  return { diagnostics, notifyCount: () => notified }
}

/*
 * 必须注册启用站点，否则 `parseUrl` 一律返回 null，"没落库"会变成默认结论，
 * 几条反向断言就全成了空转。每条用例里都有一条正向断言（真的落了库 / 真的注入了）
 * 给反向断言当脚手架检查，就是为了盯住这件事。
 *
 * 生产里这份名单来自数据库（main 启动时把仓库查询接上 setEnabledSitesFetcher），
 * 本测试不碰数据库，直接给两条记录。id 用的是内置适配器的真实 id：leetcode 中国站
 * 是 `leetcode-cn`，写成 `leetcode` 会匹配不到适配器。
 */
beforeEach(() => {
  vi.useFakeTimers()
  persisted.identities.length = 0
  setEnabledSitesFetcher(() => [
    { id: 'leetcode-cn', domains: ['leetcode.cn'], enabled: true },
    { id: 'codeforces', domains: ['codeforces.com'], enabled: true },
  ])
})

// 模块级状态，跑完还回去：Vitest 默认按文件隔离，但不指望这一点。
afterEach(() => {
  vi.useRealTimers()
  setEnabledSitesFetcher(() => [])
})

test('page-title-updated 带来可用标题时当场落库，并且不再排延迟抽取', async () => {
  const tabManager = new FakeTabManager()
  const { diagnostics, notifyCount } = install(tabManager)

  // 站点后缀由真实的 cleanBrowserProblemTitle 摘掉，这里给的是浏览器原始 title。
  tabManager.emitPageEvent(pageEvent({ title: '两数之和 - 力扣（LeetCode）' }))

  assert.equal(persisted.identities.length, 1, '可用标题应立刻落库')
  const identity = persisted.identities[0]
  assert.equal(identity.platform, 'leetcode-cn')
  assert.equal(identity.platformProblemId, 'two-sum')
  assert.equal(identity.title, '两数之和', '标题需去掉站点后缀后入库')
  assert.equal(identity.canonicalUrl, LEETCODE_URL)
  assert.equal(notifyCount(), 1, '落库后应通知渲染层刷新题目列表')
  assert.ok(
    diagnostics.getSnapshot().entries.some(
      (entry) => entry.area === 'title' && entry.event === 'extract' && entry.status === 'success',
    ),
    '成功抽取应留下一条 success 诊断',
  )

  // 已经成功过的页面不该再被延迟任务打扰：多余的定时抽取会对同一道题反复写库，
  // 而且 8 秒后页面可能已经导航走了。
  await vi.advanceTimersByTimeAsync(8000)
  assert.deepEqual(tabManager.titleCalls, [], '成功后不应再排延迟抽取')
  assert.equal(persisted.identities.length, 1, '不应重复落库')
})

test('标题不可用时改排延迟抽取，且到点之前不动手', async () => {
  const tabManager = new FakeTabManager()
  // 2 秒后重读时标题已经就绪；'Loading' 被 isBadScrapedTitle 判为无效，走不到落库。
  tabManager.browserTitles.set(101, '两数之和 - 力扣（LeetCode）')
  const { notifyCount } = install(tabManager)

  tabManager.emitPageEvent(pageEvent({ title: 'Loading' }))

  // 这两条用 length 而不是 deepEqual(..., [])：后者的类型签名带 `asserts actual is T`，
  // 会把数组在本作用域里收窄成 never[]，下面读 identities[0].title 就编译不过。
  assert.equal(persisted.identities.length, 0, '无效标题不应落库')
  assert.equal(tabManager.titleCalls.length, 0, '抽取必须是延迟的，不能在事件里同步做掉')

  await vi.advanceTimersByTimeAsync(2000)
  assert.equal(tabManager.titleCalls.length, 1, '2 秒后应重读一次标题')
  assert.equal(persisted.identities.length, 1, '重读到有效标题后应落库')
  assert.equal(persisted.identities[0].title, '两数之和')
  assert.equal(notifyCount(), 1)
})

test('DOM 兜底打在发出事件的那个页面上，同 URL 的另一个标签不受牵连', async () => {
  const tabManager = new FakeTabManager()
  /*
   * 用 Codeforces 是因为它的浏览器标题被生产代码主动拒收（isCodeforcesUrl），
   * 唯一能拿到标题的路只剩 DOM 兜底——正好把兜底这条路逼出来。
   *
   * 两个标签开着同一道题（比如用户中键点开了第二份），只有 202 发出事件。
   * 如果哪天改回"按 URL 找标签"，注入就会落到 101 上，抓到的标题还会盖掉 202 的进度。
   */
  tabManager.domTitles.set(202, 'A. Theatre Square')
  tabManager.domTitles.set(101, 'WRONG PAGE')
  install(tabManager)

  const emitted = pageEvent({
    url: CODEFORCES_URL,
    tabId: 'tab-202',
    webContentsId: 202,
    title: 'Problem - 1A - Codeforces',
  })
  tabManager.emitPageEvent(emitted)
  await vi.advanceTimersByTimeAsync(2000)

  assert.equal(tabManager.scriptCalls.length, 1, '应只注入一次')
  const call = tabManager.scriptCalls[0]
  // 承重断言：拿到的是 emitted 这个对象本身（含 tabId/webContentsId），不是 URL。
  assert.equal(call.event, emitted, '注入目标必须是发出事件的那个 page')
  assert.equal(call.event.tabId, 'tab-202')
  assert.equal(call.event.webContentsId, 202)
  // 注入的脚本就是解析器为这个 URL 生成的那份，不是别处拼出来的。
  assert.equal(call.code, createProblemTitleFallbackScript(CODEFORCES_URL))
  assert.deepEqual(tabManager.titleCalls.map((event) => event.webContentsId), [202])

  assert.equal(persisted.identities.length, 1, 'DOM 兜底的结果应落库')
  assert.equal(persisted.identities[0].title, 'Theatre Square', '题号前缀 "A." 应被摘掉')
  assert.equal(persisted.identities[0].platformProblemId, '1A')
})

test('destroyed 作废该页待执行的抽取，别的页照跑', async () => {
  const tabManager = new FakeTabManager()
  tabManager.domTitles.set(101, 'A. Theatre Square')
  tabManager.domTitles.set(202, 'A. Theatre Square')
  install(tabManager)

  const closing = pageEvent({ url: CODEFORCES_URL, tabId: 'tab-101', webContentsId: 101 })
  const staying = pageEvent({ url: CODEFORCES_URL, tabId: 'tab-202', webContentsId: 202 })
  tabManager.emitPageEvent(closing)
  tabManager.emitPageEvent(staying)

  /*
   * 用户在定时器到点前关掉了 101。这是这套接线里真实存在的拆除路径
   * （返回值是 diagnostics，没有 disposer 可用）。少了它，2 秒后会对着已销毁的
   * webContents 注入脚本，TabManager.resolvePageTab 抛错、诊断里刷一条 fallback failed。
   */
  tabManager.emitPageEvent(pageEvent({ url: CODEFORCES_URL, tabId: 'tab-101', webContentsId: 101, reason: 'destroyed' }))
  await vi.advanceTimersByTimeAsync(8000)

  assert.deepEqual(
    tabManager.scriptCalls.map((call) => call.event.webContentsId),
    [202],
    '已销毁的页不应再被注入，未销毁的页必须照跑',
  )
  assert.equal(persisted.identities.length, 1, '只有存活的那个页应落库')
})

test('Codeforces 报 Illegal contest ID 时改导航到 gym 附件页，并放弃本轮抽取', async () => {
  const tabManager = new FakeTabManager()
  install(tabManager)

  // 比赛题在 gym 里才有附件，contest 路径下会被 CF 判非法；生产代码据此改导航。
  const emitted = pageEvent({
    url: 'https://codeforces.com/contest/1234/problem/A',
    reason: 'page-title-updated',
    title: 'Illegal contest ID',
  })
  tabManager.emitPageEvent(emitted)

  assert.deepEqual(tabManager.navigateCalls, [
    { event: emitted, url: 'https://codeforces.com/gym/1234/attachments' },
  ], '应带着发出事件的那个 page 改导航到 gym 附件页')

  // 改导航之后本轮必须收手：页面就要换掉了，再排抽取只会对旧 URL 白跑一趟。
  await vi.advanceTimersByTimeAsync(8000)
  assert.deepEqual(tabManager.titleCalls, [], '改导航后不应再排延迟抽取')
  assert.deepEqual(tabManager.scriptCalls, [], '改导航后不应注入兜底脚本')
})
