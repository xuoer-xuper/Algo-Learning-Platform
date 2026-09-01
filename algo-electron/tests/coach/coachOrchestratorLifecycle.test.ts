import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { MockBrowserWindow, resetElectronMock } from '../electron/electronMock'
import { closeDb, initDbAtPath } from '../../electron/db/connection.ts'
import {
  buildCoachEvent,
  insertCoachEvent,
  listCoachEvents,
  listCoachEventsByProblem,
} from '../../electron/db/repositories/coach/eventsRepository.ts'
import {
  buildCoachIntervention,
  insertCoachIntervention,
  listCoachInterventions,
  listContestAuditRecords,
} from '../../electron/db/repositories/coach/interventionsRepository.ts'
import { listCoachFeedback } from '../../electron/db/repositories/coach/feedbackRepository.ts'
import { getRecentProblems } from '../../electron/db/repositories/problemRepository.ts'
import { upsertSubmission } from '../../electron/db/repositories/submissionRepository.ts'
import { startProblemVisit, finishProblemVisit } from '../../electron/db/repositories/problemVisitRepository.ts'
import { CoachOrchestrator } from '../../electron/coach/CoachOrchestrator.ts'
import { AppWindow } from '../../electron/windows/AppWindow.ts'
import { setEnabledSitesFetcher } from '../../electron/parsers/registry.ts'
import type { CoachPetWindow } from '../../electron/coach/CoachPetWindow.ts'
import type { CoachBubblePayload, CoachPetState } from '../../electron/coach/types.ts'
import type { TrackingService } from '../../electron/tracking/TrackingService.ts'
import type { RealtimeSubmissionService } from '../../electron/submissions/RealtimeSubmissionService.ts'
import type { SubmissionNotification } from '../../electron/submissions/SubmissionWatcherCore.ts'
import type { BrowserPageEvent, TabManager } from '../../electron/browser/TabManager.ts'

/*
 * CoachOrchestrator 的接线：start/stop 的监听器收支、窗口跟随、会话与比赛模式的
 * 状态切换、气泡与干预的生命周期、以及它怎么驱动 LLM。
 *
 * 覆盖率此前 30.94%/12.44%（530-1247 行几乎全空）。挡在前面的假设是"1248 行 + 构造
 * 函数里现造十来个协作者 = 测不动"，`coachPageOwnershipWiring.test.ts` 已经推翻了
 * 一半（electron 替身下能直接构造），本文件推翻另一半：**数据库也不用换替身**。
 * `initDbAtPath` 在 Vitest 的 node 池里跑得通（tests/db/ 下十来个文件就是这么跑的），
 * 于是 insertCoachEvent / insertCoachIntervention / updateInterventionUserAction 全部
 * 走真身，断言直接查表——"提示落库了吗、user_action 改了吗、比赛期间真的零干预吗"
 * 这些才是这个类的产出，用捕获入参的替身验只能验到"调了这个函数"。
 *
 * 换掉的只有两处，都是"非它不可"：
 * 1. `openai`：唯一真出网的依赖。
 * 2. `electron/app/config`：真身往 `app.getPath('userData')` 写 config.json，
 *    替身下那个目录不存在，`saveCoachConfig` 会抛。换成内存 store 顺带得到一个
 *    可断言面（免责声明"永久关闭"到底有没有落盘）。
 * CoachPetWindow 与 TabManager 用替身，因为它们要真窗口。RuleEngine / ContestGuard /
 * HintLadder / HintSelector / ConstraintParser / CoachFeedbackStore / LlmHintService /
 * ContextGatherer / PromptBuilder / ArkClient / 真解析器栈全部真身。
 *
 * 空转防护：本文件每条"不该发生"的断言旁边都有一条同次驱动的正向锚点
 * （气泡确实弹过 / 事件确实落库了 / 干预条数确实涨过）。理由见
 * `coachPageOwnershipWiring.test.ts` 顶部那段：`parseUrl` 没注册启用站点时一律返回
 * null，只有反向断言的套件会整体空转成绿。
 */

const LLM_KEY = 'ark-SENTINEL-ORCHESTRATOR-KEY'

/*
 * openai 是唯一真出网的依赖。`reply` 可被单条用例改写（改成非 JSON 或让它抛），
 * 用来驱动"LLM 失败降级到本地 HintLadder"那条分支。
 * `hold` 打开时请求挂住不 resolve，用于验并发门（hintInProgress / llmRequestInProgress）。
 */
const sdk = vi.hoisted(() => ({
  requests: [] as Array<{ model?: string, messages?: Array<{ role: string, content: string }> }>,
  reply: JSON.stringify({
    message: '先想清楚 n 的上界允许什么复杂度。',
    related_tags: ['prefix-sum'],
    hint_type: 'metacognition',
    confidence: 0.8,
    reveals_solution: false,
  }),
  error: null as Error | null,
  hold: false,
  releaseHold: null as (() => void) | null,
}))

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    readonly chat = {
      completions: {
        create: async (request: { model?: string, messages?: Array<{ role: string, content: string }> }) => {
          sdk.requests.push(request)
          if (sdk.hold) {
            await new Promise<void>((resolve) => { sdk.releaseHold = resolve })
          }
          if (sdk.error) throw sdk.error
          return {
            choices: [{ message: { content: sdk.reply } }],
            model: 'doubao-served',
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }
        },
      },
    }

    constructor(_options: unknown) { void _options }
  },
}))

/*
 * config.json 的真身要写盘。替身是有状态的：`saveCoachConfig` 必须真的改变后续
 * `loadCoachConfig` 的结果，否则"永久关闭免责声明后重启不再弹"这条断言会因为
 * 读到的永远是旧值而白过。
 */
const configStore = vi.hoisted(() => ({
  disclaimerDismissed: false,
  llmEnabled: true,
  encryptedApiKey: '',
  saveCalls: 0,
}))

vi.mock('../../electron/app/config', () => ({
  loadCoachConfig: () => ({
    enabled: true,
    sound: true,
    bubbleFrequency: 'medium' as const,
    position: null,
    scale: 1,
    opacity: 1,
    disclaimer_dismissed: configStore.disclaimerDismissed,
    llm: {
      encrypted_api_key: configStore.encryptedApiKey,
      base_url: 'https://ark.test.invalid/api/v3',
      model: 'doubao-seed-1-6-flash-250715',
      enabled: configStore.llmEnabled,
    },
  }),
  saveCoachConfig: (partial: { disclaimer_dismissed?: boolean, llm?: { enabled?: boolean } }) => {
    configStore.saveCalls += 1
    if (typeof partial.disclaimer_dismissed === 'boolean') {
      configStore.disclaimerDismissed = partial.disclaimer_dismissed
    }
    if (typeof partial.llm?.enabled === 'boolean') configStore.llmEnabled = partial.llm.enabled
  },
}))

const CF_PROBLEM_A = 'https://codeforces.com/problemset/problem/1/A'
const CF_PROBLEM_B = 'https://codeforces.com/problemset/problem/2/B'
const CF_CONTEST = 'https://codeforces.com/contest/1900/problem/C'

/** Codeforces 题面里抽出来的约束文本，真 ConstraintParser 能从中解析出 n 与时限。 */
const CONSTRAINT_TEXT = [
  'time limit per test: 2 seconds',
  'memory limit per test: 256 megabytes',
  '1 ≤ n ≤ 2·10^5',
  '1 ≤ a_i ≤ 10^9',
].join('\n')

/**
 * TabManager 替身：真身要 WebContentsView。
 *
 * 一个窗口上会挂三类监听器（ProblemSessionTracker 的 activeTab、orchestrator 的
 * page + activeTab、installContestNavigationTracking 的 webContentsUrl），所以按数组
 * 存而不是按单个 slot——按 slot 存会让"stop() 有没有全退订"永远看不出差别。
 */
class FakeTabManager {
  readonly scriptCalls: Array<{ pageEvent: BrowserPageEvent, code: string }> = []
  readonly contestNoticeCalls: boolean[] = []
  activePage: BrowserPageEvent | null = null
  pageActive = true
  /** 打开时 executeScriptForPage 挂住，用来制造"结果迟到"的竞态。 */
  holdScripts = false
  /*
   * 注入返回的题面文本，可按用例改写。
   * 必须可改：验"迟到的结果被丢弃"时，如果每页都返回同一段文本，泄漏进来的约束
   * 与当前约束在结构上完全相等，deepEqual 一样过——那条断言就杀不掉任何变异。
   */
  constraintText = CONSTRAINT_TEXT
  /** 打开时注入直接抛，用于验"抽取失败静默退化"。 */
  scriptError: Error | null = null
  private readonly pendingScripts: Array<() => void> = []
  private readonly pageListeners = new Set<(event: BrowserPageEvent) => void>()
  private readonly activeTabListeners = new Set<(url: string) => void>()
  private readonly urlListeners = new Set<(snapshot: { webContentsId: number, url: string | null }) => void>()

  addPageEventListener(listener: (event: BrowserPageEvent) => void): () => void {
    this.pageListeners.add(listener)
    return () => { this.pageListeners.delete(listener) }
  }

  addActiveTabChangeListener(listener: (url: string) => void): () => void {
    this.activeTabListeners.add(listener)
    return () => { this.activeTabListeners.delete(listener) }
  }

  addWebContentsUrlListener(
    listener: (snapshot: { webContentsId: number, url: string | null }) => void,
  ): () => void {
    this.urlListeners.add(listener)
    return () => { this.urlListeners.delete(listener) }
  }

  getActivePageEvent(): BrowserPageEvent | null {
    return this.activePage
  }

  getUrl(): string {
    return this.activePage?.url ?? ''
  }

  isPageActive(pageEvent: BrowserPageEvent): boolean {
    return this.pageActive && pageEvent.url === this.activePage?.url
  }

  setContestNoticeVisible(visible: boolean): void {
    this.contestNoticeCalls.push(visible)
  }

  async executeScriptForPage(pageEvent: BrowserPageEvent, code: string): Promise<unknown> {
    this.scriptCalls.push({ pageEvent, code })
    // 真身在 webContents 已销毁 / 页面拒绝执行时就是这样抛的。
    if (this.scriptError) throw this.scriptError
    if (this.holdScripts) {
      const text = this.constraintText
      return new Promise((resolve) => { this.pendingScripts.push(() => resolve(text)) })
    }
    return this.constraintText
  }

  /** 放行所有挂住的注入，模拟"用户已经切走之后旧页的结果才回来"。 */
  releaseScripts(): void {
    while (this.pendingScripts.length > 0) this.pendingScripts.pop()?.()
  }

  emitPageEvent(event: BrowserPageEvent): void {
    this.activePage = event
    for (const listener of [...this.pageListeners]) listener(event)
  }

  /**
   * 后台标签自己导航：事件照发，但活动页不变。
   *
   * 必须与 emitPageEvent 分开：后者顺手把 activePage 改成本次事件，于是
   * `isPageActive` 永远为真，`maybeFetchConstraints` 里那道活动页校验就再也不是
   * 决定性分支（删掉它一条用例都不会红）。
   */
  emitBackgroundPageEvent(event: BrowserPageEvent): void {
    for (const listener of [...this.pageListeners]) listener(event)
  }

