import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import type { AppConfig } from '../../electron/app/config.ts'
import type { CoachEvent, ProblemSession } from '../../electron/coach/types.ts'
import { LlmHintService } from '../../electron/coach/llm/LlmHintService.ts'

/**
 * LlmHintService 是这条链路上唯一同时看得见"明文 API Key"和"外发消息体"的地方。
 *
 * 替身只换两处：`openai`（唯一真出网的依赖）和 `app/config` 的读写（避免落盘）。
 * ArkClient / LlmConfigStore / ContextGatherer / PromptBuilder 全部用真身跑，
 * 这样"Key 从 safeStorage 解出来 → 只进 SDK 构造参数 → 不进 messages"是被真实代码走出来的，
 * 而不是被替身假设出来的。
 *
 * 空转防护：每条"Key/Cookie 不该出现"的断言都紧跟一条同次调用的正向断言
 * （SDK 确实收到了这把 Key、messages 确实带上了题目内容），
 * 所以断言不可能因为"请求没发出去"或"prompt 是空的"而白过。
 */

const API_KEY = 'ark-SENTINEL-APIKEY-0123456789'

const sdk = vi.hoisted(() => ({
  constructorOptions: [] as Array<{ apiKey?: string, baseURL?: string, timeout?: number, maxRetries?: number }>,
  requests: [] as Array<{ model?: string, messages?: Array<{ role: string, content: string }> }>,
  reply: '' as string,
  error: null as Error | null,
  usage: { prompt_tokens: 100, completion_tokens: 20 },
  responseModel: 'doubao-served',
}))

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    readonly chat = {
      completions: {
        create: async (request: { model?: string, messages?: Array<{ role: string, content: string }> }) => {
          sdk.requests.push(request)
          if (sdk.error) throw sdk.error
          return {
            choices: [{ message: { content: sdk.reply } }],
            model: sdk.responseModel,
            usage: sdk.usage,
          }
        },
      },
    }

    constructor(options: { apiKey?: string, baseURL?: string, timeout?: number, maxRetries?: number }) {
      sdk.constructorOptions.push(options)
    }
  },
}))

// config.json 的真身要 app.getPath('userData') 并写盘；这里用内存配置，
// 但保留 LlmConfigStore 真实的 safeStorage 加解密路径（electronMock 的 safeStorage 走 Buffer 往返）。
const store = vi.hoisted(() => ({
  encryptedApiKey: '' as string,
  enabled: true,
  model: 'doubao-seed-1-6-flash-250715',
  baseUrl: 'https://ark.test.invalid/api/v3',
  saved: [] as unknown[],
}))

// 替身是有状态的：保存要真的改变后续 load() 的结果，否则"保存后立刻生效"这类断言
// 会因为读到的永远是旧值而失去杀伤力。
vi.mock('../../electron/app/config', () => ({
  loadCoachConfig: () => ({
    enabled: true,
    sound: true,
    bubbleFrequency: 'medium' as const,
    position: null,
    scale: 1,
    opacity: 1,
    llm: {
      encrypted_api_key: store.encryptedApiKey,
      base_url: store.baseUrl,
      model: store.model,
      enabled: store.enabled,
    },
  }),
  saveCoachConfig: (partial: Partial<AppConfig['coach']>) => {
    store.saved.push(partial)
    const llm = (partial as { llm?: Record<string, unknown> }).llm
    if (!llm) return
    if (typeof llm.encrypted_api_key === 'string') store.encryptedApiKey = llm.encrypted_api_key
    if (typeof llm.base_url === 'string') store.baseUrl = llm.base_url
    if (typeof llm.model === 'string') store.model = llm.model
    if (typeof llm.enabled === 'boolean') store.enabled = llm.enabled
  },
}))

const repo = vi.hoisted(() => ({
  markdown: '# 学习数据上下文\n- 题目总数：42',
}))

