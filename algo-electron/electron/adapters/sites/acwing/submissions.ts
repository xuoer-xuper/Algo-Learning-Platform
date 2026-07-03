import type { SubmissionData } from '../../../shared/types'
import type { GenericTableData } from '../../../submissions/scrapers/GenericTableScanner'
import type { SubmissionDetectionPayload, TableParseContext } from '../../types'
import {
  createFrontendVerdictHookScript,
  parseFrontendVerdictPayload,
  parseRealtimeTablePayload,
  scanBestTable,
} from '../../shared/genericSubmission'

export function parseAcwingSubmissionTables(
  tables: GenericTableData[],
  ctx: TableParseContext,
): SubmissionData[] {
  return scanBestTable(tables, 'acwing', 'ac', ctx)
}

export function createAcwingRealtimeHookScript(): string {
  return createFrontendVerdictHookScript('acwing')
}

export function parseAcwingRealtimeSubmission(raw: SubmissionDetectionPayload): SubmissionData | null {
  const frontendSubmission = parseFrontendVerdictPayload(raw, 'acwing', 'ac')
  if (frontendSubmission) return frontendSubmission
  return parseRealtimeTablePayload(raw, parseAcwingSubmissionTables)
}
