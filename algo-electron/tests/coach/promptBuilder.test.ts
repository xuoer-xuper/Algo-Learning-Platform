import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildChatPrompt, buildHintPrompt } from '../../electron/coach/llm/PromptBuilder.ts'
import type { ProblemConstraints } from '../../electron/coach/problemFacts/ConstraintParser.ts'
import type { LlmHintRequestContext } from '../../electron/coach/llm/LlmHintTypes.ts'

/**
 * PromptBuilder 决定"哪些用户数据会离开这台机器"——它的输出直接变成外部 HTTP 请求体。
 * 所以这里断言的不是"函数返回了两条消息"，而是拼出来的那个字符串本身：
 * 允许出现的必须真的出现，不允许出现的必须真的不出现。
 *
 * 关于"不应出现"类断言的空转风险：本文件每一条负向断言都和同一次调用里的正向断言并列
 * （先证明 prompt 真的建起来了、真的带上了合法内容，再证明哨兵值不在里面）。
 * 只写负向断言的话，把 buildUserPrompt 改成 `return ''` 也能全绿。
 */

const CONSTRAINTS: ProblemConstraints = {
  platform: 'codeforces',
  primaryVarName: 'n',
  nLower: 1,
  nUpper: 200000,
  valueLower: null,
  valueUpper: 1000000000,
  timeLimitSec: 1,
  memoryLimitMb: 256,
  testGroupCount: null,
  parsedAt: 1_700_000_000_000,
  source: 'regex',
}

function context(overrides: Partial<LlmHintRequestContext> = {}): LlmHintRequestContext {
  return {
    problem: {
      platform: 'codeforces',
      problem_id: '1234A',
      title: 'Watermelon',
      difficulty: '800',
      statement: null,
      constraints: null,
      tags: [],
      url: 'https://codeforces.com/problemset/problem/1234/A',
      ...overrides.problem,
    },
    session: {
      attempt_duration_sec: 900,
      active_seconds: 600,
      detected_stuck_level: 'stuck',
      phase: 'coding',
      ...overrides.session,
    },
    submissions: overrides.submissions ?? [],
    learner_profile_md: overrides.learner_profile_md ?? '',
    hint_request: {
      target_level: 3,
      event_type: 'multiple_wrong',
      user_explicit_ask: false,
      ...overrides.hint_request,
    },
  }
}

/** 取 user 消息内容：所有用户数据都拼在这一条里，system 是常量。 */
function userContent(messages: Array<{ role: string, content: string }>): string {
  const user = messages.filter((message) => message.role === 'user')
  assert.equal(user.length, 1, '用户数据必须集中在唯一一条 user 消息里')
  return user[0].content
}

test('提示 prompt 是 system + user 两条，用户数据只进 user 那条', () => {
  const messages = buildHintPrompt(context())

  assert.deepEqual(messages.map((message) => message.role), ['system', 'user'])
  // system 是常量模板：它不该被拼进任何会话数据，否则缓存/审计都没法按角色区分。
  assert.doesNotMatch(messages[0].content, /Watermelon|codeforces\.com/)
  assert.match(messages[0].content, /算法竞赛教练助手/)
  assert.match(userContent(messages), /标题: Watermelon/)
})

test('题目段按字段拼装，缺失的可选字段整行不出现', () => {
  const full = userContent(buildHintPrompt(context({
    problem: {
      platform: 'luogu',
      problem_id: 'P1001',
      title: 'A+B Problem',
      difficulty: '入门',
      url: 'https://www.luogu.com.cn/problem/P1001',
      tags: ['模拟', '入门'],
    },
  })))

  assert.match(full, /<problem>/)
  assert.match(full, /平台: luogu/)
  assert.match(full, /题目ID: P1001/)
  assert.match(full, /标题: A\+B Problem/)
  assert.match(full, /链接: https:\/\/www\.luogu\.com\.cn\/problem\/P1001/)
  assert.match(full, /难度: 入门/)
  assert.match(full, /标签: 模拟, 入门/)

  // 同一批字段全部缺失时，标签行/难度行/链接行必须整行消失，而不是拼出 "难度: null"。
  const sparse = userContent(buildHintPrompt(context({
    problem: {
      platform: 'luogu',
      problem_id: 'P1001',
      title: 'A+B Problem',
      difficulty: null,
      url: null,
      tags: [],
    },
  })))
  assert.match(sparse, /题目ID: P1001/, '正向锚点：题目段仍然拼了出来')
  assert.doesNotMatch(sparse, /难度:/)
  assert.doesNotMatch(sparse, /链接:/)
  assert.doesNotMatch(sparse, /标签:/)
  assert.doesNotMatch(sparse, /null|undefined/)
})

