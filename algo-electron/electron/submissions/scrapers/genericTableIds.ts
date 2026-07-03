import type { GenericTableRow, GenericTableScanOptions } from './genericTableTypes'
import { normalizeText } from './genericTableValueParsers'

export function extractGenericSubmissionId(
  row: GenericTableRow,
  idText: string,
  options: GenericTableScanOptions,
): string | null {
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
