import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type { AIContextExport } from '../../electron/ai/contextTypes.ts'
import type { ProblemDetail } from '../../electron/db/repositories/problem/types.ts'
import type { SubmissionRow } from '../../electron/db/repositories/submission/types.ts'
import type { CoachEvent, ProblemSession } from '../../electron/coach/types.ts'
import { ContextGatherer } from '../../electron/coach/llm/ContextGatherer.ts'
import { buildHintPrompt } from '../../electron/coach/llm/PromptBuilder.ts'

/**
 * ContextGatherer 是"数据库里的东西"到"外发请求体"之间唯一的一道闸门。
 *
 * 它读的两个仓库都是 `SELECT *`（见 submission/queries.ts:18 与 problem/queries.ts:37），
 * 拿到的是整行——含 raw_json、source_url、platform_submission_id 这些采集副产物。
 * 闸门靠 collect() 里那次显式 .map 只挑四个字段来把守。所以本文件的断言面刻意选在
 * `buildHintPrompt(ctx)` 拼出来的字符串上：把仓库替身喂满哨兵值，再确认外发文本里
 * 只剩允许的字段。断言 ctx 对象的形状是不够的——多带一个字段未必立刻可见，
 * 而多进一行 prompt 就是真的发出去了。
 */

const repo = vi.hoisted(() => ({
  submissionCalls: [] as string[],
  detailCalls: [] as string[],
  exportCalls: 0,
  submissions: [] as SubmissionRow[],
  detail: null as ProblemDetail | null,
  submissionError: null as Error | null,
  detailError: null as Error | null,
  exportError: null as Error | null,
  markdown: '# 学习数据上下文\n- 题目总数：42',
}))

vi.mock('../../electron/db/repositories/submissionRepository', () => ({
  getSubmissionsByProblemAsc: (problemId: string) => {
    repo.submissionCalls.push(problemId)
    if (repo.submissionError) throw repo.submissionError
    return repo.submissions
  },
}))

vi.mock('../../electron/db/repositories/problemRepository', () => ({
  getProblemDetail: (problemId: string) => {
    repo.detailCalls.push(problemId)
    if (repo.detailError) throw repo.detailError
    return repo.detail
  },
}))

// exportAIContext 真身要开数据库连接跑六条聚合查询；这里只关心"渲染结果整段透传"
// 与"抛错时降级为空串"，所以把导出+渲染这一对一起换掉。
vi.mock('../../electron/ai/contextExporter', () => ({
  exportAIContext: () => {
    repo.exportCalls += 1
    if (repo.exportError) throw repo.exportError
    return { schema_version: 1 } as AIContextExport
  },
  renderContextAsMarkdown: (_ctx: AIContextExport) => repo.markdown,
}))

/** 一整行提交记录，全部非白名单字段塞哨兵值。 */
function submissionRow(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: 'SENTINEL_ROW_ID',
    problem_id: 'problem-1',
    platform: 'codeforces',
    platform_submission_id: 'SENTINEL_SUBMISSION_ID',
    verdict: 'WA',
    raw_verdict: 'SENTINEL_RAW_VERDICT',
    language: 'C++17',
    submitted_at: '2026-08-31 10:00:00',
    runtime_ms: 15,
    memory_kb: 65536,
    source_url: 'https://codeforces.com/contest/1234/submission/999?sessionId=SENTINEL_SESSION_COOKIE',
    // `JSESSIONID=` 后面刻意只留 3 个字符：敏感文件守卫会拦"会话 cookie 名 = 12 位以上的值"，
    // 而它没法分辨真假 token——那个保守判定是对的，不该为测试放宽。泄漏探针改由后面的
    // SENTINEL_COOKIE_VALUE 承担，它不挨着 cookie 名，形状仍是"raw_json 里裹着 cookie"。
    raw_json: '{"cookie":"JSESSIONID=abc; auth=SENTINEL_COOKIE_VALUE","handle":"SENTINEL_HANDLE"}',
    created_at: '2026-08-31 10:00:01',
    updated_at: '2026-08-31 10:00:02',
    ...overrides,
  }
}