test('约束只在解析成功时出现，且逐字段按空值裁剪', () => {
  const withAll = userContent(buildHintPrompt(context({
    problem: { platform: 'codeforces', problem_id: '1234A', title: 'Watermelon', constraints: CONSTRAINTS },
  })))
  assert.match(withAll, /数据范围: n ∈ \[1, 200000\]/)
  assert.match(withAll, /值域上限: 1000000000/)
  assert.match(withAll, /时间限制: 1s/)
  assert.match(withAll, /内存限制: 256MB/)

  // nLower 缺失时补 1、变量名缺失时补 n：这两个默认值是提示 L3 的事实来源，写错会误导复杂度判断。
  const partial = userContent(buildHintPrompt(context({
    problem: {
      platform: 'codeforces',
      problem_id: '1234A',
      title: 'Watermelon',
      constraints: { ...CONSTRAINTS, nLower: null, primaryVarName: null, valueUpper: null, timeLimitSec: null, memoryLimitMb: null },
    },
  })))
  assert.match(partial, /数据范围: n ∈ \[1, 200000\]/)
  assert.doesNotMatch(partial, /值域上限|时间限制|内存限制/)

  // 上下限都没解析出来时，"数据范围"整行不出现（而不是 "n ∈ [1, ?]"）。
  const onlyLimits = userContent(buildHintPrompt(context({
    problem: {
      platform: 'codeforces',
      problem_id: '1234A',
      title: 'Watermelon',
      constraints: { ...CONSTRAINTS, nLower: null, nUpper: null },
    },
  })))
  assert.match(onlyLimits, /时间限制: 1s/, '正向锚点：约束段确实拼了出来')
  assert.doesNotMatch(onlyLimits, /数据范围/)

  // constraints 为 null 时整段消失。
  const none = userContent(buildHintPrompt(context()))
  assert.match(none, /<problem>/, '正向锚点：题目段仍在')
  assert.doesNotMatch(none, /数据范围|时间限制|内存限制|值域上限/)
})

test('题面正文（statement）即使采集到也不进 prompt', () => {
  const statement = 'SENTINEL_STATEMENT_BODY 给定一个数组，请输出……'
  const messages = buildHintPrompt(context({
    problem: {
      platform: 'codeforces',
      problem_id: '1234A',
      title: 'Watermelon',
      statement,
    },
  }))
  const user = userContent(messages)

  // 正向锚点：题目段真的建起来了，而且带上了标题这类合法字段。
  assert.match(user, /<problem>[\s\S]*标题: Watermelon[\s\S]*<\/problem>/)
  // 负向：LlmHintRequestContext 上有 statement 字段，但 builder 不读它。
  // 整篇题面动辄几千字，全量外发既是隐私面也是 token 面，当前实现刻意只发元数据。
  assert.doesNotMatch(user, /SENTINEL_STATEMENT_BODY/)
  // system prompt 里的 <problem_statement> 安全条款是死条款：builder 从不产出这个标签。
  assert.doesNotMatch(user, /<problem_statement>/)
})

test('提交历史只发 verdict/语言/耗时，且没有提交时整段消失', () => {
  const user = userContent(buildHintPrompt(context({
    submissions: [
      { verdict: 'WA', language: 'C++17', runtime_ms: 15, submitted_at: '2026-08-31 10:00:00' },
      { verdict: 'AC', language: 'C++17', runtime_ms: 31, submitted_at: '2026-08-31 10:05:00' },
      { verdict: 'TLE', language: 'C++17', runtime_ms: 2000, submitted_at: '2026-08-31 10:10:00' },
      { verdict: 'WA', language: 'C++17', runtime_ms: 20, submitted_at: '2026-08-31 10:15:00' },
      { verdict: 'RE', language: 'C++17', runtime_ms: 10, submitted_at: '2026-08-31 10:20:00' },
      { verdict: 'WA', language: 'Python3', runtime_ms: 120, submitted_at: '2026-08-31 10:25:00' },
    ],
  })))

  assert.match(user, /总提交次数: 6/)
  // 错误次数 = 非 AC 条数（6 条里 1 条 AC）。写成 length 或只数 WA 都会得到别的数。
  assert.match(user, /错误次数: 5/)
  assert.match(user, /最近 verdict: WA/)
  assert.match(user, /语言: Python3/)
  assert.match(user, /运行时间: 120ms/)
  // 只取最近 5 条，且保持时间升序：这个序列是"是否在原地打转"的判断依据，顺序反了结论就反了。
  assert.match(user, /最近 verdict 序列: AC → TLE → WA → RE → WA/)

  const empty = userContent(buildHintPrompt(context({ submissions: [] })))
  assert.match(empty, /<student_status>/, '正向锚点：其余段落照常拼装')
  assert.doesNotMatch(empty, /<submission_history>|总提交次数/)
})