vi.mock('../../electron/db/repositories/submissionRepository', () => ({
  getSubmissionsByProblemAsc: () => [{
    id: 'row-1',
    problem_id: 'problem-1',
    platform: 'codeforces',
    platform_submission_id: 'SENTINEL_SUBMISSION_ID',
    verdict: 'WA',
    raw_verdict: null,
    language: 'C++17',
    submitted_at: '2026-08-31 10:00:00',
    runtime_ms: 15,
    memory_kb: 65536,
    source_url: 'https://codeforces.com/contest/1/submission/9?sessionId=SENTINEL_SESSION_COOKIE',
    // 同 contextGatherer.test.ts：cookie 名后只留 3 个字符，避开敏感文件守卫的
    // "会话 cookie = 12 位以上值"判定，泄漏探针交给不挨着 cookie 名的 SENTINEL_COOKIE_VALUE。
    raw_json: '{"cookie":"JSESSIONID=abc; auth=SENTINEL_COOKIE_VALUE"}',
    created_at: '2026-08-31 10:00:00',
    updated_at: '2026-08-31 10:00:00',
  }],
}))

vi.mock('../../electron/db/repositories/problemRepository', () => ({
  getProblemDetail: () => ({
    id: 'problem-1',
    platform: 'codeforces',
    platform_problem_id: '1234A',
    canonical_url: 'https://codeforces.com/problemset/problem/1234/A',
    title: 'Watermelon',
    status: 'attempted',
    contest_id: '1234',
    problem_index: 'A',
    submission_count: 1,
    ac_count: 0,
    submissions: [],
  }),
}))

vi.mock('../../electron/ai/contextExporter', () => ({
  exportAIContext: () => ({ schema_version: 1 }),
  renderContextAsMarkdown: () => repo.markdown,
}))

const logs = vi.hoisted(() => ({ entries: [] as Array<{ message: string, data: unknown[] }> }))

vi.mock('../../electron/shared/logger', () => ({
  appLogger: {
    debug: () => {},
    info: () => {},
    warn: (message: string, ...data: unknown[]) => { logs.entries.push({ message, data }) },
    error: () => {},
    fatal: () => {},
    getLogFilePath: () => null,
  },
}))

const HINT_JSON = JSON.stringify({
  message: '注意 n 的上界，先估复杂度。',
  hint_type: 'complexity',
  related_tags: ['二分'],
  confidence: 0.8,
  reveals_solution: false,
})

function session(overrides: Partial<ProblemSession> = {}): ProblemSession {
  return {
    session_id: 'session-1',
    problem_id: 'problem-1',
    platform: 'codeforces',
    platform_problem_id: '1234A',
    started_at: 1_700_000_000_000,
    last_active_at: 1_700_000_600_000,
    active_seconds: 600,
    submit_count: 1,
    wrong_count: 1,
    current_status: 'active',
    phase: 'coding',
    detected_stuck_level: 1,
    verdict_history: ['WA'],
    problem_rating: 1200,
    ...overrides,
  }
}

function event(): CoachEvent {
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
  }
}

function hintParams(overrides: Record<string, unknown> = {}) {
  return {
    event: event(),
    session: session(),
    constraints: null,
    targetLevel: 3 as const,
    userExplicitAsk: false,
    ...overrides,
  }
}

/** electronMock 的 safeStorage 加密就是 Buffer 往返，所以密文 = base64(明文)。 */
function encrypted(key: string): string {
  return Buffer.from(key, 'utf8').toString('base64')
}

/** 已启用、已配 Key 的服务。 */
function readyService(): LlmHintService {
  store.encryptedApiKey = encrypted(API_KEY)
  store.enabled = true
  const service = new LlmHintService()
  service.init()
  return service
}

/** 最后一次请求里所有 message 的拼接文本——就是真正外发的那段内容。 */
function lastOutboundText(): string {
  const request = sdk.requests[sdk.requests.length - 1]
  assert.ok(request?.messages && request.messages.length > 0, '必须已经发出过一次带消息的请求')
  return request.messages.map((message) => message.content).join('\n')
}

