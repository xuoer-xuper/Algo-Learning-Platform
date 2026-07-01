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

function collectLuoguTestcaseVerdicts(record: any): Array<{ verdict: Verdict; rawVerdict: string }> {
  const testcaseVerdicts: Array<{ verdict: Verdict; rawVerdict: string }> = []
  for (const key of ['detail', 'details', 'judgeResult', 'testCases', 'testcases', 'subtasks', 'cases', 'points']) {
    collectTestcaseVerdicts(record?.[key], testcaseVerdicts)
  }
  return testcaseVerdicts
}

function hasLuoguDetail(record: any): boolean {
  return ['detail', 'details', 'judgeResult', 'testCases', 'testcases', 'subtasks', 'cases', 'points']
    .some((key) => {
      const value = record?.[key]
      if (Array.isArray(value)) return value.length > 0
      return value && typeof value === 'object' && Object.keys(value).length > 0
    })
}

function resolveLuoguVerdict(record: any): { verdict: Verdict; rawVerdict: string } {
  const testcaseVerdicts = collectLuoguTestcaseVerdicts(record)

  const pending = testcaseVerdicts.find(item => item.verdict === 'TESTING')
  if (pending) return pending

  const firstFailed = testcaseVerdicts.find(item => item.verdict !== 'AC' && item.verdict !== 'TESTING' && item.verdict !== 'UNKNOWN')
  if (firstFailed) return firstFailed

  const aggregate = mapRawVerdict(record?.status)
  if (aggregate) return aggregate

  return { verdict: 'UNKNOWN', rawVerdict: String(record?.status ?? '') }
}

function isRealtimeRecordReady(record: any): boolean {
  const verdict = resolveLuoguVerdict(record)
  if (verdict.verdict === 'TESTING' || verdict.verdict === 'UNKNOWN') return false

  const aggregate = mapRawVerdict(record?.status)
  if (aggregate?.verdict === 'CE') return true

  return hasLuoguDetail(record)
}

function getLuoguProblemId(record: any): string | undefined {
  const pid = record?.problem?.pid ?? record?.problem?.id ?? record?.problemId ?? record?.pid
  return typeof pid === 'string' && pid.trim() ? pid.trim() : undefined
}

function getLuoguProblemTitle(record: any): string | undefined {
  const title = record?.problem?.title
    ?? record?.problem?.name
    ?? record?.problem?.fullName
    ?? record?.problem?.displayTitle
    ?? record?.problemTitle
  return typeof title === 'string' && title.trim() ? title.trim() : undefined
}

function buildLuoguRawJson(record: any): string | undefined {
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
        const record = json?.currentData?.record;
        if (record && typeof record === 'object') {
          return { fromInjection: true, record };
        }
        const result = json?.currentData?.records?.result;
        if (result && Array.isArray(result)) {
          return { fromInjection: true, records: result };
        }
      }
    } catch(e) {}

    try {
      const record = window._feInjection?.currentData?.record;
      if (record && typeof record === 'object') {
        return { fromInjection: true, record };
      }
      const result = window._feInjection?.currentData?.records?.result;
      if (result && Array.isArray(result)) {
        return { fromInjection: true, records: result };
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

export function parseLuoguSubmissionData(
  data: any,
  options: { requireRealtimeReady?: boolean } = {},
): SubmissionData[] {
  if (!data) return []

  if (data.fromInjection) {
    if (data.record) return parseInjectedRecords([data.record], options)
    return parseInjectedRecords(data.records || [], options)
  }

  return parseDomRows(data.rows || [])
}

function parseInjectedRecords(records: any[], options: { requireRealtimeReady?: boolean } = {}): SubmissionData[] {
  const results: SubmissionData[] = []

  for (const record of records) {
    if (!record?.id) continue
    if (options.requireRealtimeReady && !isRealtimeRecordReady(record)) continue
    const verdict = resolveLuoguVerdict(record)
    results.push({
      platform: 'luogu',
      platformSubmissionId: record.id.toString(),
      verdict: verdict.verdict,
      rawVerdict: verdict.rawVerdict,
      language: record.language ? record.language.toString() : '',
      runtimeMs: record.time,
      memoryKb: record.memory,
      submittedAt: record.submitTime ? toBeijing(new Date(record.submitTime * 1000)) : nowBeijing(),
      sourceUrl: `https://www.luogu.com.cn/record/${record.id}`,
      rawJson: buildLuoguRawJson(record),
    } as any)
  }

  return results
}

function parseDomRows(rows: any[]): SubmissionData[] {
  const results: SubmissionData[] = []

  for (const row of rows) {
    const text = (row.text || '').toLowerCase()
    const links = row.links || []

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
      } as any)
    }
  }

  return results
}
