import type { UserScript, UserScriptRow } from './types'

export function normalizeUserScriptRow(row: UserScriptRow): UserScript {
  const { enabled, auto_update_enabled: autoUpdateEnabled, noframes, ...rest } = row
  return {
    ...rest,
    enabled: enabled === 1,
    auto_update_enabled: autoUpdateEnabled === 1,
    noframes: noframes === 1,
  }
}
