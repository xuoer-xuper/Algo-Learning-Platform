import type { SubmissionData, Verdict } from '../../shared/types'
import { nowBeijing, toBeijing } from '../../shared/time'
import type { SubmissionScrapeContext } from '../../adapters/types'

function mapTextVerdict(text: string): Verdict {
  const value = text.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  if (value.includes('accepted') || value === 'ac' || value.includes('答案正确') || value.includes('通过')) return 'AC'
  if (value.includes('wrong answer') || value === 'wa' || value.includes('答案错误')) return 'WA'
  if (value.includes('time limit') || value === 'tle' || value.includes('时间超限') || value.includes('超时')) return 'TLE'
  if (value.includes('memory limit') || value === 'mle' || value.includes('内存超限')) return 'MLE'
  if (value.includes('output limit') || value === 'ole' || value.includes('输出超限')) return 'OLE'
  if (value.includes('runtime error') || value === 're' || value.includes('运行错误')) return 'RE'
  if (value.includes('compile error') || value === 'ce' || value.includes('编译错误')) return 'CE'
  if (value.includes('presentation error') || value === 'pe' || value.includes('格式错误')) return 'PE'
  if (value.includes('waiting') || value.includes('judging') || value.includes('running') || value.includes('评测中') || value.includes('等待')) return 'TESTING'
  return 'UNKNOWN'
}

function mapStatusVerdict(status: number): Verdict {
  if (status === 12) return 'AC'
  if (status === 6 || status === 14) return 'WA'
  if (status === 5) return 'TLE'
  if (status === 4) return 'MLE'
  if (status === 3) return 'OLE'
  if (status === 7) return 'RE'
  if (status === 2) return 'CE'
  if (status === 0 || status === 1) return 'TESTING'
  return 'UNKNOWN'
}

function mapRawVerdict(value: unknown): { verdict: Verdict; rawVerdict: string } | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { verdict: mapStatusVerdict(value), rawVerdict: String(value) }
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
      return { verdict: mapStatusVerdict(numeric), rawVerdict: value.trim() }
    }
    return { verdict: mapTextVerdict(value), rawVerdict: value.trim() }
  }
  return null
}

function collectTestcaseVerdicts(value: unknown, results: Array<{ verdict: Verdict; rawVerdict: string }>, depth = 0): void {
  if (!value || depth > 8) return
  if (Array.isArray(value)) {
    for (const item of value) collectTestcaseVerdicts(item, results, depth + 1)
    return
  }
  if (typeof value !== 'object') return

  const record = value as Record<string, unknown>
  const ownVerdict = mapRawVerdict(record.status ?? record.verdict ?? record.result ?? record.judgeResult)
  if (ownVerdict && ownVerdict.verdict !== 'UNKNOWN') {
    results.push(ownVerdict)
  }

  for (const key of ['testCases', 'testcases', 'cases', 'points', 'subtasks', 'details', 'detail', 'results', 'result']) {
    collectTestcaseVerdicts(record[key], results, depth + 1)
  }
}

/**
 * 洛谷提交记录在页面里的原始形状。
 *
 * 只声明成"键名任意、值未知"而不列字段：同一条记录在列表页、详情页、实时推送三条路径上
 * 的键名并不一致（status/verdict/result/judgeResult 都出现过，测试点挂在 detail、
 * details、testCases、subtasks、points 下），下面每个读取函数都在依次试探这些别名。
 * 列一份"字段清单"会假装我们知道对方的契约，而洛谷从没承诺过。
 *
 * 关键是值为 `unknown`：取出来必须先收窄才能用，这正是 `any` 此前放过的地方。
 */
type LuoguRecord = Record<string, unknown>

/** 把 `unknown` 收窄成一层记录。`null` 的 `typeof` 也是 `'object'`，所以必须单独排掉。 */
function asRecord(value: unknown): LuoguRecord | undefined {
  return value !== null && typeof value === 'object' ? value as LuoguRecord : undefined
}

/**
 * 取一层子对象。`record.problem` 这类嵌套对象和外层一样没有契约，可能压根不存在、
 * 也可能是个字符串（`extractProblemIdFromText(record.problem)` 就是在赌这种情况）。
 */
function nestedRecord(record: LuoguRecord, key: string): LuoguRecord | undefined {
  return asRecord(record[key])
}

/** 只保留数组里的对象元素。非数组（含 `undefined`）得到空数组，等价于原先的 `?? []`。 */
function asRecordArray(value: unknown): LuoguRecord[] {
  if (!Array.isArray(value)) return []
  const records: LuoguRecord[] = []
  for (const item of value) {
    const record = asRecord(item)
    if (record) records.push(record)
  }
  return records
}