  /** 用户切标签：活动页与 activeTab 通知必须同时变，否则 isPageActive 会自相矛盾。 */
  switchActiveTab(event: BrowserPageEvent): void {
    this.activePage = event
    for (const listener of [...this.activeTabListeners]) listener(event.url)
  }

  /** 只发 activeTab 通知，不改活动页——用来制造"一个标签都没有了"的状态。 */
  emitActiveTabChange(url: string): void {
    for (const listener of [...this.activeTabListeners]) listener(url)
  }

  emitWebContentsUrl(webContentsId: number, url: string | null): void {
    for (const listener of [...this.urlListeners]) listener({ webContentsId, url })
  }

  get listenerCount(): number {
    return this.pageListeners.size + this.activeTabListeners.size + this.urlListeners.size
  }
}

/** CoachPetWindow 替身：真身要一个透明 BrowserWindow。 */
class FakePetWindow {
  readonly states: CoachPetState[] = []
  readonly bubbles: CoachBubblePayload[] = []
  dismissCount = 0
  followed: unknown = undefined

  setPetState(state: CoachPetState): void { this.states.push(state) }
  getPetState(): CoachPetState { return this.states[this.states.length - 1] ?? 'idle' }
  showBubble(payload: CoachBubblePayload): void { this.bubbles.push(payload) }
  dismissBubble(): void { this.dismissCount += 1 }
  followWindow(window: unknown): void { this.followed = window }

  bubbleTitled(title: string): CoachBubblePayload | undefined {
    return this.bubbles.find((bubble) => bubble.title === title)
  }
}

function pageEvent(url: string, overrides: Partial<BrowserPageEvent> = {}): BrowserPageEvent {
  return {
    windowId: 'window-1',
    url,
    tabId: 'tab-1',
    webContentsId: 11,
    isMainFrame: true,
    reason: 'did-navigate',
    ...overrides,
  }
}

interface Harness {
  coach: CoachOrchestrator
  pet: FakePetWindow
  /** 按 index 与 windows 对应。 */
  tabManagers: FakeTabManager[]
  windows: AppWindow[]
  browserWindows: MockBrowserWindow[]
  setMostRecentWindow(window: AppWindow | null): void
  emitSubmission(notification: SubmissionNotification): void
  /** 全部由 orchestrator 挂上的"应用级"监听器数量（窗口级的看 FakeTabManager）。 */
  appListenerCount(): number
}

/**
 * 造 windowCount 个窗口的 orchestrator。
 *
 * 每处 `as unknown as X` 都对应一个"要真窗口/真进程才能构造"的协作者：
 * TabManager（要 WebContentsView）、TrackingService 与 RealtimeSubmissionService
 * （要 session/webRequest）、CoachPetWindow（要透明 BrowserWindow）。
 */
function harness(windowCount = 1, options: { withPet?: boolean } = {}): Harness {
  const withPet = options.withPet ?? true
  const tabManagers: FakeTabManager[] = []
  const windows: AppWindow[] = []
  const browserWindows: MockBrowserWindow[] = []
  for (let index = 0; index < windowCount; index += 1) {
    const tabManager = new FakeTabManager()
    const browserWindow = new MockBrowserWindow()
    tabManagers.push(tabManager)
    browserWindows.push(browserWindow)
    windows.push(new AppWindow({
      id: `window-${index + 1}`,
      browserWindow: browserWindow as unknown as Electron.BrowserWindow,
      tabManager: tabManager as unknown as TabManager,
    }))
  }

  const pet = new FakePetWindow()
  let mostRecent: AppWindow | null = windows[0] ?? null
  const mostRecentListeners = new Set<(window: AppWindow | null) => void>()
  const submissionListeners = new Set<(notification: SubmissionNotification) => void>()
  const problemListeners = new Set<() => void>()

  const coach = new CoachOrchestrator({
    getAppWindows: () => windows,
    getMostRecentAppWindow: () => mostRecent,
    addMostRecentWindowChangeListener: (listener) => {
      mostRecentListeners.add(listener)
      return () => { mostRecentListeners.delete(listener) }
    },
    isAnyAppWindowFocused: () => true,
    getTrackingService: () => ({
      addProblemDetectedListener: (listener: () => void) => {
        problemListeners.add(listener)
        return () => { problemListeners.delete(listener) }
      },
    } as unknown as TrackingService),
    getRealtimeSubmissionService: () => ({
      onSubmissionDetected: (listener: (notification: SubmissionNotification) => void) => {
        submissionListeners.add(listener)
        return () => { submissionListeners.delete(listener) }
      },
    } as unknown as RealtimeSubmissionService),
    // 桌宠窗口是可选依赖（用户关掉桌宠时为 null），withPet=false 用来验那条路。
    getCoachPetWindow: () => (withPet ? pet as unknown as CoachPetWindow : null),
  })

  return {
    coach,
    pet,
    tabManagers,
    windows,
    browserWindows,
    setMostRecentWindow: (window) => {
      mostRecent = window
      for (const listener of [...mostRecentListeners]) listener(window)
    },
    emitSubmission: (notification) => {
      for (const listener of [...submissionListeners]) listener(notification)
    },
    appListenerCount: () => mostRecentListeners.size + submissionListeners.size + problemListeners.size,
  }
}

let temporaryDirectory = ''

beforeEach(() => {
  resetElectronMock()
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-coach-orchestrator-'))
  initDbAtPath(path.join(temporaryDirectory, 'coach.sqlite'))

  // 见 coachPageOwnershipWiring.test.ts：少了这一步 parseUrl 一律返回 null，
  // 会话永远开不起来，全套"不该发生"的断言集体空转成绿。
  setEnabledSitesFetcher(() => [
    { id: 'codeforces', domains: ['codeforces.com'], enabled: true },
  ])

  configStore.disclaimerDismissed = false
  configStore.llmEnabled = true
  // safeStorage 替身的 decryptString 是 Buffer→utf8 往返，所以 base64 存进去能原样解出。
  configStore.encryptedApiKey = Buffer.from(LLM_KEY, 'utf8').toString('base64')
  configStore.saveCalls = 0

  sdk.requests.length = 0
  sdk.error = null
  sdk.hold = false
  sdk.releaseHold = null
  sdk.reply = JSON.stringify({
    message: '先想清楚 n 的上界允许什么复杂度。',
    related_tags: ['prefix-sum'],
    hint_type: 'metacognition',
    confidence: 0.8,
    reveals_solution: false,
  })

  /*
   * 全程假时钟：`start()` 尾部那个 `setTimeout(maybeShowDisclaimer, 2000)` 在真时钟下
   * 会在用例结束之后打到已经拆掉的 orchestrator 上（`stop()` 没有清它，见文件末尾的
   * 记录）。假时钟让"免责声明什么时候弹"变成由用例显式推进的事。
   */
  vi.useFakeTimers({ now: new Date('2026-09-01T10:00:00+08:00') })
})

afterEach(() => {
  vi.useRealTimers()
  setEnabledSitesFetcher(() => [])
  closeDb()
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

// --- start / stop 的监听器收支 ---

test('stop() 退掉 start() 挂上的每一个监听器，之后的页面事件与提交都不再被处理', async () => {
  const h = harness(2)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 活动窗口上是 4 个（ProblemSessionTracker 的 activeTab、orchestrator 的 page 与
   * activeTab、installContestNavigationTracking 的 webContentsUrl）；非活动窗口只有
   * attachAppWindow 挂的那 1 个 webContentsUrl。写成具体数字而不是 `> 0`：漏退一个
   * 和全退掉之间的差别就在这个数字上。
   */
  assert.equal(h.tabManagers[0].listenerCount, 4, '活动窗口应有 4 个监听器')
  assert.equal(h.tabManagers[1].listenerCount, 1, '非活动窗口只接比赛 URL 聚合')
  assert.equal(h.appListenerCount(), 3, '最近窗口变化 / 提交检测 / 题目识别各 1')
  // 正向锚点：拆之前这些监听器确实是活的。
  const scriptsBefore = h.tabManagers[0].scriptCalls.length
  assert.ok(scriptsBefore > 0, '活动题目页应已触发一次约束抽取')

  h.coach.stop()

  assert.equal(h.tabManagers[0].listenerCount, 0, '活动窗口的监听器必须全退')
  assert.equal(h.tabManagers[1].listenerCount, 0, '非活动窗口的聚合监听器也必须退')
  assert.equal(h.appListenerCount(), 0, '应用级监听器必须全退')

  // 行为面：拆完之后同样的驱动不再产生任何副作用。
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_B))
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  assert.equal(h.tabManagers[0].scriptCalls.length, scriptsBefore, 'stop() 后不应再注入')
  assert.deepEqual(listCoachEvents(), [], 'stop() 后的提交不应再落库成事件')
  assert.equal(h.coach.getCurrentSession(), null, 'stop() 应关掉当前会话')
})

test('stop() 时仍在比赛中：审计行补上 contest_end，不留一条永远开口的记录', async () => {
  const h = harness()
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)
  // 正向锚点：进入比赛这一步真的发生了，下面的"补上 end"才有意义。
  const entered = listCoachInterventions().filter((row) => row.source_type === 'contest_audit')
  assert.equal(entered.length, 1, '进入比赛应写一条审计')
  assert.equal(entered[0].contest_end, null, '进入时 contest_end 还是空的')

  await vi.advanceTimersByTimeAsync(65_000)
  h.coach.stop()

  const audits = listCoachInterventions().filter((row) => row.source_type === 'contest_audit')
  assert.equal(audits.length, 2, '离开比赛应再写一条审计')
  const end = audits.find((row) => row.trigger_reason.startsWith('contest_end'))
  /*
   * 实测记录：`stop()` 里有**三条**互相冗余的收尾路径，任意一条都能写出这一行——
   * `contestGuard.forceEnd()`、`detachAppWindow` 循环（退订 webContentsUrl 时
   * `installContestNavigationTracking` 的 disposer 会把 aggregate URL 清成空串，
   * 进而 endContest）、以及 `contestUrlAggregator.clear()`。
   * 所以单独删掉其中任何一条这条断言都不会红，要三条全删才红（已逐条验过）。
   * 断言仍然保留：它守的是"stop() 不留开口审计行"这个结果，而不是某一句实现。
   */
  assert.ok(end, 'stop() 必须写出 contest_end 审计（三条收尾路径至少一条要生效）')
  assert.ok(end.contest_end !== null, 'contest_end 时间戳必须落库，否则导出的审计对不上账')
  assert.match(end.trigger_reason, /contest_end \(codeforces:1900, 65s\)/, '时长应按真实停留时间记账')
  assert.equal(end.zero_intervention, true, '比赛期间零介入是审计卖点，必须落库为真')

  /*
   * 导出面（coach:exportAuditLog 消费的就是它）：时长由 contest_start/contest_end 反算。
   * 少了上面那个 contest_end，这里会被 `?? created_at` 兜成 0 秒——审计报表上
   * "打了一小时比赛"会变成"0 秒"，所以两个面都得断言。
   */
  const exported = listContestAuditRecords()
  assert.equal(exported.find((row) => row.duration_seconds === 65)?.zero_intervention, true)
})

