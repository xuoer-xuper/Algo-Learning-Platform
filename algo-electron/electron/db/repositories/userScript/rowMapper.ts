import type { UserScript, UserScriptRow } from './types'

export function normalizeUserScriptRow(row: UserScriptRow): UserScript {
  return {
    ...row,
    enabled: row.enabled === 1,
  }
}
