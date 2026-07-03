import type { SubmissionData } from '../../../shared/types'
import type { TableParseContext } from '../../types'
import type { GenericTableData } from '../../../submissions/scrapers/GenericTableScanner'
import { scanGenericSubmissionTable, selectBestSubmissionTable } from '../../../submissions/scrapers/GenericTableScanner'
import { findColumnIndex } from '../../shared/genericSubmission'

export function parseNowcoderSubmissionTables(
  tables: GenericTableData[],
  ctx: TableParseContext,
): SubmissionData[] {
  const table = selectBestSubmissionTable(tables)
  if (!table) return []

  const probIdx = findColumnIndex(table.headers || [], ['题号'])
  return scanGenericSubmissionTable(table, {
    platform: 'nowcoder',
    submissionPrefix: 'nc',
    now: ctx.now,
  }).map((submission) => {
    let texts: string[] = []
    try {
      texts = JSON.parse(submission.rawJson || '{}')?.row?.texts || []
    } catch { /* ignore */ }
    return {
      ...submission,
      _ncProbLetter: probIdx >= 0 ? texts[probIdx] : undefined,
    } as SubmissionData & { _ncProbLetter?: string }
  })
}
