import crypto from 'node:crypto'
import { getDb } from '../../connection'
import { nowChinaStandardTime } from '../../../shared/time'
import type { UserScriptUpdateInput, UserScriptWriteInput } from './types'

export function createScript(data: UserScriptWriteInput): string {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = nowChinaStandardTime()
  const namespace = data.namespace === undefined
    ? `local:${id}`
    : data.namespace
  const identityName = data.identity_name ?? data.name
  const autoUpdateEnabled = data.auto_update_enabled ?? namespace?.startsWith('local:') !== true

  db.prepare(`
    INSERT INTO user_scripts (
      id, name, namespace, identity_name, description, version,
      match_urls_json, include_rules_json, exclude_rules_json,
      exclude_match_rules_json, grant_json, connect_json, noframes,
      run_at, update_url, download_url, last_install_url,
      antifeature_json, icon_url, code, file_path, site_ids_json, enabled,
      auto_update_enabled, created_at, updated_at, deleted_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      NULL
    )
  `).run(
    id,
    data.name,
    namespace,
    identityName,
    data.description,
    data.version,
    data.match_urls_json,
    data.include_rules_json ?? '[]',
    data.exclude_rules_json ?? '[]',
    data.exclude_match_rules_json ?? '[]',
    data.grant_json ?? '[]',
    data.connect_json ?? '[]',
    data.noframes ? 1 : 0,
    data.run_at ?? 'document-idle',
    data.update_url ?? null,
    data.download_url ?? null,
    data.last_install_url ?? null,
    data.antifeature_json ?? '[]',
    data.icon_url ?? null,
    data.code,
    data.file_path || null,
    data.site_ids_json || null,
    data.enabled ? 1 : 0,
    autoUpdateEnabled ? 1 : 0,
    now,
    now,
  )
  return id
}

export function updateScript(id: string, data: UserScriptUpdateInput): boolean {
  const db = getDb()
  const now = nowChinaStandardTime()

  const sets: string[] = []
  const values: Array<string | number | null> = []

  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name) }
  if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description) }
  if (data.version !== undefined) { sets.push('version = ?'); values.push(data.version) }
  if (data.match_urls_json !== undefined) { sets.push('match_urls_json = ?'); values.push(data.match_urls_json) }
  if (data.include_rules_json !== undefined) { sets.push('include_rules_json = ?'); values.push(data.include_rules_json) }
  if (data.exclude_rules_json !== undefined) { sets.push('exclude_rules_json = ?'); values.push(data.exclude_rules_json) }
  if (data.exclude_match_rules_json !== undefined) {
    sets.push('exclude_match_rules_json = ?')
    values.push(data.exclude_match_rules_json)
  }
  if (data.grant_json !== undefined) { sets.push('grant_json = ?'); values.push(data.grant_json) }
  if (data.connect_json !== undefined) { sets.push('connect_json = ?'); values.push(data.connect_json) }
  if (data.noframes !== undefined) { sets.push('noframes = ?'); values.push(data.noframes ? 1 : 0) }
  if (data.run_at !== undefined) { sets.push('run_at = ?'); values.push(data.run_at) }
  if (data.update_url !== undefined) { sets.push('update_url = ?'); values.push(data.update_url) }
  if (data.download_url !== undefined) { sets.push('download_url = ?'); values.push(data.download_url) }
  if (data.last_install_url !== undefined) { sets.push('last_install_url = ?'); values.push(data.last_install_url) }
  if (data.antifeature_json !== undefined) { sets.push('antifeature_json = ?'); values.push(data.antifeature_json) }
  if (data.icon_url !== undefined) { sets.push('icon_url = ?'); values.push(data.icon_url) }
  if (data.code !== undefined) { sets.push('code = ?'); values.push(data.code) }
  if (data.file_path !== undefined) { sets.push('file_path = ?'); values.push(data.file_path) }
  if (data.site_ids_json !== undefined) { sets.push('site_ids_json = ?'); values.push(data.site_ids_json) }
  if (data.enabled !== undefined) { sets.push('enabled = ?'); values.push(data.enabled ? 1 : 0) }
  if (data.auto_update_enabled !== undefined) {
    sets.push('auto_update_enabled = ?')
    values.push(data.auto_update_enabled ? 1 : 0)
  }

  if (sets.length === 0) return true

  sets.push('updated_at = ?')
  values.push(now)
  values.push(id)

  const info = db.prepare(`
    UPDATE user_scripts
    SET ${sets.join(', ')}
    WHERE id = ? AND deleted_at IS NULL
  `).run(...values)
  return info.changes > 0
}

