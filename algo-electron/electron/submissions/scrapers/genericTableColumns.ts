import type { GenericTableData } from './genericTableTypes'
import { normalizeGenericVerdict, normalizeText } from './genericTableValueParsers'

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

export interface GenericTableColumnIndexes {
  idIdx: number
  verdictIdx: number
  langIdx: number
  runtimeIdx: number
  memoryIdx: number
  fallbackVerdictIdx: number
}

export function getGenericTableColumnIndexes(table: GenericTableData): GenericTableColumnIndexes {
  const headers = table.headers ?? []
  const verdictIdx = findColumnIndex(headers, VERDICT_KEYWORDS)
  return {
    idIdx: findColumnIndex(headers, ID_KEYWORDS),
    verdictIdx,
    langIdx: findColumnIndex(headers, LANGUAGE_KEYWORDS),
    runtimeIdx: findColumnIndex(headers, TIME_KEYWORDS),
    memoryIdx: findColumnIndex(headers, MEMORY_KEYWORDS),
    fallbackVerdictIdx: verdictIdx >= 0 ? verdictIdx : inferVerdictColumn(table),
  }
}

export function hasSubmissionLikeTable(table: GenericTableData): boolean {
  const headers = table.headers ?? []
  const hasVerdictHeader = findColumnIndex(headers, VERDICT_KEYWORDS) >= 0
  const hasVerdictValues = inferVerdictColumn(table) >= 0
  const hasEnoughRows = table.rows.some(row => row.texts.length >= 2)
  return hasEnoughRows && (hasVerdictHeader || hasVerdictValues)
}

export function scoreSubmissionTable(table: GenericTableData): number {
  if (!hasSubmissionLikeTable(table)) return 0

  const headers = table.headers ?? []
  return table.rows.length
    + (findColumnIndex(headers, ID_KEYWORDS) >= 0 ? 4 : 0)
    + (findColumnIndex(headers, VERDICT_KEYWORDS) >= 0 ? 6 : 0)
    + (findColumnIndex(headers, LANGUAGE_KEYWORDS) >= 0 ? 2 : 0)
    + (findColumnIndex(headers, TIME_KEYWORDS) >= 0 ? 1 : 0)
    + (findColumnIndex(headers, MEMORY_KEYWORDS) >= 0 ? 1 : 0)
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  return headers.findIndex(header => {
    const normalized = header.trim().toLowerCase()
    return keywords.some(keyword => normalized.includes(keyword.toLowerCase()))
  })
}

function inferVerdictColumn(table: GenericTableData): number {
  if (!table.rows.length) return -1
  const width = Math.max(...table.rows.map(row => row.texts.length))
  let bestIndex = -1
  let bestScore = 0

  for (let column = 0; column < width; column++) {
    let score = 0
    for (const row of table.rows) {
      if (normalizeGenericVerdict(normalizeText(row.texts[column])) !== 'UNKNOWN') score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = column
    }
  }

  return bestScore > 0 ? bestIndex : -1
}
