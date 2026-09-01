import assert from 'node:assert/strict'
import { beforeEach, test } from 'vitest'
import { CoachEventBridge, isAcVerdict, isWrongVerdict } from '../../electron/coach/CoachEventBridge.ts'
import type { SubmissionNotification } from '../../electron/submissions/SubmissionWatcherCore.ts'
import type { CoachEvent } from '../../electron/coach/types.ts'

/**
 * CoachEventBridge：把提交检测通知折成 0~2 个 CoachEvent 的那段判定。
 *
 * 这个文件此前完全没有测试（覆盖率 4.76%，79-266 行全空）。它不碰数据库也不碰
 * Electron，唯一的输入是 `handleSubmission(notification)`，唯一的输出是回调里
 * 收到的事件数组——所以整段逻辑本来就是可直接驱动的，缺的只是用例。
 *
 * 断言取向：**每条用例都断言事件的类型序列与 evidence 数值**，不只断言"有没有事件"。
 * 只断言条数的话，`multiple_wrong` 与 `same_error` 两条互相顶替也能过；
 * 而这两条在生产里走的是不同的提示类目，混起来提示内容就错了。
 *
 * 与 `tests/coach/ruleEngine.test.ts` 的分工：那边验"事件进来之后要不要打扰用户"
 * （节流/评分/比赛硬关闭），本文件验"提交进来之后算不算一个事件"。两者之间的接线
 * （orchestrator 把 bridge 挂到 RealtimeSubmissionService 上）由
 * coachOrchestratorLifecycle.test.ts 负责。
 */

function notification(overrides: Partial<SubmissionNotification> = {}): SubmissionNotification {
  return {
    platform: 'codeforces',
    verdict: 'WA',
    problemId: 'problem-1',
    ...overrides,
  }
}

/** 每条用例都从干净状态起步：wrongCount / verdictHistory / hadAc 全是实例级累计量。 */
let bridge: CoachEventBridge
let dispatched: CoachEvent[]

beforeEach(() => {
  dispatched = []
  bridge = new CoachEventBridge({
    getSessionId: () => 'session-1',
    getProblemId: () => 'problem-db-1',
    getProblemRating: () => 1500,
    onCoachEvent: (event) => { dispatched.push(event) },
  })
})

function types(events: CoachEvent[]): string[] {
  return events.map((event) => event.event_type)
}

test('第一次错误不成事件，第二次才触发 multiple_wrong', () => {
  const first = bridge.handleSubmission(notification({ verdict: 'WA' }))
  // 正向脚手架：这条"不该有事件"的断言旁边就是下一行真的产出了事件的正向证据，
  // 所以它不是"默认什么都不发生"的空转。
  assert.deepEqual(types(first), [], '单次 WA 不该打扰用户')

  const second = bridge.handleSubmission(notification({ verdict: 'TLE' }))
  assert.deepEqual(types(second), ['multiple_wrong'], '第二次错误应触发 multiple_wrong')
  assert.equal(second[0].evidence.wrong_count, 2)
  assert.equal(second[0].evidence.verdict, 'TLE', 'evidence 记的是本次 verdict')
  assert.equal(second[0].severity, 'warn', '2 次错误只算 warn')
  assert.equal(second[0].score, 80, 'score = 60 + wrongCount*10')
  // 派发出口与返回值必须是同一批事件，否则上游收到的和调用方看到的会不一致。
  assert.deepEqual(dispatched, second, 'onCoachEvent 应收到与返回值相同的事件')
})

test('累计 3 次错误后 multiple_wrong 升为 critical，且每次都继续出事件', () => {
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  bridge.handleSubmission(notification({ verdict: 'TLE' }))
  const third = bridge.handleSubmission(notification({ verdict: 'RE' }))

  /*
   * 第三次走的是"已达阈值"那条 else 分支（previousWrongCount 已经 >= 2）。
   * 它必须仍然产出事件：节流是 RuleEngine 的职责，bridge 少发一条，
   * RuleEngine 那边的计数与"同题错了几次"就永久对不上了。
   */
  assert.ok(types(third).includes('multiple_wrong'), '第三次错误仍应产出 multiple_wrong')
  const multipleWrong = third.find((event) => event.event_type === 'multiple_wrong')!
  assert.equal(multipleWrong.severity, 'critical', '>=3 次错误升级为 critical')
  assert.equal(multipleWrong.score, 90)
  assert.equal(multipleWrong.evidence.wrong_count, 3)
})