function problemDetail(overrides: Partial<ProblemDetail> = {}): ProblemDetail {
  return {
    id: 'problem-1',
    platform: 'codeforces',
    platform_problem_id: '1234A',
    canonical_url: 'https://codeforces.com/problemset/problem/1234/A',
    title: 'Watermelon',
    status: 'attempted',
    contest_id: '1234',
    problem_index: 'A',
    submission_count: 3,
    ac_count: 0,
    // getProblemDetail 会额外带回最多 100 条整行提交；gatherer 不读它，但它确实在返回值里。
    submissions: [{
      id: 'SENTINEL_DETAIL_SUB_ID',
      problem_id: 'problem-1',
      platform: 'codeforces',
      platform_submission_id: 'SENTINEL_DETAIL_SUBMISSION_ID',
      verdict: 'WA',
      submitted_at: '2026-08-31 10:00:00',
      raw_json: '{"cookie":"SENTINEL_DETAIL_COOKIE"}',
    }],
    ...overrides,
  }
}

function session(overrides: Partial<ProblemSession> = {}): ProblemSession {
  return {
    session_id: 'session-1',
    problem_id: 'problem-1',
    platform: 'codeforces',
    platform_problem_id: '1234A',
    started_at: 1_700_000_000_000,
    last_active_at: 1_700_000_600_000,
    active_seconds: 600,
    submit_count: 3,
    wrong_count: 2,
    current_status: 'active',
    phase: 'coding',
    detected_stuck_level: 0,
    verdict_history: ['WA', 'WA'],
    problem_rating: 1200,
    ...overrides,
  }
}

function event(overrides: Partial<CoachEvent> = {}): CoachEvent {
  return {
    event_id: 'event-1',
    session_id: 'session-1',
    event_type: 'multiple_wrong',
    severity: 'warn',
    score: 60,
    problem_id: 'problem-1',
    platform: 'codeforces',
    evidence: { verdict: 'WA' },
    created_at: '2026-08-31 10:20:00',
    ...overrides,
  }
}

/** 采到的上下文最终会变成外发文本，断言就打在这段文本上。 */
function outboundText(ctx: ReturnType<ContextGatherer['collect']>): string {
  return buildHintPrompt(ctx).map((message) => message.content).join('\n')
}

beforeEach(() => {
  repo.submissionCalls.length = 0
  repo.detailCalls.length = 0
  repo.exportCalls = 0
  repo.submissions = []
  repo.detail = null
  repo.submissionError = null
  repo.detailError = null
  repo.exportError = null
  repo.markdown = '# 学习数据上下文\n- 题目总数：42'
})

test('提交行只有 verdict/语言/耗时/时间进上下文，raw_json 与 source_url 不外发', () => {
  repo.detail = problemDetail()
  repo.submissions = [submissionRow()]

  const ctx = new ContextGatherer().collect(event(), session(), null, 3, false)
  const outbound = outboundText(ctx)

  // 正向锚点：这一行确实被采到并拼进了外发文本，说明闸门开着、下面的负向断言不是空转。
  assert.deepEqual(repo.submissionCalls, ['problem-1'], '应按 session.problem_id 查提交')
  assert.equal(ctx.submissions.length, 1)
  assert.match(outbound, /总提交次数: 1/)
  assert.match(outbound, /最近 verdict: WA/)
  assert.match(outbound, /语言: C\+\+17/)
  assert.match(outbound, /运行时间: 15ms/)

  // 负向：整行里的其余字段一个都不能出现。raw_json 是平台响应原文（可能含 Cookie/用户名），
  // source_url 带查询串（可能含 sessionId），platform_submission_id 是账号可关联标识。
  assert.doesNotMatch(outbound, /SENTINEL_ROW_ID/)
  assert.doesNotMatch(outbound, /SENTINEL_SUBMISSION_ID/)
  assert.doesNotMatch(outbound, /SENTINEL_RAW_VERDICT/)
  assert.doesNotMatch(outbound, /SENTINEL_SESSION_COOKIE/)
  assert.doesNotMatch(outbound, /SENTINEL_COOKIE_VALUE/)
  assert.doesNotMatch(outbound, /SENTINEL_HANDLE/)
  assert.doesNotMatch(outbound, /65536/, 'memory_kb 未纳入白名单')
})

