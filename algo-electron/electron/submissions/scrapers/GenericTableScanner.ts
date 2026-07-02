import type { SubmissionData, Verdict } from '../../shared/types'

export interface GenericTableRow {
  texts: string[]
  links?: string[]
  rowId?: string
}

export interface GenericTableData {
  headers: string[]
  rows: GenericTableRow[]
}

export interface GenericTableScanOptions {
  platform: string
  submissionPrefix: string
  now: () => string
}

const VERDICT_KEYWORDS = [
  'verdict', 'result', 'status', '评测结果', '运行结果', '状态', '结果', '得分',
]

const ID_KEYWORDS = [
  'id', 'run id', '运行id', '提交编号', 'submission id',
]

const LANGUAGE_KEYWORDS = [
  'language', 'lang', '语言', '使用语言', '编译器', 'compiler',
]

const TIME_KEYWORDS = [
  'time', '耗时', '运行时间',
]

const MEMORY_KEYWORDS = [
  'memory', '内存', '使用内存',
]

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(header => {
    const normalized = header.trim().toLowerCase()
    return keywords.some(keyword => normalized.includes(keyword.toLowerCase()))
  })
}

function normalizeVerdict(raw: string): Verdict {
  const value = raw.trim().toLowerCase()
  if (!value) return 'UNKNOWN'
  if (value.includes('答案正确') || value.includes('accepted') || value === 'ac' || value.includes('通过')) return 'AC'
  if (value.includes('部分正确')) return 'WA'
  if (value.includes('答案错误') || value.includes('wrong answer') || value === 'wa') return 'WA'
  if (value.includes('时间超限') || value.includes('超出时间限制') || value.includes('time limit') || value === 'tle') return 'TLE'
  if (value.includes('内存超限') || value.includes('超出内存限制') || value.includes('memory limit') || value === 'mle') return 'MLE'
  if (value.includes('运行错误') || value.includes('运行时错误') || value.includes('runtime error') || value === 're') return 'RE'
  if (value.includes('编译错误') || value.includes('compile error') || value.includes('compilation error') || value === 'ce') return 'CE'
  if (value.includes('格式错误') || value.includes('presentation error') || value === 'pe') return 'PE'
  if (value.includes('输出超限') || value.includes('output limit') || value === 'ole') return 'OLE'
  if (
    value.includes('等待评测')
    || value.includes('正在评测')
    || value.includes('评测中')
    || value.includes('排队')
    || value.includes('pending')
    || value.includes('judging')
    || value.includes('running')
    || value.includes('testing')
    || value.includes('queue')
    || value.includes('compiling')
  ) return 'TESTING'
  if (value.includes('已被覆盖') || value.includes('skipped')) return 'SKIPPED'
  return 'UNKNOWN'
}

function parseRuntimeMs(raw: string): number | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(ms|s)?/)
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  return match[2] === 's' ? Math.round(amount * 1000) : Math.round(amount)
}

function parseMemoryKb(raw: string): number | undefined {
  const value = raw.trim().toLowerCase()
  if (!value) return undefined
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kb|kib|mb|mib)?/)
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  const unit = match[2] ?? 'kb'
  return unit.startsWith('m') ? Math.round(amount * 1024) : Math.round(amount)
}

