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