beforeEach(() => {
  sdk.constructorOptions.length = 0
  sdk.requests.length = 0
  sdk.reply = HINT_JSON
  sdk.error = null
  sdk.usage = { prompt_tokens: 100, completion_tokens: 20 }
  sdk.responseModel = 'doubao-served'
  store.encryptedApiKey = ''
  store.enabled = true
  store.saved.length = 0
  logs.entries.length = 0
  repo.markdown = '# 学习数据上下文\n- 题目总数：42'
  vi.useRealTimers()
})

test('API Key 只走 SDK 构造参数，不进任何一条外发消息', async () => {
  const service = readyService()
  const result = await service.generateHint(hintParams())

  // 正向锚点 1：Key 真的从加密配置里解出来了，并且确实交给了 SDK 的认证通道。
  assert.equal(sdk.constructorOptions[0]?.apiKey, API_KEY)
  assert.equal(sdk.constructorOptions[0]?.baseURL, 'https://ark.test.invalid/api/v3')
  // 正向锚点 2：请求真的发出去了，而且 prompt 真的带上了合法内容。
  assert.equal(sdk.requests.length, 1)
  const outbound = lastOutboundText()
  assert.match(outbound, /标题: Watermelon/)
  assert.match(outbound, /目标提示等级: L3/)
  assert.ok(outbound.length > 200, 'prompt 必须是拼好的完整文本，不能是空串')
  assert.equal(result?.message, '注意 n 的上界，先估复杂度。')

  // 负向：Key 及其任何可识别片段都不能出现在消息体里。
  assert.doesNotMatch(outbound, /SENTINEL-APIKEY/)
  assert.doesNotMatch(outbound, /ark-SENTINEL/)
  assert.ok(!outbound.includes(API_KEY))
  // model / base_url 属于配置而非消息内容：base_url 只该在 SDK 层出现。
  assert.doesNotMatch(outbound, /ark\.test\.invalid/)
})

test('数据库里的 Cookie 与提交原始载荷不进外发消息', async () => {
  const service = readyService()
  await service.generateHint(hintParams())
  const outbound = lastOutboundText()

  // 正向锚点：那条提交记录确实被采到并进了 prompt（否则下面几条负向断言就是空转）。
  assert.match(outbound, /总提交次数: 1/)
  assert.match(outbound, /最近 verdict: WA/)
  assert.match(outbound, /语言: C\+\+17/)
  assert.match(outbound, /题目总数：42/, '学习者画像也确实拼了进去')

  // 负向：同一行里的 raw_json（含 Cookie）、source_url（含 sessionId）、平台提交号都不外发。
  assert.doesNotMatch(outbound, /SENTINEL_COOKIE_VALUE/)
  assert.doesNotMatch(outbound, /SENTINEL_SESSION_COOKIE/)
  assert.doesNotMatch(outbound, /SENTINEL_SUBMISSION_ID/)
  assert.doesNotMatch(outbound, /JSESSIONID/)
})

test('未初始化 / 未启用 / 无 Key 时不发请求', async () => {
  const uninitialized = new LlmHintService()
  assert.equal(uninitialized.isReady(), false)
  assert.equal(await uninitialized.generateHint(hintParams()), null)
  assert.equal(await uninitialized.chat({ userMessage: '在吗', session: session(), constraints: null }), null)
  assert.equal(await uninitialized.requestHint({ session: session(), constraints: null }), null)
  assert.deepEqual(sdk.requests, [], 'init() 之前一次网络调用都不该有')

  // 配了 Key 但开关关着。
  store.encryptedApiKey = encrypted(API_KEY)
  store.enabled = false
  const disabled = new LlmHintService()
  disabled.init()
  assert.equal(disabled.isReady(), false)
  assert.equal(await disabled.generateHint(hintParams()), null)

  // 开关开着但没有 Key。
  store.encryptedApiKey = ''
  store.enabled = true
  const keyless = new LlmHintService()
  keyless.init()
  assert.equal(keyless.isReady(), false)
  assert.equal(await keyless.generateHint(hintParams()), null)

  assert.deepEqual(sdk.requests, [], '禁用或缺 Key 时不能有任何外发请求')
  assert.deepEqual(sdk.constructorOptions, [], '未就绪时连 SDK 都不该构造')

  // 正向对照：同样的参数在就绪服务上确实会发请求，证明上面的"没发"不是参数本身的问题。
  const ready = readyService()
  assert.equal(ready.isReady(), true)
  assert.notEqual(await ready.generateHint(hintParams()), null)
  assert.equal(sdk.requests.length, 1)
})