// --- 窗口跟随 ---

test('焦点连抖 A→B→A 只落定最后一个窗口，中途的 B 从头到尾没被接上', async () => {
  const h = harness(2)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.tabManagers[1].activePage = pageEvent(CF_PROBLEM_B, { windowId: 'window-2', webContentsId: 21 })
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  // 200ms 内来回切：debounce 窗口没走完，中间态一次都不该落地。
  h.setMostRecentWindow(h.windows[1])
  await vi.advanceTimersByTimeAsync(100)
  h.setMostRecentWindow(h.windows[0])
  await vi.advanceTimersByTimeAsync(300)

  assert.equal(h.tabManagers[1].listenerCount, 1, 'B 只应留着比赛聚合，不应被接成活动窗口')
  assert.equal(h.tabManagers[1].scriptCalls.length, 0, 'B 的题面不该被抽取')
  /*
   * 正向锚点：A 被重新落定过一次。
   *
   * 判据不是"又注入了一次脚本"——切窗时 `invalidateCurrentConstraints` 把缓存清成
   * null，重新落定时 `ConstraintParser` 的进程内缓存命中，`source` 从 regex 变成 cache
   * 而不再注入。所以 cache 这个值本身就是"重跑过一遍 fetch 路径"的证据：
   * 没重跑的话 currentConstraints 会停在 invalidate 之后的 null。
   */
  assert.equal(h.tabManagers[0].listenerCount, 4, 'A 应仍是唯一被完整接上的窗口')
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A)
  assert.equal(h.coach.getCurrentConstraints()?.source, 'cache', '重新落定 A 应重走一遍约束抽取')
  assert.equal(h.coach.getCurrentConstraints()?.nUpper, 200_000)

  // 对照组：真的停在 B 上超过 debounce，B 就该被完整接上——证明上面不是"B 永远接不上"。
  h.setMostRecentWindow(h.windows[1])
  await vi.advanceTimersByTimeAsync(300)
  assert.equal(h.tabManagers[1].listenerCount, 4, '停稳之后 B 应被完整接上')
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_B)
  h.coach.stop()
})

test('切窗请求已发出但还没落定时，旧窗口迟到的页面事件不再抽取题面', async () => {
  const h = harness(2)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  const baseline = h.tabManagers[0].scriptCalls.length
  assert.ok(baseline > 0, '正向锚点：A 活动期间抽取确实在工作')

  /*
   * requestedWindowId 在监听器里同步改成 B，而 activeAppWindow 要等 debounce 才换。
   * 这段空档里 A 的监听器还挂着，用户已经在看 B——此时抓 A 的题面会把 B 的提示
   * 换成 A 的约束。守的是 `maybeFetchConstraints` 里的 `requestedWindowId !== appWindow.id`。
   *
   * 同一个 if 里的第一项 `activeAppWindow?.id !== appWindow.id` 则是**测不到的**：
   * 把它改成恒 false（等于删掉）一条用例都不红，改成恒 true 会红 8 条——
   * 说明它确实在被执行，但在当前接线下从不由它决定结果。页面监听器是在
   * `applyActiveWindow` 里带着 liveWindow 闭包注册的，且换窗前先跑 cleanup，
   * 所以"事件来自非活动窗口"这个状态构造不出来。它是防未来重构的冗余门，
   * 不是活的判定——留着无害，但别把它算进覆盖。
   */
  h.setMostRecentWindow(h.windows[1])
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_B, { reason: 'did-navigate' }))
  await vi.advanceTimersByTimeAsync(0)

  assert.equal(h.tabManagers[0].scriptCalls.length, baseline, '切窗请求发出后旧窗口不应再抽取')
  assert.equal(h.coach.getCurrentProblemUrl(), null, '切窗时应先把旧题目缓存作废')

  /*
   * 另一道独立的门：事件来自**后台标签**。
   * 用户在标签 1 看 1A，标签 2 在后台自己跳到了 2B（比如上一个页面的重定向）。
   * 后台页的题面不该被抓，更不该顶掉当前题目——守的是 `isPageActive(pageEvent)`。
   * 这里必须用 emitBackgroundPageEvent：emitPageEvent 会把活动页改成本次事件，
   * 那道门就永远为真、删掉也不会红。
   */
  // 上面那次 emitPageEvent 把活动页改成了 2B（真实 TabManager 同样会），先摆回 1A。
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.setMostRecentWindow(h.windows[0])
  await vi.advanceTimersByTimeAsync(300)
  const afterReapply = h.tabManagers[0].scriptCalls.length
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '正向锚点：停回 A 之后当前题目恢复')

  h.tabManagers[0].emitBackgroundPageEvent(pageEvent(CF_PROBLEM_B, { tabId: 'tab-2', webContentsId: 12 }))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.tabManagers[0].scriptCalls.length, afterReapply, '后台标签的导航不应触发抽取')
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '后台标签不应顶掉当前题目')
  h.coach.stop()
})

test('A 的约束结果在切到 B 之后才回来时被丢弃，不污染 B 的提示上下文', async () => {
  const h = harness(2)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.tabManagers[1].activePage = pageEvent(CF_PROBLEM_B, { windowId: 'window-2', webContentsId: 21 })
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  // 正向锚点：同一条链路在不切窗时确实会把结果写进缓存。
  assert.equal(h.coach.getCurrentConstraints()?.nUpper, 200_000, '不切窗时结果应正常落到缓存')

  /*
   * 让 A 的下一次注入挂住，制造"结果在飞"的状态。
   * 这一页的题面换成 n ≤ 9·10^8：泄漏进来时 nUpper 会变成 900000000，肉眼可分。
   * 都用同一段文本的话，"被丢弃"与"被写进来"结构上完全相等，deepEqual 无从分辨。
   */
  h.tabManagers[0].constraintText = CONSTRAINT_TEXT.replace('2·10^5', '9·10^8')
  h.tabManagers[0].holdScripts = true
  h.tabManagers[0].emitPageEvent(pageEvent('https://codeforces.com/problemset/problem/3/C'))
  await vi.advanceTimersByTimeAsync(0)

  h.setMostRecentWindow(h.windows[1])
  await vi.advanceTimersByTimeAsync(300)
  const bConstraints = h.coach.getCurrentConstraints()
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_B, 'B 应已成为当前题目')

  // A 的结果现在才回来。它属于上一代（generation）且窗口已换，必须被丢掉。
  h.tabManagers[0].releaseScripts()
  await vi.advanceTimersByTimeAsync(0)

  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_B, '迟到的结果不应改写当前题目')
  assert.deepEqual(h.coach.getCurrentConstraints(), bConstraints, '迟到的结果不应改写当前约束')
  assert.notEqual(h.coach.getCurrentConstraints()?.nUpper, 900_000_000, '3/C 的 n 上界不该出现在 B 的上下文里')
  // 桌宠也必须跟到 B 的窗口上，否则气泡会贴在用户已经离开的那个窗口边上。
  assert.equal(h.pet.followed, h.browserWindows[1], '桌宠应跟随新的活动窗口')
  h.coach.stop()
})

test('活动窗口被销毁后当前会话关闭、桌宠脱离，销毁的窗口不会被重新接上', async () => {
  const h = harness(1)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  // 正向锚点：销毁之前会话与跟随都是活的。
  assert.equal(h.coach.getCurrentSession()?.platform_problem_id, '1A', '销毁前应有当前会话')
  assert.equal(h.pet.followed, h.browserWindows[0])

  /*
   * 窗口先销毁、随后才通知"最近窗口变了"，这就是真实顺序（closed 事件与焦点事件
   * 不保证谁先到）。`applyActiveWindow` 里的 `!appWindow.isDestroyed()` 就守这一步：
   * 少了它，coach 会把监听器挂到已销毁的窗口上，桌宠也会去 setParentWindow 一个死窗口。
   */
  h.browserWindows[0].close()
  h.setMostRecentWindow(h.windows[0])
  await vi.advanceTimersByTimeAsync(300)

  assert.equal(h.coach.getCurrentSession(), null, '窗口销毁后应关掉会话')
  assert.equal(h.pet.followed, null, '桌宠应脱离已销毁的窗口')
  assert.equal(h.tabManagers[0].listenerCount, 0, '不应把监听器挂回已销毁的窗口')
  assert.equal(h.coach.getCurrentProblemUrl(), null, '当前题目缓存应作废')

  // 会话进了历史而不是被丢掉：复盘视图靠这份历史。
  assert.equal(h.coach.getSessionHistory().at(-1)?.current_status, 'closed')
  h.coach.stop()
})

// --- 会话生命周期 ---

test('切窗时当前会话跟着换到新窗口正在看的那道题，旧会话进历史', async () => {
  const h = harness(2)
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.tabManagers[1].activePage = pageEvent(CF_PROBLEM_B, { windowId: 'window-2', webContentsId: 21 })
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  const firstSessionId = h.coach.getCurrentSession()?.session_id
  assert.equal(h.coach.getCurrentSession()?.platform_problem_id, '1A', '正向锚点：A 的会话已开')

  h.setMostRecentWindow(h.windows[1])
  await vi.advanceTimersByTimeAsync(300)

  /*
   * 守的是 `applyActiveWindow` 里的 `sessionTracker.switchWindow(liveWindow)`。
   * 少了这一句，会话会一直停在 A 的题上——而 LLM 上下文、卡壳计时、提示归属全都
   * 按当前会话算，用户在 B 上做 2B，提示却围着 1A 展开。
   */
  const switched = h.coach.getCurrentSession()
  assert.equal(switched?.platform_problem_id, '2B', '会话应换成新窗口的题目')
  assert.notEqual(switched?.session_id, firstSessionId, '换题应是新会话，不是改旧会话')
  assert.ok(
    h.coach.getSessionHistory().some((session) => session.platform_problem_id === '1A' && session.current_status === 'closed'),
    '旧会话应被关闭并留在历史里',
  )
  h.coach.stop()
})

test('同窗口内切到另一道题开新会话，切到非题目页只挂起不关闭', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  const first = h.coach.getCurrentSession()?.session_id
  assert.ok(first, '正向锚点：第一道题的会话已开')

  h.tabManagers[0].switchActiveTab(pageEvent(CF_PROBLEM_B))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentSession()?.platform_problem_id, '2B', '换题应开新会话')
  assert.notEqual(h.coach.getCurrentSession()?.session_id, first)
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_B, '约束缓存应跟着换题')

  /*
   * 切到本地 IDE：会话必须留着（用户马上会切回来），只是转成 suspended。
   * 直接关掉的话，来回切一次编辑器就会把"这道题做了 40 分钟"拆成一堆碎会话。
   */
  h.tabManagers[0].switchActiveTab(pageEvent('http://localhost:5173/editor'))
  await vi.advanceTimersByTimeAsync(0)
  const suspended = h.coach.getCurrentSession()
  assert.equal(suspended?.platform_problem_id, '2B', '切到非题目页不应关掉会话')
  assert.equal(suspended?.current_status, 'suspended', '应转为挂起')
  // 非题目页没有题目身份，约束缓存该清掉，否则提示会带着上一题的 n 上界。
  assert.equal(h.coach.getCurrentProblemUrl(), null, '非题目页应清空约束缓存')
  h.coach.stop()
})