test('同一 verdict 连续重复才出 same_error，中间换过 verdict 就不出', () => {
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  const secondWa = bridge.handleSubmission(notification({ verdict: 'WA' }))
  // 连续两次 WA：multiple_wrong 与 same_error 同时成立，顺序由生产代码决定。
  assert.deepEqual(types(secondWa), ['multiple_wrong', 'same_error'])
  const sameError = secondWa[1]
  assert.equal(sameError.evidence.same_verdict_repeat, 2)
  assert.equal(sameError.severity, 'warn')
  assert.equal(sameError.score, 75, 'score = 55 + repeat*10')

  // 换成 TLE：末两位是 WA/TLE，连续性断了。
  const tle = bridge.handleSubmission(notification({ verdict: 'TLE' }))
  assert.deepEqual(types(tle), ['multiple_wrong'], 'verdict 变化后不应再报 same_error')

  // 再连续两次 TLE，连续段重新长起来，证明上一条不是"same_error 永久失效"。
  bridge.handleSubmission(notification({ verdict: 'TLE' }))
  const thirdTle = bridge.handleSubmission(notification({ verdict: 'TLE' }))
  const repeated = thirdTle.find((event) => event.event_type === 'same_error')!
  assert.equal(repeated.evidence.same_verdict_repeat, 3, '连续 3 次 TLE 应记 repeat=3')
  assert.equal(repeated.severity, 'critical', 'repeat>=3 升级为 critical')
})

test('AC 只在首次产出 first_ac，重复 AC 不再报', () => {
  const first = bridge.handleSubmission(notification({ verdict: 'AC' }))
  assert.deepEqual(types(first), ['first_ac'])
  assert.equal(first[0].severity, 'info')
  assert.equal(first[0].score, 30)
  assert.equal(first[0].evidence.verdict, 'AC')

  const second = bridge.handleSubmission(notification({ verdict: 'AC' }))
  assert.deepEqual(types(second), [], '同题第二次 AC 不该再庆祝一遍')
})

test('AC 不清零同题的 wrongCount：AC 之后再错一次仍算累计第二次', () => {
  /*
   * 这条守的是 hadAc 与 wrongCount 相互独立。
   * 生产里用户常"WA → 改对 AC → 又改坏 WA"，如果 AC 顺手清零，
   * 后面那次 WA 会被当成"第一次错"而不提醒，等于把最需要提示的回归场景漏掉。
   */
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  bridge.handleSubmission(notification({ verdict: 'AC' }))
  const afterAc = bridge.handleSubmission(notification({ verdict: 'WA' }))

  assert.ok(types(afterAc).includes('multiple_wrong'), 'AC 不应清零累计错误数')
  const event = afterAc.find((item) => item.event_type === 'multiple_wrong')!
  assert.equal(event.evidence.wrong_count, 2)
})

test('不同 problemId 各自独立累计，互不触发', () => {
  bridge.handleSubmission(notification({ problemId: 'problem-a', verdict: 'WA' }))
  const otherProblem = bridge.handleSubmission(notification({ problemId: 'problem-b', verdict: 'WA' }))

  // 两道题各错一次，都不该到阈值——状态是按 problemKey 分桶的。
  assert.deepEqual(types(otherProblem), [], '另一道题的第一次错误不该被算进前一道')

  // 正向脚手架：同一道题再错一次立刻触发，证明阈值判定本身是活的。
  const sameProblemAgain = bridge.handleSubmission(notification({ problemId: 'problem-a', verdict: 'WA' }))
  assert.ok(types(sameProblemAgain).includes('multiple_wrong'), '同题第二次错误应触发')
  assert.equal(bridge.getProblemStateForTest('problem-a')?.wrongCount, 2)
  assert.equal(bridge.getProblemStateForTest('problem-b')?.wrongCount, 1)
})

test('缺 problemId 时按 unknown:平台 分桶，不会与真实题目串味', () => {
  bridge.handleSubmission(notification({ problemId: undefined, verdict: 'WA' }))
  bridge.handleSubmission(notification({ problemId: undefined, verdict: 'WA' }))

  const fallback = bridge.getProblemStateForTest('unknown:codeforces')
  assert.equal(fallback?.wrongCount, 2, '同平台的未知题应聚到同一桶')
  assert.equal(bridge.getProblemStateForTest('problem-1'), undefined, '不该污染具名题目的桶')
})

test('verdict 大小写归一，空 verdict 落为 UNKNOWN 且不计入错误', () => {
  const lower = bridge.handleSubmission(notification({ verdict: 'wa' }))
  assert.deepEqual(types(lower), [], '首次错误仍不触发')
  assert.deepEqual(bridge.getProblemStateForTest('problem-1')?.verdictHistory, ['WA'], '小写 verdict 应存成大写')

  // 空串走 `notification.verdict || 'UNKNOWN'`，UNKNOWN 不在错误清单里。
  const unknown = bridge.handleSubmission(notification({ verdict: '' }))
  assert.deepEqual(types(unknown), [], 'UNKNOWN 不该被当成一次错误')
  assert.equal(bridge.getProblemStateForTest('problem-1')?.wrongCount, 1, 'wrongCount 仍是 1')

  // 正向脚手架：真的再错一次就触发，说明上面两条不是"永远不触发"。
  const realWrong = bridge.handleSubmission(notification({ verdict: 'WA' }))
  assert.ok(types(realWrong).includes('multiple_wrong'))
})