/**
 * 取有限数字。数字字符串也接受：原先 `runtimeMs: record.time` 靠 `any` 直接赋给 `number`
 * 字段、`record.submitTime * 1000` 靠隐式转换生效，洛谷不同页面两种形式都给过。
 *
 * 非数字（含 `NaN`）返回 `undefined`，落到 `SubmissionData` 的可选字段上就是"没这项"
 * ——比原先把字符串塞进声明为 `number` 的字段诚实。
 */
function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : undefined
  }
  return undefined
}

function collectLuoguTestcaseVerdicts(record: LuoguRecord): Array<{ verdict: Verdict; rawVerdict: string }> {
  const testcaseVerdicts: Array<{ verdict: Verdict; rawVerdict: string }> = []
  for (const key of ['detail', 'details', 'judgeResult', 'testCases', 'testcases', 'subtasks', 'cases', 'points']) {
    collectTestcaseVerdicts(record?.[key], testcaseVerdicts)
  }
  return testcaseVerdicts
}

function hasLuoguDetail(record: LuoguRecord): boolean {
  return ['detail', 'details', 'judgeResult', 'testCases', 'testcases', 'subtasks', 'cases', 'points']
    .some((key) => {
      const value = record?.[key]
      if (Array.isArray(value)) return value.length > 0
      return value && typeof value === 'object' && Object.keys(value).length > 0
    })
}

function resolveLuoguVerdict(record: LuoguRecord): { verdict: Verdict; rawVerdict: string } {
  const testcaseVerdicts = collectLuoguTestcaseVerdicts(record)

  const pending = testcaseVerdicts.find(item => item.verdict === 'TESTING')
  if (pending) return pending

  const firstFailed = testcaseVerdicts.find(item => item.verdict !== 'AC' && item.verdict !== 'TESTING' && item.verdict !== 'UNKNOWN')
  if (firstFailed) return firstFailed

  const aggregate = mapRawVerdict(record?.status)
  if (aggregate) return aggregate

  return { verdict: 'UNKNOWN', rawVerdict: String(record?.status ?? '') }
}

function isRealtimeRecordReady(record: LuoguRecord): boolean {
  const verdict = resolveLuoguVerdict(record)
  if (verdict.verdict === 'TESTING' || verdict.verdict === 'UNKNOWN') return false

  const aggregate = mapRawVerdict(record?.status)
  if (aggregate?.verdict === 'CE') return true

  return hasLuoguDetail(record)
}

const LUOGU_LANGUAGE_FALLBACK: Record<string, string> = {
  '1': 'Pascal',
  '2': 'C',
  '3': 'C++98',
  '4': 'C++11',
  '5': '提交答案',
  '6': 'Python 2',
  '7': 'Python 3',
  '8': 'Java 8',
  '9': 'Node.js LTS',
  '10': 'Shell',
  '11': 'C++14',
  '12': 'C++17',
  '13': 'Ruby',
  '14': 'Go',
  '15': 'Rust',
  '16': 'PHP',
  '17': 'C# Mono',
  '18': 'Visual Basic Mono',
  '19': 'Haskell',
  '20': 'Kotlin/Native',
  '21': 'Kotlin/JVM',
  '22': 'Scala',
  '23': 'Perl',
  '24': 'PyPy 2',
  '25': 'PyPy 3',
  '26': '文言',
  '27': 'C++20',
  '28': 'C++14 (GCC 9)',
  '29': 'F#.NET',
  '30': 'OCaml',
  '31': 'Julia',
  '32': 'Lua',
  '33': 'Java 21',
  '34': 'C++23',
}

function normalizeLuoguLanguageMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue
    if (typeof entry === 'string' && entry.trim()) {
      result[key] = entry.trim()
      continue
    }
    if (entry && typeof entry === 'object') {
      const name = (entry as Record<string, unknown>).name
      if (typeof name === 'string' && name.trim()) result[key] = name.trim()
    }
  }
  return result
}