// --- 比赛模式 ---

test('进入比赛页：桌宠睡下、每个窗口都收到通知与顶栏、审计落库', async () => {
  const h = harness(2)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getState().is_contest_mode, false, '正向锚点：起步不在比赛模式')

  // 比赛判定来自 webContentsUrl 聚合（installContestNavigationTracking → ContestUrlAggregator）。
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)

  assert.equal(h.coach.getState().is_contest_mode, true, '比赛 URL 应打开硬关闭开关')
  assert.equal(h.coach.getState().contest?.contest_id, '1900')
  assert.equal(h.pet.getPetState(), 'sleep', '比赛期间桌宠应睡下')
  assert.deepEqual(h.pet.bubbles, [], '进入比赛不应弹气泡打扰选手')

  /*
   * 通知必须发给**所有**窗口。只发最近窗口的话，用户切到另一个窗口会看到一个
   * 还在"正常模式"的界面，而规则引擎其实已经硬关闭了——UI 与实际状态对不上。
   */
  for (const [index, browserWindow] of h.browserWindows.entries()) {
    const message = browserWindow.webContents.sentMessages.find((m) => m.channel === 'coach:contestModeChanged')
    assert.ok(message, `window-${index + 1} 应收到比赛模式通知`)
    assert.deepEqual(message.args[0], {
      isContestMode: true,
      contest: {
        url: 'https://codeforces.com/contest/1900',
        platform: 'codeforces',
        contest_id: '1900',
        entered_at: new Date('2026-09-01T10:00:00+08:00').toISOString(),
      },
    })
    assert.deepEqual(h.tabManagers[index].contestNoticeCalls, [true], '两个窗口都应升起比赛顶栏')
  }

  const audit = listCoachInterventions().find((row) => row.source_type === 'contest_audit')
  assert.match(audit?.trigger_reason ?? '', /^contest_enter \(codeforces:1900\)$/)
  assert.equal(audit?.intervention_level, 0, '审计行本身不是提示，等级必须是 0')
  assert.equal(audit?.is_contest_mode, true)
  h.coach.stop()
})

test('比赛期间事件照样落库但一条干预都不产生，离开比赛后同样的事件就出提示', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)

  // 两次错误提交 → CoachEventBridge 折出 multiple_wrong。
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 正向锚点：事件确实落库了。这是"零介入"这条合规断言的全部重量所在——
   * 如果事件也没落库，"没有干预"只能说明这条链路整体空转，证明不了硬关闭生效。
   */
  const contestEvents = listCoachEvents()
  assert.equal(contestEvents.length, 1, '比赛期间事件仍须落库，用于审计对比')
  assert.equal(contestEvents[0].event_type, 'multiple_wrong')
  assert.deepEqual(
    listCoachInterventions().filter((row) => row.source_type !== 'contest_audit'),
    [],
    '比赛期间不应产生任何提示类干预',
  )
  assert.deepEqual(sdk.requests, [], '比赛期间连 LLM 都不该被调用')

  // 离开比赛：同一条链路立刻恢复出提示，证明上面不是"这条链路本来就不工作"。
  h.tabManagers[0].emitWebContentsUrl(11, CF_PROBLEM_A)
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  const hints = listCoachInterventions().filter((row) => row.source_type !== 'contest_audit')
  assert.equal(hints.length, 1, '离开比赛后同样的事件应产出一条干预')
  assert.equal(hints[0].source_type, 'llm')
  h.coach.stop()
})

test('比赛期间用户主动要提示也被拒：点桌宠 / 升级 / 聊天全部空手而归', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)
  const bubblesBefore = h.pet.bubbles.length

  const clicked = await h.coach.petClick()
  const upgraded = await h.coach.requestHintUpgrade()
  const chatted = await h.coach.chatWithLlm('这题怎么做')
  const asked = await h.coach.requestHintFromLlm()

  assert.deepEqual(clicked, { triggered: false, level: 0, llmEnabled: true, note: '比赛模式' })
  assert.equal(upgraded.accepted, false)
  assert.equal(upgraded.note, '比赛模式硬关闭')
  assert.equal(chatted, null, '比赛期间聊天通道也必须关掉')
  assert.equal(asked, null, '比赛期间"给点提示"也必须关掉')
  assert.equal(h.pet.bubbles.length, bubblesBefore, '被拒的请求不应弹任何气泡')
  assert.deepEqual(
    listCoachInterventions().filter((row) => row.source_type !== 'contest_audit'),
    [],
    '被拒的请求不应留下干预记录',
  )
  assert.deepEqual(sdk.requests, [], '被拒的请求不应发出 LLM 调用')

  // 离开比赛后同样四个调用立刻生效——上面四条不是"这些方法本来就不工作"。
  h.tabManagers[0].emitWebContentsUrl(11, CF_PROBLEM_A)
  const afterClick = await h.coach.petClick()
  assert.equal(afterClick.triggered, true, '离开比赛后点桌宠应真的出提示')
  assert.equal(await h.coach.chatWithLlm('这题怎么做') !== null, true, '离开比赛后聊天应恢复')
  h.coach.stop()
})

test('离开比赛页：顶栏落下、桌宠回 idle、弹复盘气泡并把 contest_end 写进审计', async () => {
  const h = harness()
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)
  // 正向锚点：确实进过比赛，而且此时顶栏是升起的、没有复盘气泡。
  assert.deepEqual(h.tabManagers[0].contestNoticeCalls, [true])
  assert.equal(h.pet.bubbleTitled('比赛结束'), undefined)

  await vi.advanceTimersByTimeAsync(1_800_000)
  h.tabManagers[0].emitWebContentsUrl(11, CF_PROBLEM_A)

  assert.equal(h.coach.getState().is_contest_mode, false, '离开比赛页应关掉比赛模式')
  assert.deepEqual(h.tabManagers[0].contestNoticeCalls, [true, false], '顶栏应落下')
  assert.equal(h.pet.getPetState(), 'alert', '赛后桌宠应转为提醒态')
  const review = h.pet.bubbleTitled('比赛结束')
  assert.ok(review, '赛后应主动提示复盘 / upsolve')
  assert.match(review.message, /1800s/, '气泡里应带上真实比赛时长')
  assert.equal(review.source, 'local', '赛后复盘提示是本地文案，不该标成 LLM 产出')

  const message = h.browserWindows[0].webContents.sentMessages
    .filter((m) => m.channel === 'coach:contestModeChanged')
    .at(-1)
  assert.deepEqual(message?.args[0], { isContestMode: false, contest: null }, 'renderer 应收到退出通知')

  /*
   * contest_end 断言查的是原始行，不是 exportAuditLog()：后者把
   * `contest_end ?? created_at` 合并掉了（interventionsRepository.listContestAuditRecords），
   * 于是"根本没写 contest_end"在导出面上看不出来，时长仍是 1800s。
   */
  const endRow = listCoachInterventions().find((row) => row.trigger_reason.startsWith('contest_end'))
  assert.ok(endRow?.contest_end, '离开比赛必须把 contest_end 写进审计行本身')
  assert.equal(endRow.contest_start, new Date('2026-09-01T10:00:00+08:00').toISOString())
  h.coach.stop()
})

// --- 提示与气泡的生命周期 ---

test('事件驱动的 LLM 提示：thinking → 落库 → 气泡带上等级与来源', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  // 先 thinking 再出气泡：少了这一步用户点完要等一两秒毫无反馈。
  assert.equal(h.pet.states[0], 'thinking', '开始生成时桌宠应进入 thinking')

  const interventions = listCoachInterventions()
  assert.equal(interventions.length, 1, '应恰好落库一条干预')
  const intervention = interventions[0]
  assert.equal(intervention.source_type, 'llm')
  assert.equal(intervention.intervention_level, 1, 'reveals_solution=false 时为 L1')
  assert.equal(intervention.message, '先想清楚 n 的上界允许什么复杂度。')
  assert.deepEqual(intervention.related_tags, ['prefix-sum'], '标签应原样落库，供后续 L5 使用')
  assert.equal(intervention.trigger_reason, 'multiple_wrong', '触发原因应是事件类型本身')

  // 气泡与干预必须共用 intervention_id：反馈就是按这个 id 关联回来的。
  const bubble = h.pet.bubbles.at(-1)
  assert.equal(bubble?.id, intervention.intervention_id)
  assert.equal(bubble?.title, '提醒', 'L1 的标题是"提醒"')
  assert.equal(bubble?.source, 'llm')
  assert.equal(bubble?.level, 1)

  // 约束确实进了 prompt：否则 LLM 拿不到 n 的上界，提示只能泛泛而谈。
  const userMessage = sdk.requests.at(-1)?.messages?.find((m) => m.role === 'user')?.content ?? ''
  assert.match(userMessage, /200000|2·10\^5/, 'prompt 应带上抽取到的 n 上界')
  h.coach.stop()
})

test('LLM 自报 reveals_solution 时干预升到 L5，标题跟着变成策略提示', async () => {
  const h = harness()
  sdk.reply = JSON.stringify({
    message: '维护前缀和后 O(1) 回答每个询问。',
    related_tags: ['prefix-sum'],
    hint_type: 'strategy',
    confidence: 0.9,
    reveals_solution: true,
  })
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 等级不是装饰：它决定气泡标题、决定审计里"这次提示离题解多近"。
   * 把 reveals_solution 的分支写死成 1，剧透级提示会被记成轻提醒。
   */
  const intervention = listCoachInterventions()[0]
  assert.equal(intervention.intervention_level, 5, 'reveals_solution=true 应记为 L5')
  assert.equal(h.pet.bubbles.at(-1)?.title, '策略提示', 'L5 的标题应是策略提示')
  assert.equal(h.pet.bubbles.at(-1)?.level, 5)
  h.coach.stop()
})