test('题目详情只取 title 与 canonical_url，附带的 100 条提交整行不外发', () => {
  repo.detail = problemDetail()
  repo.submissions = []

  const ctx = new ContextGatherer().collect(event(), session(), null, 2, false)
  const outbound = outboundText(ctx)

  assert.deepEqual(repo.detailCalls, ['problem-1'])
  // 正向锚点：title 与 canonical_url 都从详情里取到了。
  assert.equal(ctx.problem.title, 'Watermelon')
  assert.match(outbound, /标题: Watermelon/)
  assert.match(outbound, /链接: https:\/\/codeforces\.com\/problemset\/problem\/1234\/A/)

  assert.doesNotMatch(outbound, /SENTINEL_DETAIL_COOKIE/)
  assert.doesNotMatch(outbound, /SENTINEL_DETAIL_SUBMISSION_ID/)
  assert.doesNotMatch(outbound, /SENTINEL_DETAIL_SUB_ID/)
  // problems 表的内部主键与状态列同样不该外发：它们只对本机有意义。
  assert.doesNotMatch(outbound, /problem-1/)
  assert.doesNotMatch(outbound, /attempted/)
})

test('会话对象里的内部字段不外发，只发分钟级摘要与阶段', () => {
  repo.detail = problemDetail()

  const ctx = new ContextGatherer().collect(
    event(),
    session({ session_id: 'SENTINEL_SESSION_ID', active_seconds: 600, problem_rating: 1337 }),
    null,
    2,
    false,
  )
  const outbound = outboundText(ctx)

  // 正向锚点：会话段真的拼出来了。
  assert.match(outbound, /已尝试时长: 10 分钟/)
  assert.match(outbound, /当前阶段: coding/)
  assert.doesNotMatch(outbound, /SENTINEL_SESSION_ID/)
  assert.doesNotMatch(outbound, /1337/, '题目 rating 属于本地自适应参数，不进外发上下文')
  assert.doesNotMatch(outbound, /1700000/, '绝对时间戳不外发')
})

test('attempt_duration 与 active_seconds 都取 session.active_seconds', () => {
  repo.detail = problemDetail()

  const ctx = new ContextGatherer().collect(event(), session({ active_seconds: 754 }), null, 1, false)

  // 当前实现刻意用有效活跃秒数当"已尝试时长"，而不是 last_active_at - started_at：
  // 挂起时段（切到本地 IDE）不该算进卡壳判断。两个字段同源是这个决定的直接后果。
  assert.equal(ctx.session.attempt_duration_sec, 754)
  assert.equal(ctx.session.active_seconds, 754)
})

test('卡壳状态由 phase 与 detected_stuck_level 推导', () => {
  repo.detail = problemDetail()
  const gatherer = new ContextGatherer()

  // reading 阶段优先：读题期即使 stuck_level 已经抬起来也报 reading，避免刚打开就被判卡壳。
  assert.equal(
    gatherer.collect(event(), session({ phase: 'reading', detected_stuck_level: 3 }), null, 1, false)
      .session.detected_stuck_level,
    'reading',
  )
  assert.equal(
    gatherer.collect(event(), session({ phase: 'coding', detected_stuck_level: 1 }), null, 1, false)
      .session.detected_stuck_level,
    'stuck',
  )
  assert.equal(
    gatherer.collect(event(), session({ phase: 'coding', detected_stuck_level: 0 }), null, 1, false)
      .session.detected_stuck_level,
    'coding',
  )
  // stuck 阶段但等级为 0：按 level 判定，落回 coding。
  assert.equal(
    gatherer.collect(event(), session({ phase: 'stuck', detected_stuck_level: 0 }), null, 1, false)
      .session.detected_stuck_level,
    'coding',
  )
})