function extractSubmissionId(row: GenericTableRow, idText: string, options: GenericTableScanOptions): string | null {
  const normalizedId = idText.replace(/\s+/g, '')
  if (normalizedId) return `${options.submissionPrefix}-${normalizedId}`

  const rowId = normalizeText(row.rowId)
  if (rowId) return `${options.submissionPrefix}-${rowId}`

  for (const link of row.links ?? []) {
    const matches = Array.from(link.matchAll(/\/(\d{4,})(?=\/|[?#]|$)/g))
    const match = matches[matches.length - 1]
    if (match) return `${options.submissionPrefix}-${match[1]}`
  }

  return null
}

function inferVerdictColumn(table: GenericTableData): number {
  if (!table.rows.length) return -1
  const width = Math.max(...table.rows.map(row => row.texts.length))
  let bestIndex = -1
  let bestScore = 0

  for (let column = 0; column < width; column++) {
    let score = 0
    for (const row of table.rows) {
      if (normalizeVerdict(normalizeText(row.texts[column])) !== 'UNKNOWN') score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = column
    }
  }

  return bestScore > 0 ? bestIndex : -1
}

export function hasSubmissionLikeTable(table: GenericTableData): boolean {
  const headers = table.headers ?? []
  const hasVerdictHeader = findColumnIndex(headers, VERDICT_KEYWORDS) >= 0
  const hasVerdictValues = inferVerdictColumn(table) >= 0
  const hasEnoughRows = table.rows.some(row => row.texts.length >= 2)
  return hasEnoughRows && (hasVerdictHeader || hasVerdictValues)
}

export function selectBestSubmissionTable(tables: GenericTableData[]): GenericTableData | null {
  let bestTable: GenericTableData | null = null
  let bestScore = 0

  for (const table of tables) {
    if (!hasSubmissionLikeTable(table)) continue

    const headers = table.headers ?? []
    const score =
      table.rows.length +
      (findColumnIndex(headers, ID_KEYWORDS) >= 0 ? 4 : 0) +
      (findColumnIndex(headers, VERDICT_KEYWORDS) >= 0 ? 6 : 0) +
      (findColumnIndex(headers, LANGUAGE_KEYWORDS) >= 0 ? 2 : 0) +
      (findColumnIndex(headers, TIME_KEYWORDS) >= 0 ? 1 : 0) +
      (findColumnIndex(headers, MEMORY_KEYWORDS) >= 0 ? 1 : 0)

    if (score > bestScore) {
      bestScore = score
      bestTable = table
    }
  }

  return bestTable
}

export function scanGenericSubmissionTable(table: GenericTableData, options: GenericTableScanOptions): SubmissionData[] {
  if (!hasSubmissionLikeTable(table)) return []

  const headers = table.headers ?? []
  const idIdx = findColumnIndex(headers, ID_KEYWORDS)
  const verdictIdx = findColumnIndex(headers, VERDICT_KEYWORDS)
  const langIdx = findColumnIndex(headers, LANGUAGE_KEYWORDS)
  const runtimeIdx = findColumnIndex(headers, TIME_KEYWORDS)
  const memoryIdx = findColumnIndex(headers, MEMORY_KEYWORDS)
  const fallbackVerdictIdx = verdictIdx >= 0 ? verdictIdx : inferVerdictColumn(table)

  const seen = new Set<string>()
  const submissions: SubmissionData[] = []

  table.rows.forEach((row) => {
    if (row.texts.length < 2) return

    const rawVerdict = fallbackVerdictIdx >= 0 ? normalizeText(row.texts[fallbackVerdictIdx]) : ''
    const verdict = normalizeVerdict(rawVerdict)
    if (verdict === 'UNKNOWN' && !rawVerdict) return

    const platformSubmissionId = extractSubmissionId(
      row,
      idIdx >= 0 ? normalizeText(row.texts[idIdx]) : '',
      options,
    )
    if (!platformSubmissionId) return
    const dedupeKey = `${platformSubmissionId}:${rawVerdict}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    submissions.push({
      platform: options.platform,
      platformSubmissionId,
      verdict,
      rawVerdict,
      language: langIdx >= 0 ? normalizeText(row.texts[langIdx]) : undefined,
      runtimeMs: runtimeIdx >= 0 ? parseRuntimeMs(normalizeText(row.texts[runtimeIdx])) : undefined,
      memoryKb: memoryIdx >= 0 ? parseMemoryKb(normalizeText(row.texts[memoryIdx])) : undefined,
      submittedAt: options.now(),
      sourceUrl: (row.links ?? []).find(Boolean),
      rawJson: JSON.stringify({ headers, row }),
    })
  })

  return submissions
}
