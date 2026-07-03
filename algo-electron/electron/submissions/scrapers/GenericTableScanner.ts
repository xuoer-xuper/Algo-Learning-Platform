import type { SubmissionData } from '../../shared/types'
import {
  getGenericTableColumnIndexes,
  hasSubmissionLikeTable,
  scoreSubmissionTable,
} from './genericTableColumns'
import { extractGenericSubmissionId } from './genericTableIds'
import type { GenericTableData, GenericTableScanOptions } from './genericTableTypes'
import { normalizeGenericVerdict, normalizeText, parseMemoryKb, parseRuntimeMs } from './genericTableValueParsers'

export type { GenericTableData, GenericTableRow, GenericTableScanOptions } from './genericTableTypes'
export { hasSubmissionLikeTable } from './genericTableColumns'

export function selectBestSubmissionTable(tables: GenericTableData[]): GenericTableData | null {
  let bestTable: GenericTableData | null = null
  let bestScore = 0

  for (const table of tables) {
    const score = scoreSubmissionTable(table)
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
  const columns = getGenericTableColumnIndexes(table)
  const seen = new Set<string>()
  const submissions: SubmissionData[] = []

  table.rows.forEach((row) => {
    if (row.texts.length < 2) return

    const rawVerdict = columns.fallbackVerdictIdx >= 0 ? normalizeText(row.texts[columns.fallbackVerdictIdx]) : ''
    const verdict = normalizeGenericVerdict(rawVerdict)
    if (verdict === 'UNKNOWN' && !rawVerdict) return

    const platformSubmissionId = extractGenericSubmissionId(
      row,
      columns.idIdx >= 0 ? normalizeText(row.texts[columns.idIdx]) : '',
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
      language: columns.langIdx >= 0 ? normalizeText(row.texts[columns.langIdx]) : undefined,
      runtimeMs: columns.runtimeIdx >= 0 ? parseRuntimeMs(normalizeText(row.texts[columns.runtimeIdx])) : undefined,
      memoryKb: columns.memoryIdx >= 0 ? parseMemoryKb(normalizeText(row.texts[columns.memoryIdx])) : undefined,
      submittedAt: options.now(),
      sourceUrl: (row.links ?? []).find(Boolean),
      rawJson: JSON.stringify({ headers, row }),
    })
  })

  return submissions
}