test('结构化响应字段整体落进 LlmHintResult', async () => {
  sdk.usage = { prompt_tokens: 321, completion_tokens: 45 }
  const service = readyService()
  const result = await service.generateHint(hintParams())

  assert.equal(result?.source_type, 'llm', '来源标记固定为 llm，审计要靠它区分本地模板')
  assert.deepEqual(result?.related_tags, ['二分'])
  assert.equal(result?.hint_type, 'complexity')
  assert.equal(result?.confidence, 0.8)
  assert.equal(result?.reveals_solution, false)
  assert.equal(result?.model, 'doubao-served', '用服务端回报的模型名，而不是本地配置')
  assert.equal(result?.tokens_input, 321)
  assert.equal(result?.tokens_output, 45)
  assert.equal(typeof result?.latency_ms, 'number')
})

test('同题同等级命中缓存，不重复外发', async () => {
  const service = readyService()

  const first = await service.generateHint(hintParams())
  const second = await service.generateHint(hintParams())

  // 正向锚点：第一次真的发出去了。
  assert.equal(sdk.requests.length, 1, '第二次必须复用缓存')
  assert.equal(second?.message, first?.message)

  // 换等级就是另一个缓存键：L4 的提示不能拿 L3 的结果顶替。
  await service.generateHint(hintParams({ targetLevel: 4 }))
  assert.equal(sdk.requests.length, 2)
  assert.match(lastOutboundText(), /目标提示等级: L4/)

  // 换题目同理。
  await service.generateHint(hintParams({
    session: session({ platform_problem_id: '5678B' }),
  }))
  assert.equal(sdk.requests.length, 3)
})

test('用户主动请求时绕过缓存', async () => {
  const service = readyService()

  await service.generateHint(hintParams())
  await service.generateHint(hintParams({ userExplicitAsk: true }))

  // 用户点"再给一点"要拿到新提示；复用上一条会让按钮看起来失灵。
  assert.equal(sdk.requests.length, 2)
  assert.match(lastOutboundText(), /学生主动请求更深提示/)
})

test('缓存 5 分钟过期', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-31T10:00:00+08:00'))
  const service = readyService()

  await service.generateHint(hintParams())
  vi.setSystemTime(new Date('2026-08-31T10:04:59+08:00'))
  await service.generateHint(hintParams())
  assert.equal(sdk.requests.length, 1, '未到 5 分钟仍走缓存')

  vi.setSystemTime(new Date('2026-08-31T10:05:01+08:00'))
  await service.generateHint(hintParams())
  assert.equal(sdk.requests.length, 2, '过期后必须重新请求')
  vi.useRealTimers()
})

test('从启用改为禁用会清空缓存，重新启用后不复用旧结果', async () => {
  const service = readyService()
  await service.generateHint(hintParams())
  assert.equal(sdk.requests.length, 1)

  store.enabled = false
  service.reloadConfig()
  assert.equal(service.isReady(), false)

  store.enabled = true
  service.reloadConfig()
  assert.equal(service.isReady(), true)
  await service.generateHint(hintParams())

  // 关闭 LLM 时缓存必须清掉：否则重新打开后还会吐出关闭前那条提示。
  assert.equal(sdk.requests.length, 2)
})