test('用户对某类提示按"今天别提醒"后同类事件不再出提示，别的类型照常', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(listCoachInterventions().length, 1, '正向锚点：屏蔽前 multiple_wrong 会出提示')

  assert.equal(h.coach.recordFeedback({ feedbackType: 'never_today' }), true)
  // 反馈必须落库：屏蔽状态要跨重启存活，只记在内存里重开就失效。
  const feedback = listCoachFeedback()
  assert.equal(feedback.length, 1)
  assert.equal(feedback[0].feedback_type, 'never_today')
  assert.equal(feedback[0].event_type, 'multiple_wrong', '屏蔽必须绑定到当前气泡的事件类型')
  assert.equal(h.coach.getState().suppressed_types.includes('multiple_wrong'), true)

  // 同类事件再来：事件仍落库，但不再打扰。
  const eventsBefore = listCoachEvents().length
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  assert.ok(listCoachEvents().length > eventsBefore, '被屏蔽的类型事件仍须落库')
  assert.equal(listCoachInterventions().length, 1, '被屏蔽后不应再产生干预')

  /*
   * 另一类事件（first_ac）必须照常——屏蔽是按 event_type 粒度的。
   * 做成全局开关的话，用户嫌"多次错误"吵，顺手把 AC 庆祝也关掉了。
   */
  h.emitSubmission({ platform: 'codeforces', verdict: 'AC', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  const all = listCoachInterventions()
  assert.equal(all.length, 2, '未被屏蔽的类型应照常出提示')
  // 按字段找而不是按下标：假时钟下两行的 created_at 相同，DESC 排序的并列次序未定义。
  assert.ok(all.some((row) => row.trigger_reason === 'first_ac'), 'first_ac 不受 multiple_wrong 的屏蔽影响')
  h.coach.stop()
})

test('点桌宠逐级升到 L4，跨到 L5 时先要二次确认，确认后才给 L5', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  const first = await h.coach.petClick()
  assert.deepEqual(
    { triggered: first.triggered, level: first.level, llmEnabled: first.llmEnabled },
    { triggered: true, level: 1, llmEnabled: true },
    '第一次点桌宠应给 L1',
  )
  for (const expected of [2, 3, 4]) {
    const step = await h.coach.requestHintUpgrade()
    assert.equal(step.level, expected, `再给一点应升到 L${expected}`)
    assert.equal(step.accepted, true)
  }

  /*
   * L4→L5 是"接近题解方向"的一步，必须先确认。
   * 少了这道门，用户连点五次就直接拿到近题解提示，Socratic Ladder 的意义没了。
   */
  const pending = await h.coach.requestHintUpgrade()
  assert.equal(pending.accepted, false, '首次跨到 L5 不应直接给出')
  assert.equal(pending.needsConfirmation, true)
  assert.equal(pending.level, 5)
  const confirmRow = listCoachInterventions().find((row) => row.trigger_reason === 'l5_confirmation_pending')
  assert.ok(confirmRow, '待确认这一步也要落库，审计里能看出用户被问过')
  assert.equal(h.pet.bubbles.at(-1)?.message, '该提示接近题解方向，确认查看？')

  const confirmed = await h.coach.requestHintUpgrade()
  assert.equal(confirmed.accepted, true, '二次点击应真的给出 L5')
  assert.equal(confirmed.level, 5)
  assert.equal(listCoachInterventions().find((row) => row.intervention_id === confirmed.interventionId)?.intervention_level, 5)
  h.coach.stop()
})

test('提示还在生成中时重复点击被挡住，只发一次 LLM 请求', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  // 先正常拿到 L1，让 currentHintLevel 非零——下面才分得出两道并发门的差别。
  assert.equal((await h.coach.petClick()).level, 1, '正向锚点：先拿到 L1')

  // 让 LLM 挂住，模拟真实的一两秒延迟。
  sdk.hold = true
  const inFlight = h.coach.requestHintUpgrade()
  await vi.advanceTimersByTimeAsync(0)
  // 正向锚点：这一发确实出去了，也确实弹了 loading 气泡。
  assert.equal(sdk.requests.length, 2, '升级请求应发出去')
  assert.equal(h.pet.bubbles.at(-1)?.bubble_type, 'loading', '生成期间应先给一个 loading 气泡')

  const rejected = await h.coach.requestHintUpgrade()
  assert.deepEqual(rejected, { accepted: false, level: 1, note: '正在生成提示中' }, '重复点击应被并发门挡住')
  assert.equal(sdk.requests.length, 2, '被挡住的点击不应再发一次请求')

  /*
   * 再点一次桌宠：走的是 petClick 自己那道门（与上面 requestHintUpgrade 的门是两句代码）。
   *
   * 判据必须是 level 而不只是 note：两道门返回的 note 是同一句话。
   * 少了 petClick 那道门时，它会先把 currentHintLevel 清成 0 再被下游的门挡住，
   * 于是"被挡住"看不出差别，差别落在等级被悄悄清零上——
   * 用户点一下桌宠就把已经爬到的等级冲掉了。
   */
  const clickedAgain = await h.coach.petClick()
  assert.deepEqual(
    { triggered: clickedAgain.triggered, level: clickedAgain.level, note: clickedAgain.note },
    { triggered: false, level: 1, note: '正在生成提示中' },
    '生成期间再点桌宠应被挡住，且不能把已有等级清零',
  )
  assert.equal(sdk.requests.length, 2, '被挡住的桌宠点击同样不应发请求')

  sdk.hold = false
  sdk.releaseHold?.()
  const settled = await inFlight
  assert.equal(settled.accepted, true, '挂住的那一发最终应正常出提示')
  assert.equal(settled.level, 2, '它应接着 L1 升到 L2')
  assert.equal(listCoachInterventions().filter((row) => row.source_type === 'llm').length, 2, 'L1 与 L2 各一条')

  // 门在 finally 里放开：放开之后同样的调用要能过，否则一次超时就永久锁死提示功能。
  const after = await h.coach.requestHintUpgrade()
  assert.equal(after.accepted, true, '生成结束后应放开并发门')
  h.coach.stop()
})

test('LLM 调用失败时降级到本地 HintLadder，用户仍拿到一条提示', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  sdk.error = new Error('ark upstream 503')

  const result = await h.coach.petClick()

  /*
   * 降级路径是"LLM 不可用时产品还能用"的全部依据。
   * 少了 `requestLocalHintUpgrade` 那一句，网络一抖用户点桌宠就毫无反应。
   */
  assert.equal(result.triggered, true, 'LLM 失败也应给出提示')
  assert.equal(result.level, 1)
  const intervention = listCoachInterventions().at(-1)
  assert.equal(intervention?.source_type, 'local_rule', '降级后来源应标成本地规则，而不是冒充 LLM')
  assert.ok((intervention?.message.length ?? 0) > 0, '降级提示不能是空文案')
  // 正向锚点：LLM 确实被试过一次（不是"没走 LLM 路径所以自然降级"）。
  assert.equal(sdk.requests.length, 1, '降级前应真的试过一次 LLM')
  const bubble = h.pet.bubbles.at(-1)
  assert.equal(bubble?.source, 'local', '气泡也应标成本地来源')
  assert.equal(bubble?.id, intervention?.intervention_id)
  h.coach.stop()
})

test('点"先不用"把 user_action 改成 dismissed 并把等级归零，下次点击从 L1 重来', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  await h.coach.petClick()
  const upgraded = await h.coach.requestHintUpgrade()
  assert.equal(upgraded.level, 2, '正向锚点：dismiss 之前等级确实升到了 L2')
  const shownId = upgraded.interventionId!
  assert.equal(listCoachInterventions().find((row) => row.intervention_id === shownId)?.user_action, 'shown')

  assert.equal(h.coach.dismissHint(), true)

  /*
   * user_action 是"提示有没有被采纳"这项指标的唯一数据源（countUserActionSince）。
   * 不回写的话，所有干预永远停在 shown，转化率统计全是满分。
   */
  assert.equal(
    listCoachInterventions().find((row) => row.intervention_id === shownId)?.user_action,
    'dismissed',
    'dismiss 应回写 user_action',
  )
  assert.equal(h.pet.dismissCount, 1, '应关掉气泡')
  assert.equal(h.pet.getPetState(), 'idle', '应把桌宠切回 idle')

  // 等级归零：不归零的话用户 dismiss 之后再点一次会直接跳到 L3。
  const again = await h.coach.requestHintUpgrade()
  assert.equal(again.level, 1, 'dismiss 后应从 L1 重新开始')
  h.coach.stop()
})

test('没有当前题目时点桌宠只给一句引导，不落库也不调 LLM', async () => {
  const h = harness()
  // 活动页是首页：parseUrl 认不出题目，会话开不起来。
  h.tabManagers[0].activePage = pageEvent('https://codeforces.com/')
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentSession(), null, '前提：此刻确实没有会话')

  const result = await h.coach.petClick()

  assert.deepEqual(result, { triggered: false, level: 0, llmEnabled: true, note: '无当前题目' })
  // 正向锚点：气泡确实弹了（不是"什么都没发生"），只是不带任何提示内容。
  const bubble = h.pet.bubbles.at(-1)
  assert.equal(bubble?.title, '暂无题目')
  assert.equal(h.pet.getPetState(), 'alert')
  assert.deepEqual(listCoachInterventions(), [], '引导气泡不是干预，不应落库')
  assert.deepEqual(sdk.requests, [], '没有题目时不该白花一次 LLM 调用')

  // 打开题目后同一个调用立刻生效，证明上面不是"petClick 整体不工作"。
  h.tabManagers[0].switchActiveTab(pageEvent(CF_PROBLEM_A))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal((await h.coach.petClick()).triggered, true, '打开题目后点桌宠应出提示')
  h.coach.stop()
})

test('免责声明启动 2 秒后弹一次；永久关闭后落盘，重启不再弹', async () => {
  const first = harness()
  first.coach.start()
  // 2 秒之前不该弹：桌宠 React 组件还没就绪，弹了等于丢掉。
  await vi.advanceTimersByTimeAsync(1_500)
  assert.equal(first.pet.bubbleTitled('仅供参考'), undefined, '2 秒内不应弹免责声明')

  await vi.advanceTimersByTimeAsync(1_000)
  const disclaimer = first.pet.bubbleTitled('仅供参考')
  assert.ok(disclaimer, '2 秒后应弹一次免责声明')
  assert.equal(disclaimer.bubble_type, 'disclaimer', '类型要能与提示气泡区分，renderer 按它换按钮')

  first.coach.dismissDisclaimer(true)
  assert.equal(first.pet.dismissCount, 1, '应关掉气泡')
  assert.equal(configStore.disclaimerDismissed, true, '"永久关闭"必须落盘')
  first.coach.stop()

  /*
   * 重启：新建一个 orchestrator 读同一份配置。落盘那一步只在这里能被验出来——
   * 只改内存标记的话，本进程内不再弹，重开应用又弹一次。
   */
  const second = harness()
  second.coach.start()
  await vi.advanceTimersByTimeAsync(3_000)
  assert.equal(second.pet.bubbleTitled('仅供参考'), undefined, '永久关闭后重启不应再弹')
  second.coach.stop()
})

test('stop() 取消还没到点的免责声明延迟', async () => {
  const h = harness()
  h.coach.start()

  /*
   * `stop()` 在生产里走的是退出流程（`main.ts` 的 before-quit，紧接着
   * `coachPetWindow?.destroy()`）。所以只要退出发生在启动后 2 秒内，这个回调就会在
   * 实例已经拆掉之后触发：`loadCoachConfig()` 在拆除期间读一次磁盘，再去问一个
   * 正在销毁的桌宠窗口。未清的 timer 还会一直持有事件循环引用。
   *
   * 原实现是裸 `setTimeout(...)`、句柄丢掉，`stop()` 里没有对应的 clear。
   */
  await vi.advanceTimersByTimeAsync(1_500)
  h.coach.stop()
  await vi.advanceTimersByTimeAsync(5_000)

  assert.equal(h.pet.bubbleTitled('仅供参考'), undefined, 'stop() 之后不该再弹免责声明')
  // 正向锚点：不 stop 的话同一条路径确实会弹——否则上面那条断言可能只是替身没接好。
  const alive = harness()
  alive.coach.start()
  await vi.advanceTimersByTimeAsync(2_500)
  assert.ok(alive.pet.bubbleTitled('仅供参考'), '未 stop 时应照常弹，证明上面不是空转')
  alive.coach.stop()
})