export function toggleScript(id: string, enabled: boolean): boolean {
  return updateScript(id, { enabled })
}

export function deleteScript(id: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM user_scripts WHERE id = ?').run(id)
  return info.changes > 0
}

export function claimLegacyScriptIdentity(id: string, namespace: string): boolean {
  if (namespace.startsWith('local:')) return false
  const db = getDb()
  const info = db.prepare(`
    UPDATE OR IGNORE user_scripts
    SET namespace = ?, updated_at = ?
    WHERE id = ?
      AND namespace IS NULL
      AND deleted_at IS NULL
  `).run(namespace, nowChinaStandardTime(), id)
  return info.changes > 0
}

/**
 * Claims a legacy canonical identity and updates its imported content as one
 * SQLite transaction. A failed claim or update rolls the namespace change
 * back so a cancelled/failed import cannot leave a half-migrated row.
 */
export function updateScriptWithLegacyClaim(
  id: string,
  namespace: string,
  data: UserScriptUpdateInput,
): boolean {
  if (namespace.startsWith('local:')) return false

  const db = getDb()
  const transaction = db.transaction(() => {
    const claim = db.prepare(`
      UPDATE user_scripts
      SET namespace = ?, updated_at = ?
      WHERE id = ?
        AND namespace IS NULL
        AND deleted_at IS NULL
    `).run(namespace, nowChinaStandardTime(), id)
    if (claim.changes !== 1) throw new Error('Legacy userscript identity is no longer available')

    const sets: string[] = []
    const values: Array<string | number | null> = []
    if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description) }
    if (data.version !== undefined) { sets.push('version = ?'); values.push(data.version) }
    if (data.match_urls_json !== undefined) { sets.push('match_urls_json = ?'); values.push(data.match_urls_json) }
    if (data.include_rules_json !== undefined) { sets.push('include_rules_json = ?'); values.push(data.include_rules_json) }
    if (data.exclude_rules_json !== undefined) { sets.push('exclude_rules_json = ?'); values.push(data.exclude_rules_json) }
    if (data.exclude_match_rules_json !== undefined) {
      sets.push('exclude_match_rules_json = ?')
      values.push(data.exclude_match_rules_json)
    }
    if (data.grant_json !== undefined) { sets.push('grant_json = ?'); values.push(data.grant_json) }
    if (data.connect_json !== undefined) { sets.push('connect_json = ?'); values.push(data.connect_json) }
    if (data.noframes !== undefined) { sets.push('noframes = ?'); values.push(data.noframes ? 1 : 0) }
    if (data.run_at !== undefined) { sets.push('run_at = ?'); values.push(data.run_at) }
    if (data.update_url !== undefined) { sets.push('update_url = ?'); values.push(data.update_url) }
    if (data.download_url !== undefined) { sets.push('download_url = ?'); values.push(data.download_url) }
    if (data.last_install_url !== undefined) { sets.push('last_install_url = ?'); values.push(data.last_install_url) }
    if (data.antifeature_json !== undefined) { sets.push('antifeature_json = ?'); values.push(data.antifeature_json) }
    if (data.icon_url !== undefined) { sets.push('icon_url = ?'); values.push(data.icon_url) }
    if (data.code !== undefined) { sets.push('code = ?'); values.push(data.code) }
    if (data.file_path !== undefined) { sets.push('file_path = ?'); values.push(data.file_path) }

    if (sets.length === 0) throw new Error('Imported userscript update has no content changes')
    sets.push('updated_at = ?')
    values.push(nowChinaStandardTime())
    values.push(id)

    const update = db.prepare(`
      UPDATE user_scripts
      SET ${sets.join(', ')}
      WHERE id = ? AND deleted_at IS NULL AND namespace = ?
    `).run(...values, namespace)
    if (update.changes !== 1) throw new Error('Legacy userscript update failed')
  })

  try {
    transaction()
    return true
  }
  catch {
    return false
  }
}