test('verdictHistory 截到最近 20 条，不随提交次数无界增长', () => {
  for (let i = 0; i < 25; i++) {
    bridge.handleSubmission(notification({ verdict: 'WA' }))
  }
  const state = bridge.getProblemStateForTest('problem-1')!
  assert.equal(state.verdictHistory.length, 20, '历史应被裁到 20 条')
  // wrongCount 是独立累加器，不受裁剪影响：提示文案里"错了 25 次"必须仍然准确。
  assert.equal(state.wrongCount, 25, '裁剪历史不应影响累计错误数')
})

test('会话与题目上下文由注入的 provider 决定，缺 provider 时落 null', () => {
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  const event = bridge.handleSubmission(notification({ verdict: 'WA' }))[0]
  assert.equal(event.session_id, 'session-1', 'session_id 取自 getSessionId')
  assert.equal(event.problem_id, 'problem-db-1', 'problem_id 取自 getProblemId（不是 notification 的 key）')
  assert.equal(event.platform, 'codeforces', 'platform 取自 notification')
  assert.equal(event.evidence.problem_rating, 1500)
  assert.match(event.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/, '时间戳用本地时间，不带 Z 后缀')
  assert.match(event.event_id, /^[0-9a-f-]{36}$/, 'event_id 应是 uuid')

  // 无 provider 的实例：三项都必须是 null，而不是 undefined——落库列不允许 undefined。
  const bare = new CoachEventBridge()
  bare.handleSubmission(notification({ verdict: 'WA' }))
  const bareEvent = bare.handleSubmission(notification({ verdict: 'WA' }))[0]
  assert.equal(bareEvent.session_id, null)
  assert.equal(bareEvent.problem_id, null)
  assert.equal(bareEvent.evidence.problem_rating, undefined, 'rating 缺失时不写进 evidence')
})

test('attach 接上订阅、返回的 disposer 断开订阅，detach 可重复调用', () => {
  let subscriberCount = 0
  let emit: ((n: SubmissionNotification) => void) | null = null
  const detach = bridge.attach((callback) => {
    subscriberCount += 1
    emit = callback
    return () => { subscriberCount -= 1; emit = null }
  })
  assert.equal(subscriberCount, 1, 'attach 应订阅一次')

  // 通过订阅进来的通知也要走完整判定链，不能只走返回值路径。
  emit!(notification({ verdict: 'WA' }))
  emit!(notification({ verdict: 'WA' }))
  assert.deepEqual(types(dispatched), ['multiple_wrong', 'same_error'], '订阅进来的提交应产出事件')

  detach()
  assert.equal(subscriberCount, 0, 'disposer 应退订')
  // 幂等：orchestrator.stop() 可能在窗口已关时重复走到这里，二次调用不该炸。
  bridge.detach()
  assert.equal(subscriberCount, 0)
})

test('resetForTest 清空累计状态', () => {
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  assert.ok(bridge.getProblemStateForTest('problem-1'), '先确认状态真的建起来了')
  bridge.resetForTest()
  assert.equal(bridge.getProblemStateForTest('problem-1'), undefined)

  // 清空后第一次错误重新回到"不触发"，说明清的是累计量而不是别的东西。
  assert.deepEqual(types(bridge.handleSubmission(notification({ verdict: 'WA' }))), [])
})

test('verdict 分类函数覆盖全部错误码，AC 判定不误伤', () => {
  for (const verdict of ['WA', 'TLE', 'MLE', 'RE', 'CE', 'PE', 'OLE', 'wa', 'tle']) {
    assert.equal(isWrongVerdict(verdict), true, `${verdict} 应算错误`)
  }
  for (const verdict of ['AC', 'ac', 'PENDING', 'UNKNOWN', 'RUNNING', '']) {
    assert.equal(isWrongVerdict(verdict), false, `${verdict} 不该算错误`)
  }
  assert.equal(isAcVerdict('ac'), true)
  assert.equal(isAcVerdict('WA'), false)
  // PE/OLE 容易被漏进 AC 一侧（有些站点把 PE 当通过），这里钉住本项目的口径。
  assert.equal(isAcVerdict('PE'), false)
})

test('handleProblemDetected 不清空累计状态', () => {
  bridge.handleSubmission(notification({ verdict: 'WA' }))
  /*
   * 生产里这个回调在"切走再切回同一道题"时会被打一次。它必须是无副作用的：
   * 一旦顺手清空 problemState，用户切个 tab 回来就把"已经错了一次"忘了，
   * multiple_wrong 永远攒不到 2 次。
   */
  bridge.handleProblemDetected({
    platform: 'codeforces',
    platformProblemId: '1A',
    canonicalUrl: 'https://codeforces.com/problemset/problem/1/A',
    confidence: 'url',
  })
  const after = bridge.handleSubmission(notification({ verdict: 'WA' }))
  assert.ok(types(after).includes('multiple_wrong'), '题目识别回调不该清掉累计错误')
})