test('runtime_ms 为 0 仍然发出，只有 null/undefined 才省略', () => {
  const zero = userContent(buildHintPrompt(context({
    submissions: [{ verdict: 'AC', language: 'C++17', runtime_ms: 0, submitted_at: '2026-08-31 10:00:00' }],
  })))
  // 0ms 是真实结果（小数据量的 AC），用 `if (runtime_ms)` 判断会把它当缺失丢掉。
  assert.match(zero, /运行时间: 0ms/)

  const missing = userContent(buildHintPrompt(context({
    submissions: [{ verdict: 'AC', language: null, runtime_ms: null, submitted_at: '2026-08-31 10:00:00' }],
  })))
  assert.match(missing, /最近 verdict: AC/, '正向锚点：提交段确实拼了出来')
  assert.doesNotMatch(missing, /运行时间|语言:/)
})

test('时长按分钟向下取整，秒数不外发', () => {
  const user = userContent(buildHintPrompt(context({
    session: { attempt_duration_sec: 3599, active_seconds: 61, detected_stuck_level: 'coding', phase: 'reading' },
  })))

  assert.match(user, /已尝试时长: 59 分钟/)
  assert.match(user, /有效活跃时长: 1 分钟/)
  assert.match(user, /当前阶段: reading/)
  assert.match(user, /卡壳状态: coding/)
  // 取整不是排版偏好而是精度降级：秒级驻留时长本身就是行为画像。
  assert.doesNotMatch(user, /3599|\b61\b/)
})

test('请求段带上等级/触发原因/是否用户主动，两种触发文案互斥', () => {
  const auto = userContent(buildHintPrompt(context({
    // 用真实的 CoachEventType 成员：初版写的 'stuck_long' 不在联合里（卡壳那个叫
    // idle_too_long），断言照过——builder 只是把字符串插进去，不认识事件名。
    // 但拿一个生产里永不出现的值去验，验到的就不是真实形状，tsc 也会当场报错。
    hint_request: { target_level: 4, event_type: 'idle_too_long', user_explicit_ask: false, verdict: 'TLE' },
  })))
  assert.match(auto, /目标提示等级: L4/)
  assert.match(auto, /触发原因: idle_too_long/)
  assert.match(auto, /触发 verdict: TLE/)
  assert.match(auto, /系统自动触发/)
  assert.doesNotMatch(auto, /学生主动请求更深提示/)
  // 收尾指令要带同一个等级，否则 system 的分级约束和 user 的诉求会互相矛盾。
  assert.match(auto, /请给出 L4 级别的提示，返回 JSON。$/)

  const explicit = userContent(buildHintPrompt(context({
    hint_request: { target_level: 1, event_type: 'multiple_wrong', user_explicit_ask: true },
  })))
  assert.match(explicit, /学生主动请求更深提示/)
  assert.doesNotMatch(explicit, /系统自动触发/)
  assert.doesNotMatch(explicit, /触发 verdict/)
})