test('调用失败时返回 null 让调用方降级，且日志里没有 Key 与消息体', async () => {
  const service = readyService()
  // 模拟 SDK 把上游报文塞进 error.message 的情形（真实 401 就长这样）。
  sdk.error = new Error('401 Unauthorized: invalid api key')

  const result = await service.generateHint(hintParams())

  assert.equal(result, null, '返回 null 是本地模板降级的触发条件')
  // 正向锚点：请求确实发出去过、也确实记了一条警告，所以下面的负向断言不是空转。
  assert.equal(sdk.requests.length, 1)
  assert.equal(logs.entries.length, 1)
  assert.equal(logs.entries[0].message, 'llm.generate-hint-failed')

  const logged = JSON.stringify(logs.entries[0])
  assert.doesNotMatch(logged, /SENTINEL-APIKEY/, '日志载荷不该带上明文 Key')
  assert.doesNotMatch(logged, /Watermelon/, '日志不该把整个 prompt 抄一份')
  // 失败不写缓存：否则一次 401 会把 null 之外的旧值锁住 5 分钟。
  sdk.error = null
  await service.generateHint(hintParams())
  assert.equal(sdk.requests.length, 2)
})

test('自由聊天把学生原话发出去，回复原样返回', async () => {
  sdk.reply = '先把状态定义写下来。'
  const service = readyService()

  const reply = await service.chat({
    userMessage: '这题和我上周那道很像？',
    session: session(),
    constraints: null,
    history: [
      { role: 'user', content: '第一步怎么做' },
      { role: 'assistant', content: '先想清楚状态定义' },
    ],
    problemUrl: 'https://codeforces.com/contest/1234/problem/A',
  })

  assert.equal(reply, '先把状态定义写下来。')
  const request = sdk.requests[0]
  assert.deepEqual(request?.messages?.map((message) => message.role), ['system', 'user', 'assistant', 'user'])
  const outbound = lastOutboundText()
  assert.match(outbound, /<student_message>\n这题和我上周那道很像？\n<\/student_message>/)
  // 聊天走的是当前页 URL 而不是 canonical：比赛页与题库页不是同一个地址。
  assert.match(outbound, /链接: https:\/\/codeforces\.com\/contest\/1234\/problem\/A/)
  assert.ok(!outbound.includes(API_KEY), 'Key 同样不能进聊天消息')
})

test('没有打开题目时聊天照样可用', async () => {
  sdk.reply = '按你的错题分布，建议先补二分。'
  const service = readyService()

  const reply = await service.chat({ userMessage: '今天刷什么', session: null, constraints: null })

  assert.equal(reply, '按你的错题分布，建议先补二分。')
  const outbound = lastOutboundText()
  // 没有会话时题目段是空的，但画像仍要带上——这正是"记忆能力"那段 system prompt 的依据。
  assert.match(outbound, /<problem>\n<\/problem>/)
  assert.match(outbound, /题目总数：42/)
  assert.doesNotMatch(outbound, /平台:|标题:/)
})

test('聊天失败返回 null 并记 llm.chat-failed', async () => {
  const service = readyService()
  sdk.error = new Error('socket hang up')

  assert.equal(await service.chat({ userMessage: '在吗', session: session(), constraints: null }), null)
  assert.equal(sdk.requests.length, 1, '正向锚点：请求确实发出过')
  assert.deepEqual(logs.entries.map((entry) => entry.message), ['llm.chat-failed'])
})

test('requestHint 只返回提示正文，默认 L1 且绕过缓存', async () => {
  const service = readyService()

  const first = await service.requestHint({ session: session(), constraints: null })
  assert.equal(first, '注意 n 的上界，先估复杂度。')
  assert.match(lastOutboundText(), /目标提示等级: L1/)
  assert.match(lastOutboundText(), /学生主动请求更深提示/)

  // 用户点"给点提示"必须每次都真问一遍，所以第二次仍要发请求。
  await service.requestHint({ session: session(), constraints: null })
  assert.equal(sdk.requests.length, 2)

  await service.requestHint({ session: session(), constraints: null, targetLevel: 5 })
  assert.match(lastOutboundText(), /目标提示等级: L5/)
})