test('重复 start() 不叠加免责声明延迟', async () => {
  const h = harness()
  h.coach.start()
  await vi.advanceTimersByTimeAsync(1_500)
  // 第二次 start() 会重新排一个延迟；旧的那个必须先清掉，否则两个回调都会到点，
  // 而 disclaimerDismissedThisSession 只在用户关闭后才置位，拦不住第二次弹。
  h.coach.start()
  await vi.advanceTimersByTimeAsync(5_000)

  assert.equal(
    h.pet.bubbles.filter((bubble) => bubble.title === '仅供参考').length,
    1,
    '免责声明只应弹一次',
  )
  h.coach.stop()
})

// --- 查询面（IPC 消费） ---

test('指标口径：干预与事件分开计数，contest_audit 不算进干预总数', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  h.coach.recordFeedback({ feedbackType: 'never_today' })
  // 顺手制造一条 contest_audit，用来验它没被算进 total_interventions。
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)

  const metrics = h.coach.getMetrics()
  assert.equal(metrics.events_by_type.multiple_wrong, 1)
  assert.equal(metrics.events_by_type.same_error, 1, '连续两次同 verdict 也应记一条 same_error')
  assert.equal(metrics.total_events, 2)
  assert.equal(metrics.events_by_type.idle_too_long, 0, '未发生的类型要补 0，renderer 才不用防 undefined')
  assert.equal(metrics.never_today_count, 1)
  assert.equal(metrics.contest_audit_count, 1)
  assert.equal(
    metrics.total_interventions,
    listCoachInterventions().filter((row) => row.source_type !== 'contest_audit').length,
    'total_interventions 不应把比赛审计行算进去',
  )
  assert.ok(metrics.since < metrics.until, '统计窗口应是过去 30 天到现在')

  // bundle 返回原始数据（renderer 侧纯函数再算），所以两个面的条数要能对上。
  const bundle = h.coach.getMetricsBundle()
  assert.equal(bundle.events.length, metrics.total_events)
  assert.equal(bundle.feedback.length, 1)
  assert.equal(bundle.feedback[0].feedback_type, 'never_today')
  h.coach.stop()
})

test('单题时间轴把四张表合到一起，first_ac 与最近活动按真实时间算', async () => {
  const h = harness()
  /*
   * 时间轴按 problem_id 关联，而会话里的 problem_id 恒为 null（见文件末尾的记录），
   * 所以访问与提交这两类数据按仓库直接写；干预与事件仍由 orchestrator 自己产出，
   * 这样"合并"这件事至少有一半是被真实链路走出来的。
   */
  const identity = {
    platform: 'codeforces',
    platformProblemId: '1A',
    canonicalUrl: CF_PROBLEM_A,
    title: 'Theatre Square',
    confidence: 'url' as const,
  }
  startProblemVisit({
    identity,
    visitId: 'visit-1',
    activityId: 'activity-1',
    now: '2026-08-30T09:00:00.000',
    localDay: '2026-08-30',
  })
  finishProblemVisit({ visitId: 'visit-1', leftAt: '2026-08-30T09:30:00.000', durationSeconds: 1800 })
  const problemId = getRecentProblems(1)[0].id

  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 's-1',
    problemId,
    verdict: 'WA',
    submittedAt: '2026-08-30T09:10:00.000',
    language: 'C++',
  })
  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 's-2',
    problemId,
    verdict: 'AC',
    submittedAt: '2026-08-30T09:25:00.000',
    language: 'C++',
  })

  insertCoachEvent(buildCoachEvent({
    event_type: 'multiple_wrong',
    severity: 'warn',
    score: 80,
    problem_id: problemId,
    platform: 'codeforces',
    evidence: { wrong_count: 2, verdict: 'WA' },
  }))
  // 正向锚点：事件确实按 problem_id 落库了，下面的合并断言才有东西可合。
  assert.equal(listCoachEventsByProblem(problemId).length, 1, '事件应带着 problem_id 落库')

  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId })
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId })
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 记一笔实测事实：orchestrator 自己产出的事件与干预 **进不了这条轴**。
   * `ProblemSessionTracker.openNewSession` 把 problem_id 写成 null 且再没别处填过
   * （ProblemSessionTracker.ts:375），CoachEventBridge 的 getProblemId 读的就是它，
   * 于是这两次提交产出的事件 problem_id 全是 null。断言写成"仍然是 1 条"而不是"变成 3 条"，
   * 是在钉住当前真实行为；哪天 problem_id 接上了，这里会红，那是提醒而不是回归。
   */
  assert.equal(
    listCoachEventsByProblem(problemId).length,
    1,
    '会话 problem_id 恒为 null，orchestrator 产出的事件目前挂不到题目上',
  )

  const timeline = h.coach.getProblemTimeline(problemId)
  assert.ok(timeline, '已知题目应返回时间轴')
  assert.equal(timeline.title, 'Theatre Square')
  assert.equal(timeline.status, 'solved', '有 AC 提交时状态应是 solved')
  assert.equal(timeline.visits.length, 1)
  assert.equal(timeline.visits[0].duration_seconds, 1800)
  assert.deepEqual(timeline.submissions.map((s) => s.verdict), ['WA', 'AC'], '提交应按时间升序')
  assert.equal(timeline.first_ac_at, '2026-08-30T09:25:00.000', 'first_ac 应取第一条 AC 的时间')
  assert.equal(timeline.events.length, 1, '带 problem_id 的事件应被合进轴')
  assert.equal(timeline.events[0].evidence.wrong_count, 2, 'evidence 应反序列化后原样带出')

  /*
   * 最近活动取 visits 与 submissions 里最晚的那个时间点。
   * 这里最晚的是访问的 left_at（09:30）而不是最后一次提交（09:25）——写成"取最后一条
   * 提交"的话，只看题不提交的那些题在复盘列表里会永远显示"从未活动"。
   */
  assert.equal(timeline.last_activity_at, new Date('2026-08-30T09:30:00.000').toISOString())
  assert.equal(h.coach.getProblemTimeline('missing-problem'), null, '未知题目应返回 null')

  /*
   * 带 problem_id 的干预行才会进轴，也才会进 bundle 的 problem_ac_status
   * （转化率就是拿它和 first_ac 对齐算的）。用仓库直接写一行，绕开上面那个
   * problem_id 恒为 null 的缺口。
   */
  insertCoachIntervention(buildCoachIntervention({
    trigger_reason: 'multiple_wrong',
    intervention_level: 2,
    source_type: 'local_hint',
    message: '先想清楚状态能不能复用。',
    problem_id: problemId,
    platform: 'codeforces',
  }))
  const withIntervention = h.coach.getProblemTimeline(problemId)
  assert.equal(withIntervention?.interventions.length, 1, '带 problem_id 的干预应进轴')
  assert.equal(withIntervention?.interventions[0].user_action, 'shown')

  const bundle = h.coach.getMetricsBundle()
  assert.deepEqual(
    bundle.problem_ac_status,
    [{ problem_id: problemId, first_ac_at: '2026-08-30T09:25:00.000' }],
    'bundle 应把有干预的题目与它的首次 AC 对齐，供 renderer 算转化率',
  )
  h.coach.stop()
})

test('小查询面：审计导出、最近事件与干预、比赛状态同步、LLM 服务句柄', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  // 连续两次同 verdict 折出 multiple_wrong + same_error 两条事件，各自出一条干预。
  assert.equal(h.coach.listRecentEvents().length, 2, '最近事件应能读回刚落库的两条')
  assert.equal(h.coach.listRecentInterventions().length, 2)
  assert.equal(h.coach.listRecentEvents(1).length, 1, 'limit 应真的生效')
  assert.deepEqual(h.coach.exportAuditLog(), [], '没打过比赛时审计导出应是空的')
  assert.equal(h.coach.getLlmHintService().isReady(), true, 'IPC 拿到的应是同一个已就绪的服务')

  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)
  assert.equal(h.coach.exportAuditLog().length, 1, '打过比赛后审计导出应有记录')

  /*
   * syncContestModeState 供"新窗口刚建好"时补发一次状态。
   * 少了它，比赛期间新开的窗口会停在正常模式的 UI 上。
   */
  const fresh = new AppWindow({
    id: 'window-late',
    browserWindow: new MockBrowserWindow() as unknown as Electron.BrowserWindow,
    tabManager: new FakeTabManager() as unknown as TabManager,
  })
  h.coach.syncContestModeState(fresh)
  const pushed = (fresh.browserWindow as unknown as MockBrowserWindow).webContents.sentMessages.at(-1)
  assert.equal(pushed?.channel, 'coach:contestModeChanged')
  assert.equal((pushed?.args[0] as { isContestMode: boolean }).isContestMode, true, '补发的状态应是"正在比赛"')

  // 离开比赛后再补发一次：这次应该是"不在比赛"，证明它读的是当前状态而不是写死的。
  h.tabManagers[0].emitWebContentsUrl(11, CF_PROBLEM_A)
  h.coach.syncContestModeState(fresh)
  const after = (fresh.browserWindow as unknown as MockBrowserWindow).webContents.sentMessages.at(-1)
  assert.deepEqual(after?.args[0], { isContestMode: false, contest: null })
  h.coach.stop()
})

// --- 降级与边界 ---

test('LLM 未配置时事件仍落库但不产生干预，用户主动点击走本地阶梯', async () => {
  configStore.llmEnabled = false
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getState().llm_enabled, false, '前提：LLM 处于未就绪状态')

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 设计意图（handleCoachEvent 里那句 `if (!this.llmHintService.isReady()) return`）：
   * LLM 没配时不主动打扰，只保留桌宠陪伴。所以"事件落库了但没有干预"是正确行为，
   * 不是缺陷——正向锚点是事件条数，它证明链路走到了那个 return 而不是更早就断了。
   */
  assert.equal(listCoachEvents().length, 1, '未配 LLM 时事件仍须落库')
  assert.deepEqual(listCoachInterventions(), [], '未配 LLM 时不主动产生干预')
  assert.deepEqual(sdk.requests, [], '未配 LLM 时不应发出任何请求')
  assert.deepEqual(h.pet.bubbles, [], '未配 LLM 时不应主动弹气泡')
  /*
   * 桌宠状态也必须没动过。少了这条，"未配 LLM 就早退"那句 return 被删掉后
   * 上面几条仍全绿：generateHint 在未就绪时返回 null，于是干预与气泡照样是空的，
   * 唯一变化就是桌宠白白转进 thinking 再也没人把它转回来。
   */
  assert.deepEqual(h.pet.states, [], '未配 LLM 时不该把桌宠转进 thinking')

  // 但用户主动点击必须有反应：本地 HintLadder 不依赖 LLM。
  const clicked = await h.coach.petClick()
  assert.equal(clicked.triggered, true, '未配 LLM 时点桌宠也要给出本地提示')
  assert.equal(clicked.llmEnabled, false)
  assert.equal(listCoachInterventions().at(-1)?.source_type, 'local_rule')
  assert.equal(await h.coach.chatWithLlm('你好'), null, '未配 LLM 时聊天应明确返回 null')
  h.coach.stop()
})