function getLuoguLanguageName(record: LuoguRecord, languageMap: Record<string, string>): string {
  const named = firstText([
    record?.languageName,
    record?.languageLabel,
    record?.languageDisplay,
    record?.langName,
    record?.compiler,
    record?.compilerName,
    nestedRecord(record, 'codeLanguage')?.name,
    nestedRecord(record, 'language')?.name,
  ])
  if (named) return named

  const raw = record?.language ?? record?.languageId ?? record?.lang
  if (typeof raw === 'string' && raw.trim() && !/^\d+$/.test(raw.trim())) return raw.trim()
  const id = typeof raw === 'number' && Number.isFinite(raw)
    ? String(raw)
    : typeof raw === 'string' && /^\d+$/.test(raw.trim())
      ? raw.trim()
      : ''

  if (!id) return ''
  return languageMap[id] ?? LUOGU_LANGUAGE_FALLBACK[id] ?? ''
}

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function extractProblemIdFromText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const urlMatch = value.match(/\/problem\/([A-Za-z0-9_]+)/)
  if (urlMatch && urlMatch[1].toLowerCase() !== 'list') return urlMatch[1]
  const idMatch = value.match(/\b([A-Z][A-Z0-9]*\d+[A-Z0-9_]*)\b/)
  return idMatch?.[1]
}

function getLuoguProblemId(record: LuoguRecord): string | undefined {
  const problem = nestedRecord(record, 'problem')
  const publicId = firstText([
    problem?.pid,
    problem?.displayId,
    problem?.code,
    record.pid,
  ])
  if (publicId) return publicId

  const extracted = extractProblemIdFromText(problem?.url)
    ?? extractProblemIdFromText(problem?.link)
    ?? extractProblemIdFromText(record.problemUrl)
    ?? extractProblemIdFromText(record.url)
    ?? extractProblemIdFromText(problem?.title)
    ?? extractProblemIdFromText(problem?.name)
    ?? extractProblemIdFromText(record.problem)
  if (extracted) return extracted

  return firstText([
    problem?.problemId,
    problem?.id,
    record.problemId,
  ])
}

function getLuoguProblemTitle(record: LuoguRecord): string | undefined {
  const problem = nestedRecord(record, 'problem')
  const title = firstText([
    problem?.title,
    problem?.name,
    problem?.fullName,
    problem?.displayTitle,
    problem?.problemTitle,
    record.problemTitle,
  ])
  if (!title) return undefined

  const problemId = getLuoguProblemId(record)
  if (problemId && title.startsWith(problemId)) {
    return title.slice(problemId.length).replace(/^[-\s:：]+/, '').trim() || title
  }
  return title
}

function buildLuoguRawJson(record: LuoguRecord): string | undefined {
  const problemId = getLuoguProblemId(record)
  const problemTitle = getLuoguProblemTitle(record)
  if (!problemId && !problemTitle) return undefined

  return JSON.stringify({
    ...(problemId ? { _luoguProblemId: problemId } : {}),
    ...(problemTitle ? { _luoguProblemTitle: problemTitle } : {}),
  })
}

export const EXTRACT_LUOGU_SUBMISSIONS_SCRIPT = `
  (async () => {
    const readLanguageMap = (root) => {
      try {
        return root?.codeLanguages
          || root?.config?.codeLanguages
          || root?.currentData?.codeLanguages
          || root?.currentData?.config?.codeLanguages
          || {};
      } catch(e) {
        return {};
      }
    };
    try {
      const u = new URL(location.href);
      u.searchParams.set('_contentOnly', '1');
      const res = await fetch(u.toString(), {
        headers: {
          'x-luogu-type': 'content-only',
          'x-requested-with': 'XMLHttpRequest'
        }
      });
      if (res.ok) {
        const json = await res.json();
        const languageMap = readLanguageMap(json);
        const record = json?.currentData?.record;
        if (record && typeof record === 'object') {
          return { fromInjection: true, record, languageMap };
        }
        const result = json?.currentData?.records?.result;
        if (result && Array.isArray(result)) {
          return { fromInjection: true, records: result, languageMap };
        }
      }
    } catch(e) {}

    try {
      const languageMap = {
        ...readLanguageMap(window._feConfig),
        ...readLanguageMap(window._feInjection)
      };
      const record = window._feInjection?.currentData?.record;
      if (record && typeof record === 'object') {
        return { fromInjection: true, record, languageMap };
      }
      const result = window._feInjection?.currentData?.records?.result;
      if (result && Array.isArray(result)) {
        return { fromInjection: true, records: result, languageMap };
      }
    } catch(e) {}
    
    const rows = [];
    const rowElements = document.querySelectorAll('div.record-list > div, .row[data-v]');
    for (const row of rowElements) {
      rows.push({
        text: row.textContent,
        links: Array.from(row.querySelectorAll('a')).map(a => a.href)
      });
    }
    return { fromInjection: false, rows };
  })()
`

export async function scrapeLuogu(browserHost: SubmissionScrapeContext): Promise<SubmissionData[]> {
  const data = await browserHost.executeScript(EXTRACT_LUOGU_SUBMISSIONS_SCRIPT)
  return parseLuoguSubmissionData(data)
}