test('只保留最近 10 条提交，且保持升序', () => {
  repo.detail = problemDetail()
  repo.submissions = Array.from({ length: 14 }, (_value, index) => submissionRow({
    verdict: `V${index}`,
    submitted_at: `2026-08-31 10:${String(index).padStart(2, '0')}:00`,
  }))

  const ctx = new ContextGatherer().collect(event(), session(), null, 3, false)

  assert.equal(ctx.submissions.length, 10, '上下文体积必须有上限，否则长会话会把 token 打满')
  assert.deepEqual(ctx.submissions.map((item) => item.verdict), ['V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13'])
  // 取尾部而非头部：模型要看的是"最近在犯什么错"。
  assert.match(outboundText(ctx), /最近 verdict 序列: V9 → V10 → V11 → V12 → V13/)
})

test('题目未落库（problem_id 为 null）时不查库，标题退化为平台题号', () => {
  const ctx = new ContextGatherer().collect(
    event(),
    session({ problem_id: null, platform_problem_id: 'P1001', platform: 'luogu' }),
    null,
    1,
    false,
  )

  // 没有内部 id 时两个仓库都不能调用：拿 null 当主键查询要么抛错要么全表扫。
  assert.deepEqual(repo.detailCalls, [])
  assert.deepEqual(repo.submissionCalls, [])
  assert.equal(ctx.problem.title, 'P1001', '标题退化为平台题号，保证 prompt 仍可读')
  assert.deepEqual(ctx.submissions, [])
  assert.match(outboundText(ctx), /标题: P1001/)
})

test('提交查询抛错时静默降级为空列表，其余上下文照常', () => {
  repo.detail = problemDetail()
  repo.submissionError = new Error('database is locked')

  const ctx = new ContextGatherer().collect(event(), session(), null, 3, false)
  const outbound = outboundText(ctx)

  assert.deepEqual(ctx.submissions, [])
  // 正向锚点：提交查询挂掉不能把整次采集带走，题目段与画像段必须还在。
  assert.match(outbound, /标题: Watermelon/)
  assert.match(outbound, /题目总数：42/)
  assert.doesNotMatch(outbound, /database is locked/, '异常文本不能顺着上下文外发')
})

test('画像导出抛错时降级为空串，prompt 里不留空的 learner_profile 段', () => {
  repo.detail = problemDetail()
  repo.exportError = new Error('no such table: ai_context_snapshots')

  const ctx = new ContextGatherer().collect(event(), session(), null, 3, false)
  const outbound = outboundText(ctx)

  assert.equal(ctx.learner_profile_md, '')
  // 正向锚点：画像失败不影响其余采集。
  assert.match(outbound, /标题: Watermelon/)
  assert.doesNotMatch(outbound, /learner_profile/)
  assert.doesNotMatch(outbound, /no such table/, '数据库错误文本不能外发')
})