test('没有桌宠窗口时整条链路照跑：干预仍落库，不因为少一个窗口而抛', async () => {
  const h = harness(1, { withPet: false })
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(3_000)

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  /*
   * 桌宠是可选依赖。这条守的是"落库与展示解耦"：少了 `?.` 的话用户关掉桌宠之后
   * 每条事件都会在 setPetState 上抛，异步链路里被吞掉，表面看是"提示时不时就不出"。
   */
  assert.equal(listCoachInterventions().length, 1, '没有桌宠也要把干预落库')
  assert.equal(h.pet.bubbles.length, 0, '替身桌宠没被接上，自然收不到气泡')
  assert.equal(h.coach.getState().pet_state, 'idle', '拿不到桌宠时状态应回退成 idle')
  // 主动路径也不能抛。
  assert.equal((await h.coach.petClick()).triggered, true)
  assert.equal(h.coach.dismissHint(), true)
  h.coach.dismissDisclaimer(false)
  h.coach.stop()
})

test('同一页的重复非导航事件只抓一次题面，页面被销毁时作废当前缓存', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  const baseline = h.tabManagers[0].scriptCalls.length
  assert.equal(baseline, 1, '正向锚点：首轮确实抓过一次')

  assert.equal(h.coach.getCurrentConstraints()?.source, 'regex', '正向锚点：首轮是真解析出来的')

  // active-tab-changed 不是导航，同页同 URL 且已有结果时应命中去重直接 return。
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_A, { reason: 'active-tab-changed' }))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.tabManagers[0].scriptCalls.length, baseline, '同页重复事件不应再抓一次')
  /*
   * source 仍是 regex 才说明整条 fetch 路径都没重跑。
   * 只看 scriptCalls 抓不到"去重被删掉"：ConstraintParser 有进程内缓存，重跑一遍
   * 会命中缓存、不再注入，scriptCalls 一样是 1，但 source 会变成 cache。
   */
  assert.equal(h.coach.getCurrentConstraints()?.source, 'regex', '去重应让整条抽取路径都不重跑')

  // dom-ready 之类的 reason 连去重都不用走，直接被 reason 白名单挡掉。
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_A, { reason: 'dom-ready' }))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.tabManagers[0].scriptCalls.length, baseline, '非导航类 reason 不应触发抓取')
  assert.equal(h.coach.getCurrentConstraints()?.nUpper, 200_000, '去重期间缓存必须仍在')

  /*
   * 标签被关掉：当前缓存必须作废。留着的话下一道题的提示会带着已关闭页面的约束，
   * 而 `currentProblemPage` 也会一直指向一个死 webContents。
   */
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_A, { reason: 'destroyed' }))
  assert.equal(h.coach.getCurrentConstraints(), null, '当前页被销毁应清空约束')
  assert.equal(h.coach.getCurrentProblemUrl(), null)

  // 另一个页面被销毁时不该牵连当前页：先重新抓一次，再销毁一个别的页。
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_A, { reason: 'did-navigate' }))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '重新抓取应恢复缓存')
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_B, { tabId: 'tab-9', webContentsId: 99, reason: 'destroyed' }))
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '别的页被销毁不应清掉当前页缓存')
  h.coach.stop()
})

test('活动标签切成空页时清空约束缓存，重复 attach 同一窗口不重复挂监听', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '正向锚点：缓存已建立')
  const listenersAfterStart = h.tabManagers[0].listenerCount

  /*
   * attachAppWindow 由"新窗口建好"时调用，重复调用必须幂等。
   * 少了那个 `attachedWindowCleanups.has` 早退，每次开窗都会多挂一份 webContentsUrl
   * 监听器，比赛 URL 聚合会收到重复快照，而 stop() 只退得掉最后注册的那一份。
   */
  h.coach.attachAppWindow(h.windows[0])
  assert.equal(h.tabManagers[0].listenerCount, listenersAfterStart, '重复 attach 不应多挂监听器')

  /*
   * 活动标签变成"没有页"（最后一个标签被关掉）：缓存必须清掉。
   * 用 emitActiveTabChange 而不是 switchActiveTab：后者会把 activePage 设成那个空事件，
   * 于是走的是 maybeFetchConstraints 里 `if (!url)` 那条分支，
   * `getActivePageEvent() === null` 时的 else 分支反而测不到（删掉也不会红）。
   */
  h.tabManagers[0].activePage = null
  h.tabManagers[0].emitActiveTabChange('')
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentProblemUrl(), null, '没有活动页时应清空约束缓存')
  assert.equal(h.coach.getCurrentConstraints(), null)

  // 另一条分支：有活动页但 URL 是空串（页面还没开始加载），同样要清。
  h.tabManagers[0].switchActiveTab(pageEvent(CF_PROBLEM_A))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '正向锚点：缓存能重新建起来')
  h.tabManagers[0].switchActiveTab(pageEvent(''))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentProblemUrl(), null, '活动页 URL 为空时也应清空约束缓存')

  h.coach.stop()
  assert.equal(h.tabManagers[0].listenerCount, 0, '幂等 attach 之后 stop() 仍应把监听器清零')
})

test('dismiss 反馈关气泡、helpful 反馈留着气泡，两者都落库', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  await h.coach.petClick()
  const shownId = listCoachInterventions().at(-1)!.intervention_id
  assert.ok(h.pet.bubbles.length > 0, '正向锚点：气泡确实弹过')

  assert.equal(h.coach.recordFeedback({ interventionId: shownId, feedbackType: 'helpful' }), true)
  /*
   * helpful 不关气泡：用户说"有用"之后气泡还得留在那儿让他继续看提示内容。
   * 把条件写成"任何反馈都关"，点了"有用"提示当场消失，等于惩罚正向反馈。
   */
  assert.equal(h.pet.dismissCount, 0, 'helpful 不应关掉气泡')
  assert.equal(h.pet.getPetState() !== 'idle', true, 'helpful 不应把桌宠切回 idle')

  assert.equal(h.coach.recordFeedback({ interventionId: shownId, feedbackType: 'dismiss' }), true)
  assert.equal(h.pet.dismissCount, 1, 'dismiss 应关掉气泡')
  assert.equal(h.pet.getPetState(), 'idle')

  const feedback = listCoachFeedback()
  assert.deepEqual(
    feedback.map((row) => row.feedback_type).sort(),
    ['dismiss', 'helpful'],
    '两类反馈都必须落库，指标要按类型分别统计',
  )
  assert.equal(feedback.every((row) => row.intervention_id === shownId), true, '反馈必须关联到具体干预')
  h.coach.stop()
})

test('聊天与"给点提示"两个 IPC 面各自带并发门，正常时把当前题目上下文带上', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  const reply = await h.coach.chatWithLlm('这题为什么会 TLE', [
    { role: 'user', content: '第一步' },
    { role: 'assistant', content: '先看数据范围' },
  ])
  assert.ok(reply, '正常情况下聊天必须拿到回复')
  const chatMessages = sdk.requests.at(-1)?.messages ?? []
  assert.deepEqual(chatMessages.map((m) => m.role), ['system', 'user', 'assistant', 'user'], '历史应原样接进消息序列')
  const chatText = chatMessages.map((m) => m.content).join('\n')
  assert.match(chatText, /这题为什么会 TLE/, '学生原话应发出去')
  /*
   * 当前题目 URL 与已抽取的约束都要进 prompt——这是 orchestrator 相对 LlmHintService
   * 多做的那一层（它持有 currentProblemUrl / currentConstraints）。
   * 少了这两项，聊天里问"这题"LLM 根本不知道指哪道。
   */
  assert.match(chatText, /problemset\/problem\/1\/A/, '当前页 URL 应进 prompt')
  assert.match(chatText, /200000|2·10\^5/, '已抽取的 n 上界应进 prompt')

  const hint = await h.coach.requestHintFromLlm()
  assert.ok(hint, '"给点提示"也应拿到正文')
  const hintText = sdk.requests.at(-1)?.messages?.map((m) => m.content).join('\n') ?? ''
  assert.match(hintText, /目标提示等级: L1/)
  // 约束同样要带上：不带的话"给点提示"给出的复杂度建议与这道题的 n 无关。
  assert.match(hintText, /200000|2·10\^5/, '已抽取的 n 上界应进"给点提示"的 prompt')

  /*
   * 并发门：llmRequestInProgress 是两个方法共用的。挂住第一发之后，
   * 第二发（无论是聊天还是要提示）都必须立刻返回 null 而不是再打一次上游。
   * 没有这道门，用户连按回车会按几次就发几次，token 照倍数烧。
   */
  const requestsBefore = sdk.requests.length
  sdk.hold = true
  const pending = h.coach.chatWithLlm('还在吗')
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(sdk.requests.length, requestsBefore + 1, '第一发确实出去了')
  assert.equal(await h.coach.chatWithLlm('再问一句'), null, '同时的第二发聊天应被挡住')
  assert.equal(await h.coach.requestHintFromLlm(), null, '同时的"给点提示"共用同一道门')
  assert.equal(sdk.requests.length, requestsBefore + 1, '被挡住的调用不应产生请求')

  sdk.hold = false
  sdk.releaseHold?.()
  assert.ok(await pending, '第一发最终应正常返回')
  // 门在 finally 里放开：放开后同样的调用要能过，否则一次超时永久锁死聊天。
  assert.ok(await h.coach.chatWithLlm('放开了吗'), '门放开后聊天应恢复')
  h.coach.stop()
})

test('题面注入失败时静默退化：约束为 null，提示照出、事件照落库', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.tabManagers[0].scriptError = new Error('webContents destroyed')
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)

  // 正向锚点：注入确实被尝试过（不是"根本没走到抽取"）。
  assert.equal(h.tabManagers[0].scriptCalls.length, 1, '应真的试过一次注入')
  assert.equal(h.coach.getCurrentConstraints(), null, '注入失败时约束应是 null')
  /*
   * 记一笔：orchestrator 自己那个 executeScript 里的 try/catch 是冗余的。
   * `ConstraintParser.fetchAndParse` 已经把 executeScript 整个包在 try/catch 里
   * 并 return null（ConstraintParser.ts:161-166），所以把 orchestrator 这层 catch
   * 删掉，行为完全不变、一条用例都不红（验过）。本用例守的是"失败要静默退化"这个
   * 结果，两层里任意一层在就成立。
   */
  /*
   * URL 仍要记住：它是聊天上下文里"当前在看哪道题"的唯一来源。
   * 把抽取失败当成"没有题目"处理的话，用户在题目页上聊天会退化成无题目对话。
   */
  assert.equal(h.coach.getCurrentProblemUrl(), CF_PROBLEM_A, '抽取失败不该连 URL 一起丢')
  assert.equal(h.coach.getCurrentSession()?.platform_problem_id, '1A', '抽取失败不该影响会话')

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(listCoachEvents().length, 1, '抽取失败不应阻塞事件链路')
  assert.equal(listCoachInterventions().length, 1, '没有约束也要照常出提示（泛化文案）')

  // 恢复注入后下一次导航应该重新抓成功，证明失败不是永久状态。
  h.tabManagers[0].scriptError = null
  h.tabManagers[0].emitPageEvent(pageEvent(CF_PROBLEM_B))
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentConstraints()?.nUpper, 200_000, '注入恢复后应重新抓到约束')
  h.coach.stop()
})