/**
 * 解析注入脚本或实时钩子拿到的载荷。
 *
 * 入参是 `unknown` 而不是 `any`：这个值有两个来源——`executeScript` 跨进程克隆回来的结果、
 * 实时钩子从页面 fetch 拦下的响应体（见 `sites/luogu/submissions.ts` 的 `getResponseRecord`）。
 * 两者都由页面里的代码决定形状，主进程这边只能收窄后再用。
 */
export function parseLuoguSubmissionData(
  data: unknown,
  options: { requireRealtimeReady?: boolean } = {},
): SubmissionData[] {
  const payload = asRecord(data)
  if (!payload) return []

  if (payload.fromInjection) {
    const languageMap = {
      ...LUOGU_LANGUAGE_FALLBACK,
      ...normalizeLuoguLanguageMap(payload.languageMap ?? payload.codeLanguages),
    }
    // 单条 `record` 与列表 `records` 是两条互斥路径：详情页/实时推送给前者，列表页给后者。
    if (payload.record) return parseInjectedRecords(asRecordArray([payload.record]), options, languageMap)
    return parseInjectedRecords(asRecordArray(payload.records), options, languageMap)
  }

  return parseDomRows(payload.rows)
}

function parseInjectedRecords(
  records: LuoguRecord[],
  options: { requireRealtimeReady?: boolean } = {},
  languageMap: Record<string, string> = LUOGU_LANGUAGE_FALLBACK,
): SubmissionData[] {
  const results: SubmissionData[] = []

  for (const record of records) {
    if (!record.id) continue
    // `firstText` 而非原先的 `record.id.toString()`：id 若是对象，`toString()` 会得到
    // `'[object Object]'` 并当成合法提交号写进库，这里改成直接跳过。
    const submissionId = firstText([record.id])
    if (!submissionId) continue
    if (options.requireRealtimeReady && !isRealtimeRecordReady(record)) continue
    const verdict = resolveLuoguVerdict(record)
    const submitTime = finiteNumber(record.submitTime)
    results.push({
      platform: 'luogu',
      platformSubmissionId: submissionId,
      verdict: verdict.verdict,
      rawVerdict: verdict.rawVerdict,
      language: getLuoguLanguageName(record, languageMap),
      runtimeMs: finiteNumber(record.time),
      memoryKb: finiteNumber(record.memory),
      submittedAt: submitTime ? toBeijing(new Date(submitTime * 1000)) : nowBeijing(),
      sourceUrl: `https://www.luogu.com.cn/record/${submissionId}`,
      rawJson: buildLuoguRawJson(record),
    })
  }

  return results
}

/**
 * 解析 DOM 兜底路径的行。形状由本文件里的注入脚本自己产出（`{ text, links }`），但一样要收窄：
 * `row.textContent` 可能是 `null`，而 `link.match(...)` 在非字符串上会直接抛异常。
 */
function parseDomRows(rows: unknown): SubmissionData[] {
  const results: SubmissionData[] = []

  for (const row of asRecordArray(rows)) {
    const text = (typeof row.text === 'string' ? row.text : '').toLowerCase()
    const links = Array.isArray(row.links)
      ? row.links.filter((link): link is string => typeof link === 'string')
      : []

    let verdictText = ''
    if (text.includes('accepted') || text.includes('ac')) verdictText = 'AC'
    else if (text.includes('wrong answer') || text.includes('wa')) verdictText = 'WA'
    else if (text.includes('time limit') || text.includes('tle')) verdictText = 'TLE'
    else if (text.includes('memory limit') || text.includes('mle')) verdictText = 'MLE'
    else if (text.includes('compile error') || text.includes('ce')) verdictText = 'CE'

    let problemId = ''
    for (const link of links) {
      const match = link.match(/problem\/([A-Za-z0-9_]+)/)
      if (match) problemId = match[1]
    }

    let submissionId = ''
    for (const link of links) {
      const match = link.match(/record\/(\d+)/)
      if (match) submissionId = match[1]
    }

    if (verdictText && submissionId) {
      results.push({
        platform: 'luogu',
        platformSubmissionId: submissionId,
        verdict: mapTextVerdict(verdictText),
        rawVerdict: verdictText,
        language: '',
        submittedAt: nowBeijing(),
        sourceUrl: `https://www.luogu.com.cn/record/${submissionId}`,
        rawJson: problemId ? JSON.stringify({ _luoguProblemId: problemId }) : undefined,
      })
    }
  }

  return results
}