test('requestHint 失败返回 null 并记 llm.request-hint-failed', async () => {
  const service = readyService()
  sdk.error = new Error('502 Bad Gateway')

  assert.equal(await service.requestHint({ session: session(), constraints: null }), null)
  assert.equal(sdk.requests.length, 1, '正向锚点：请求确实发出过')
  assert.deepEqual(logs.entries.map((entry) => entry.message), ['llm.request-hint-failed'])
})

test('getConfigStatus 给 UI 的是脱敏摘要，不含完整 Key', () => {
  const service = readyService()
  const status = service.getConfigStatus()

  assert.equal(status.enabled, true)
  assert.equal(status.has_key, true)
  assert.equal(status.model, 'doubao-seed-1-6-flash-250715')
  assert.equal(status.base_url, 'https://ark.test.invalid/api/v3')
  // 正向锚点：确实返回了一个非空摘要（不是空串导致下面的负向断言空转）。
  assert.ok(status.key_masked.length > 0)
  assert.notEqual(status.key_masked, API_KEY, '不能把明文 Key 交给渲染进程')
  assert.match(status.key_masked, /\*{4}/, '中段必须被掩码替换')
  assert.ok(!status.key_masked.includes('SENTINEL-APIKEY'), 'Key 主体不能出现在摘要里')
})

test('testConnection 走独立客户端，只回报成败摘要', async () => {
  sdk.reply = 'ok'
  const service = readyService()

  const result = await service.testConnection({
    api_key: 'ark-ANOTHER-KEY',
    base_url: 'https://ark.test.invalid/api/v3',
    model: 'probe-model',
    enabled: true,
  })

  assert.equal(result.success, true)
  assert.match(result.message, /连接成功/)
  // 测试连接必须用传进来的那把 Key 新建客户端，而不是复用已初始化的（面板要能验未保存的 Key）。
  assert.equal(sdk.constructorOptions[sdk.constructorOptions.length - 1]?.apiKey, 'ark-ANOTHER-KEY')
  assert.equal(sdk.constructorOptions[sdk.constructorOptions.length - 1]?.maxRetries, 0)
  assert.equal(sdk.requests[sdk.requests.length - 1]?.model, 'probe-model')
  assert.ok(!JSON.stringify(result).includes('ark-ANOTHER-KEY'), '返回给 renderer 的结果不能带 Key')
})

test('saveApiKey 成功后立刻生效，空串解绑后不再发请求', async () => {
  const service = readyService()

  assert.equal(service.saveApiKey('ark-NEW-KEY'), true)
  // 保存后自动 reloadConfig：不重载的话面板显示已保存、实际还在用旧 Key。
  assert.deepEqual(store.saved[store.saved.length - 1], {
    llm: {
      encrypted_api_key: encrypted('ark-NEW-KEY'),
      base_url: 'https://ark.test.invalid/api/v3',
      model: 'doubao-seed-1-6-flash-250715',
      enabled: true,
    },
  })
  assert.ok(store.saved.every((entry) => !JSON.stringify(entry).includes('ark-NEW-KEY')),
    '落盘的必须是密文，不能出现明文 Key')

  // 解绑：写回空串后 load() 拿不到 Key，服务应转为未就绪。
  store.encryptedApiKey = ''
  service.reloadConfig()
  assert.equal(service.isReady(), false)
  assert.equal(await service.generateHint(hintParams()), null)
})

test('saveConfig 只改非敏感字段并重载', () => {
  const service = readyService()

  service.saveConfig({ model: 'doubao-pro', enabled: false })

  const saved = store.saved[store.saved.length - 1] as { llm: Record<string, unknown> }
  assert.equal(saved.llm.model, 'doubao-pro')
  assert.equal(saved.llm.enabled, false)
  // 加密 Key 原样保留：改模型不该顺手把已保存的 Key 冲掉。
  assert.equal(saved.llm.encrypted_api_key, encrypted(API_KEY))
})