test('画像 Markdown 整段透传进 learner_profile 标签', () => {
  repo.detail = problemDetail()
  repo.markdown = '# 学习数据上下文\n## 错题（2）\n- [codeforces 1234A] Watermelon — 错误 3 次'

  const ctx = new ContextGatherer().collect(event(), session(), null, 4, false)

  assert.equal(repo.exportCalls, 1, '每次采集只导出一次画像')
  assert.match(outboundText(ctx), /<learner_profile>\n# 学习数据上下文\n## 错题（2）[\s\S]*<\/learner_profile>/)
})

test('没有打开题目（session 为 null）时给出可对话的空上下文，且仍带画像', () => {
  const ctx = new ContextGatherer().collect(
    event({ evidence: { verdict: 'TLE' } }),
    null,
    null,
    2,
    true,
    'https://codeforces.com/problemset',
  )

  // 不查库：没有会话就没有 problem_id。
  assert.deepEqual(repo.detailCalls, [])
  assert.deepEqual(repo.submissionCalls, [])
  assert.equal(ctx.problem.platform, '', '空串而非 null：PromptBuilder 的聊天分支按真值判空')
  assert.equal(ctx.problem.title, '')
  assert.equal(ctx.problem.url, 'https://codeforces.com/problemset', '当前页 URL 仍透传')
  assert.equal(ctx.session.phase, 'idle')
  assert.equal(ctx.session.detected_stuck_level, 'reading')
  assert.deepEqual(ctx.submissions, [])
  // 画像仍要采：用户没开题目也能问"我该刷什么"。
  assert.equal(ctx.learner_profile_md, '# 学习数据上下文\n- 题目总数：42')
  assert.equal(ctx.hint_request.target_level, 2)
  assert.equal(ctx.hint_request.user_explicit_ask, true)
  assert.equal(ctx.hint_request.verdict, 'TLE')
})

test('事件 evidence 里只有 verdict 进上下文，其余证据字段留在本机', () => {
  repo.detail = problemDetail()

  const ctx = new ContextGatherer().collect(
    event({
      evidence: {
        verdict: 'TLE',
        contest_id: 'SENTINEL_CONTEST',
        source_url: 'https://codeforces.com/contest/1?token=SENTINEL_EVENT_TOKEN',
        problem_rating: 2100,
      },
    }),
    session(),
    null,
    4,
    false,
  )
  const outbound = outboundText(ctx)

  // 正向锚点：verdict 这一个白名单字段确实透传并拼进了外发文本。
  assert.equal(ctx.hint_request.verdict, 'TLE')
  assert.match(outbound, /触发 verdict: TLE/)
  // evidence 是 `[key: string]: unknown` 的自由结构（coach/types.ts:159），
  // 整体透传就等于把未来任何新增证据字段自动外发。当前实现只挑 verdict。
  assert.doesNotMatch(outbound, /SENTINEL_CONTEST/)
  assert.doesNotMatch(outbound, /SENTINEL_EVENT_TOKEN/)
  assert.doesNotMatch(outbound, /2100/)
})

test('problemUrl 优先于 canonical_url，缺省时回落到落库链接', () => {
  repo.detail = problemDetail({ canonical_url: 'https://codeforces.com/problemset/problem/1234/A' })

  const withLive = new ContextGatherer().collect(
    event(), session(), null, 1, false,
    'https://codeforces.com/contest/1234/problem/A',
  )
  // 当前页 URL 更准（比赛页/gym 页与 canonical 不同）。
  assert.equal(withLive.problem.url, 'https://codeforces.com/contest/1234/problem/A')

  const withoutLive = new ContextGatherer().collect(event(), session(), null, 1, false)
  assert.equal(withoutLive.problem.url, 'https://codeforces.com/problemset/problem/1234/A')

  const noDetail = (() => {
    repo.detail = null
    return new ContextGatherer().collect(event(), session(), null, 1, false)
  })()
  assert.equal(noDetail.problem.url, null, '两处都没有时给 null，PromptBuilder 会整行省略')
  assert.doesNotMatch(outboundText(noDetail), /链接:/)
})

test('约束对象原样带入，用于 L3 复杂度提示', () => {
  repo.detail = problemDetail()

  const ctx = new ContextGatherer().collect(event(), session(), {
    platform: 'codeforces',
    primaryVarName: 'n',
    nLower: 1,
    nUpper: 200000,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: 1,
    memoryLimitMb: 256,
    testGroupCount: null,
    parsedAt: 1_700_000_000_000,
    source: 'regex',
  }, 3, false)

  assert.equal(ctx.problem.constraints?.nUpper, 200000)
  const outbound = outboundText(ctx)
  assert.match(outbound, /数据范围: n ∈ \[1, 200000\]/)
  assert.match(outbound, /时间限制: 1s/)
  // parsedAt 是本机时钟读数，属于解析元数据而不是题目事实，不该外发。
  assert.doesNotMatch(outbound, /1700000000000/)
  assert.doesNotMatch(outbound, /regex/)
})
