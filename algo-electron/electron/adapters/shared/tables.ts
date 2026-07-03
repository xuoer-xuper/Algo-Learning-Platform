import type { SubmissionData } from '../../shared/types'
import { nowBeijing } from '../../shared/time'
import { pickFinalRealtimeSubmission } from '../../submissions/realtimeSubmissionFilter'
import {
  scanGenericSubmissionTable,
  selectBestSubmissionTable,
  type GenericTableData,
} from '../../submissions/scrapers/GenericTableScanner'
import type { SubmissionDetectionPayload, TableParseContext } from '../types'
export function scanBestTable(
  tables: GenericTableData[],
  platform: string,
  submissionPrefix: string,
  ctx: TableParseContext,
): SubmissionData[] {
  const table = selectBestSubmissionTable(tables)
  if (!table) return []

  return scanGenericSubmissionTable(table, {
    platform,
    submissionPrefix,
    now: ctx.now,
  })
}

export function parseRealtimeTablePayload(
  raw: SubmissionDetectionPayload,
  parseTables: (tables: GenericTableData[], ctx: TableParseContext) => SubmissionData[],
): SubmissionData | null {
  const response = raw.response && typeof raw.response === 'object'
    ? raw.response as { tables?: unknown }
    : null
  if (!Array.isArray(response?.tables)) return null

  const table = selectBestSubmissionTable(response.tables as GenericTableData[])
  if (!table?.rows.length) return null

  const latestOnlyTable: GenericTableData = {
    ...table,
    rows: [table.rows[0]],
  }
  const submissions = parseTables([latestOnlyTable], { now: nowBeijing })
  return pickFinalRealtimeSubmission(submissions)
}