test('窗口关闭时自行退出比赛跟踪，stop() 不会对同一个窗口退两次', async () => {
  const h = harness(2)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  const listenersOnTwo = h.tabManagers[1].listenerCount
  assert.equal(listenersOnTwo, 1, '正向锚点：window-2 挂着比赛聚合监听')

  /*
   * 用户关掉 window-2：attachAppWindow 注册的 `closed` 回调应把它自己摘掉。
   * 摘不掉的话，聚合器会一直持有一个死窗口的 URL 快照，
   * 比赛模式在窗口关闭后仍然是"开"的。
   */
  h.browserWindows[1].emit('closed')
  assert.equal(h.tabManagers[1].listenerCount, 0, '窗口关闭应自动退掉该窗口的比赛跟踪')

  // 关掉的窗口不该再影响比赛判定；window-1 仍然管用。
  h.tabManagers[1].emitWebContentsUrl(21, CF_CONTEST)
  assert.equal(h.coach.getState().is_contest_mode, false, '已退订的窗口不该还能开比赛模式')
  h.tabManagers[0].emitWebContentsUrl(11, CF_CONTEST)
  assert.equal(h.coach.getState().is_contest_mode, true, '正向对照：活着的窗口仍能开比赛模式')

  /*
   * stop() 会再走一遍 detach 循环，对已经关掉的 window-2 必须无副作用。
   *
   * 记一笔：`detachAppWindow` 里的 `if (!cleanup) return` 是**测不到的**。
   * `closed` 回调已经把该 id 从 attachedWindowCleanups 里删掉，
   * stop() 的循环遍历的就是这张表的 keys，所以永远不会带着一个已摘的 id 进来。
   * 把那句改成 `throw` 一条用例都不红（验过）——它防的是将来有人从别处直接调
   * detachAppWindow，不是当前接线里的活判定。
   */
  h.coach.stop()
  assert.equal(h.tabManagers[0].listenerCount, 0)
  assert.equal(h.tabManagers[1].listenerCount, 0)
  // 重复 stop() 也必须安全：真实退出路径里 before-quit 与窗口 closed 可能都走到这。
  h.coach.stop()
  assert.equal(h.coach.getState().is_contest_mode, false, '重复 stop() 之后状态仍是干净的')
})

test('没有会话时 coach:triggerHint 仍能一路爬到 L5，落库的归属字段是 null 而不是 undefined', async () => {
  const h = harness()
  // 首页：认不出题目，所以整条链路上 getCurrentSession() 恒为 null。
  h.tabManagers[0].activePage = pageEvent('https://codeforces.com/')
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(h.coach.getCurrentSession(), null, '前提：确实没有会话')

  /*
   * petClick 会因为"无当前题目"早退，但 `coach:triggerHint` 直接调 requestHintUpgrade
   * （registerCoachIpc.ts:277），它**不检查会话**。所以这条路在生产里真的会被走到：
   * 用户先在题目页上拿到气泡，再切到首页点"再给一点"。
   */
  const first = await h.coach.requestHintUpgrade()
  assert.equal(first.accepted, true, '没有会话时"再给一点"仍应给出提示')
  assert.equal(first.level, 1)

  const row = listCoachInterventions().find((r) => r.intervention_id === first.interventionId)
  /*
   * 归属三件套必须是 null。写成 undefined 的话 better-sqlite3 在 bind 时直接抛
   * "TypeError: Invalid value"，整条提示链路在无会话时会全线崩掉。
   *
   * 记一笔：这条断言有**两层**实现能满足——orchestrator 这边的 `?? null`，
   * 以及 `buildCoachIntervention` 里的 `input.problem_id ?? null`
   * （interventionsRepository.ts:104-106）。把 orchestrator 那层改成 undefined
   * 这条断言不会红（验过），因为下游又兜了一次。断言守的是落库结果，不是某一层。
   */
  assert.equal(row?.problem_id, null, 'problem_id 应是 null')
  assert.equal(row?.session_id, null, 'session_id 应是 null')
  assert.equal(row?.platform, null, 'platform 应是 null')

  for (const expected of [2, 3, 4]) {
    assert.equal((await h.coach.requestHintUpgrade()).level, expected, `应能升到 L${expected}`)
  }

  // L5 确认这一步同样要能在无会话下落库。
  const pending = await h.coach.requestHintUpgrade()
  assert.equal(pending.needsConfirmation, true)
  const confirmRow = listCoachInterventions().find((r) => r.trigger_reason === 'l5_confirmation_pending')
  assert.equal(confirmRow?.session_id, null, '确认行的归属字段同样是 null')
  assert.equal(confirmRow?.source_type, 'llm', 'LLM 就绪时确认行标 llm')
  assert.equal((await h.coach.requestHintUpgrade()).level, 5, '确认后应给 L5')
  h.coach.stop()
})

test('LLM 回了解析不出的内容时按失败处理：降级本地，不把原始串当提示展示', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  // 上游偶发返回带前后缀的解释性文本 / 截断的 JSON，这是线上最常见的一类脏响应。
  sdk.reply = '抱歉，我无法回答这个问题。'

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)

  // 正向锚点：请求确实发出去了，事件也确实落库了。
  assert.equal(sdk.requests.length, 1, '应真的问过一次 LLM')
  assert.equal(listCoachEvents().length, 1, '事件应落库')
  /*
   * 解析失败时 generateHint 返回 null，事件驱动这条路就"什么都不做"——
   * 不落干预、不弹气泡。把原始串直接当提示展示的话，用户会看到一句
   * 与题目无关的道歉，而审计里还会记成一条 LLM 提示。
   */
  assert.equal(listCoachInterventions().length, 0, '解析不出内容时不应落库任何干预')
  // 用 length 而不是 deepEqual(..., [])：后者的 `asserts actual is T` 会把 bubbles
  // 在本作用域里收窄成 never[]，下面读 bubbles.at(-1)?.message 就编译不过。
  assert.equal(h.pet.bubbles.length, 0, '解析不出内容时不应弹气泡')

  /*
   * 用户主动要提示时必须降级到本地阶梯，而且等级要从 L1 起。
   *
   * 用 requestHintUpgrade 而不是 petClick 来判：petClick 会先把 currentHintLevel
   * 清成 0，于是"失败的那次有没有偷偷把等级记成 1"就看不出来了。
   * 记成 1 的话用户下一次点"再给一点"会直接跳到 L2，中间那级被一次脏响应吃掉。
   */
  const upgraded = await h.coach.requestHintUpgrade()
  assert.equal(upgraded.accepted, true, '脏响应下主动要提示应降级到本地提示')
  assert.equal(upgraded.level, 1, '失败的那次不该把等级记成 1，所以这次仍是 L1')
  assert.equal(listCoachInterventions().at(-1)?.source_type, 'local_rule')
  assert.ok(!(h.pet.bubbles.at(-1)?.message ?? '').includes('抱歉'), '不应把上游原始串当提示展示')
  h.coach.stop()
})

test('免责声明本会话内只弹一次；未开始的访问与未 AC 的题目在时间轴上不算错', async () => {
  const h = harness()
  h.coach.start()
  await vi.advanceTimersByTimeAsync(3_000)
  assert.ok(h.pet.bubbleTitled('仅供参考'), '正向锚点：第一次确实弹了')
  const bubblesAfterFirst = h.pet.bubbles.length

  /*
   * 用户点掉之后（非永久），本会话内不该再弹。
   * 守的是 `disclaimerDismissedThisSession` 那道门：少了它，第二个窗口建好
   * 或任何再次触发都会把同一句免责声明重新推一遍。
   */
  h.coach.dismissDisclaimer(false)
  assert.equal(configStore.disclaimerDismissed, false, '非永久关闭不应落盘')
  h.coach.start()
  await vi.advanceTimersByTimeAsync(3_000)
  assert.equal(h.pet.bubbles.length, bubblesAfterFirst, '同一会话内不应再弹第二次')

  /*
   * 时间轴的两个边界：访问还没结束（left_at 为 null）、题目还没 AC。
   * 这两种是复盘列表里最常见的状态（正在做的题），
   * `Date.parse(null)` 会得到 NaN。这里同样是两层兜底：`if (v.left_at)` 那道判断，
   * 以及后面的 `candidateTimes.filter((t) => !Number.isNaN(t))`。
   * 单独拆掉前者这条断言不会红（验过），因为 NaN 会被过滤掉；
   * 断言守的是 last_activity_at 的取值，不是那一句判断。
   */
  const identity = {
    platform: 'codeforces',
    platformProblemId: '1A',
    canonicalUrl: CF_PROBLEM_A,
    title: 'Theatre Square',
    confidence: 'url' as const,
  }
  startProblemVisit({
    identity,
    visitId: 'visit-open',
    activityId: 'activity-open',
    now: '2026-08-31T20:00:00.000',
    localDay: '2026-08-31',
  })
  const problemId = getRecentProblems(1)[0].id
  upsertSubmission({
    platform: 'codeforces',
    platformSubmissionId: 's-wa',
    problemId,
    verdict: 'WA',
    submittedAt: '2026-08-31T20:05:00.000',
    language: 'C++',
  })

  const timeline = h.coach.getProblemTimeline(problemId)
  assert.ok(timeline, '未完成的题目也应有时间轴')
  assert.equal(timeline.visits.length, 1)
  assert.equal(timeline.visits[0].left_at, null, '未结束的访问 left_at 应是 null')
  assert.equal(timeline.first_ac_at, null, '没有 AC 时 first_ac_at 应是 null 而不是报错')
  assert.equal(
    timeline.last_activity_at,
    new Date('2026-08-31T20:05:00.000').toISOString(),
    '最近活动应取已有时间点里最晚的那个，不能被 null 的 left_at 污染成 Invalid Date',
  )
  h.coach.stop()
})

test('reloadLlmConfig 把配置改动透到服务上，不需要重启', async () => {
  const h = harness()
  h.tabManagers[0].activePage = pageEvent(CF_PROBLEM_A)
  h.coach.start()
  await vi.advanceTimersByTimeAsync(0)
  // 正向锚点：此刻是就绪的，事件能出提示。
  assert.equal(h.coach.getState().llm_enabled, true)

  /*
   * 用户在设置面板把 LLM 关掉。IPC 只调 reloadLlmConfig，
   * 不调的话面板显示已关闭、后台还在继续往上游发请求。
   */
  configStore.llmEnabled = false
  h.coach.reloadLlmConfig()
  assert.equal(h.coach.getState().llm_enabled, false, '关掉后应立刻转为未就绪')

  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  h.emitSubmission({ platform: 'codeforces', verdict: 'TLE', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(listCoachEvents().length, 1, '事件仍落库')
  assert.deepEqual(sdk.requests, [], '关掉之后不应再有外发请求')

  // 再打开：同一条链路立刻恢复，证明上面不是"关了就再也开不回来"。
  configStore.llmEnabled = true
  h.coach.reloadLlmConfig()
  assert.equal(h.coach.getState().llm_enabled, true)
  h.emitSubmission({ platform: 'codeforces', verdict: 'WA', problemId: 'p1' })
  await vi.advanceTimersByTimeAsync(0)
  assert.equal(sdk.requests.length, 1, '重新打开后应恢复外发')
  h.coach.stop()
})