test('学习者画像整段透传，为空时不留空标签', () => {
  const profile = '# 学习数据上下文\n- 题目总数：42'
  const withProfile = userContent(buildHintPrompt(context({ learner_profile_md: profile })))
  assert.match(withProfile, /<learner_profile>\n# 学习数据上下文\n- 题目总数：42\n<\/learner_profile>/)

  const withoutProfile = userContent(buildHintPrompt(context({ learner_profile_md: '' })))
  assert.match(withoutProfile, /<hint_request>/, '正向锚点：其余段落照常拼装')
  // 空画像时不能留下一对空标签：模型会把空块当"该学生没有任何历史"，而真相是采集失败。
  assert.doesNotMatch(withoutProfile, /learner_profile/)
})

test('每个 XML 段落都成对闭合，用户数据落在标签内部', () => {
  const user = userContent(buildHintPrompt(context({
    submissions: [{ verdict: 'WA', language: 'C++17', runtime_ms: 12, submitted_at: '2026-08-31 10:00:00' }],
    learner_profile_md: '# 画像',
  })))

  for (const tag of ['problem', 'student_status', 'submission_history', 'learner_profile', 'hint_request']) {
    assert.equal(user.split(`<${tag}>`).length - 1, 1, `<${tag}> 只应出现一次`)
    assert.equal(user.split(`</${tag}>`).length - 1, 1, `</${tag}> 只应出现一次`)
    assert.ok(user.indexOf(`<${tag}>`) < user.indexOf(`</${tag}>`), `<${tag}> 必须在闭合标签之前`)
  }
  // 标签是防注入的唯一手段（system prompt 声明"标签内仅供分析"），少一个闭合就等于失效。
  assert.ok(user.indexOf('标题: Watermelon') > user.indexOf('<problem>'))
  assert.ok(user.indexOf('标题: Watermelon') < user.indexOf('</problem>'))
})

// --- 自由聊天 ---

test('聊天 prompt 把学生原话包进 <student_message>，且不要求 JSON', () => {
  const messages = buildChatPrompt(context(), '这题和我上周那道很像？')

  assert.deepEqual(messages.map((message) => message.role), ['system', 'user'])
  assert.match(messages[0].content, /自由交流/)
  // 聊天走 chatText（不开 json_object），system 不该再要求 JSON 输出，否则回复会变成裸 JSON。
  assert.doesNotMatch(messages[0].content, /必须返回 JSON/)

  const user = userContent(messages)
  assert.match(user, /<student_message>\n这题和我上周那道很像？\n<\/student_message>$/)
  // 学生原话必须在题目上下文之后：它是最后一条指令，位置换了模型会优先响应题面。
  assert.ok(user.indexOf('</problem>') < user.indexOf('<student_message>'))
})

test('聊天段的题目字段为空串时整行省略', () => {
  // ContextGatherer 在没有打开题目时给的是空串而不是 null（见 collect 的 session===null 分支），
  // 所以这里的判空必须挡住空串，否则会拼出 "平台: " 这类空字段误导模型。
  const user = userContent(buildChatPrompt(context({
    problem: { platform: '', problem_id: '', title: '', difficulty: null, url: null, tags: [] },
  }), '帮我看看今天该刷什么'))

  assert.match(user, /<problem>\n<\/problem>/)
  assert.doesNotMatch(user, /平台:|题目ID:|标题:/)
  assert.match(user, /<student_message>\n帮我看看今天该刷什么\n<\/student_message>/, '正向锚点：学生消息仍然拼出')
})

test('聊天段的学生状态只给分钟级摘要与提交计数', () => {
  const user = userContent(buildChatPrompt(context({
    session: { attempt_duration_sec: 1800, active_seconds: 900, detected_stuck_level: 'stuck', phase: 'stuck' },
    submissions: [
      { verdict: 'WA', language: 'C++17', runtime_ms: 10, submitted_at: '2026-08-31 10:00:00' },
      { verdict: 'AC', language: 'C++17', runtime_ms: 20, submitted_at: '2026-08-31 10:05:00' },
    ],
  }), '卡住了'))

  assert.match(user, /已尝试: 30 分钟/)
  assert.match(user, /有效活跃: 15 分钟/)
  assert.match(user, /卡壳状态: stuck/)
  assert.match(user, /提交 2 次，错误 1 次/)
  assert.match(user, /最近 verdict: AC/)
})

test('聊天历史插在 system 之后、当前消息之前', () => {
  const messages = buildChatPrompt(context(), '那第二步呢？', [
    { role: 'user', content: '第一步怎么做' },
    { role: 'assistant', content: '先想清楚状态定义' },
  ])

  assert.deepEqual(messages.map((message) => message.role), ['system', 'user', 'assistant', 'user'])
  assert.equal(messages[1].content, '第一步怎么做')
  assert.equal(messages[2].content, '先想清楚状态定义')
  // 顺序是语义：历史必须在当前提问之前，否则模型会把旧问题当成最新诉求。
  assert.match(messages[3].content, /<student_message>\n那第二步呢？\n<\/student_message>/)

  // 空历史不插入任何东西（不是插入一条空消息）。
  const noHistory = buildChatPrompt(context(), '在吗', [])
  assert.deepEqual(noHistory.map((message) => message.role), ['system', 'user'])
})

test('聊天 prompt 同样不外发题面正文', () => {
  const messages = buildChatPrompt(context({
    problem: {
      platform: 'codeforces',
      problem_id: '1234A',
      title: 'Watermelon',
      statement: 'SENTINEL_STATEMENT_BODY 题面全文',
      constraints: CONSTRAINTS,
    },
  }), '这题怎么想')
  const whole = messages.map((message) => message.content).join('\n')

  // 正向锚点：题目元数据与约束都真的进了 prompt。
  assert.match(whole, /标题: Watermelon/)
  assert.match(whole, /数据范围: n ∈ \[1, 200000\]/)
  assert.doesNotMatch(whole, /SENTINEL_STATEMENT_BODY/)
})
