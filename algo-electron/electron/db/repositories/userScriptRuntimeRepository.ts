import crypto from 'node:crypto'
import { getDb } from '../connection'
import { nowChinaStandardTime } from '../../shared/time'

export type UserScriptResourceKind = 'require' | 'resource'
export type UserScriptResourceEncoding = 'binary' | 'utf8'
export type UserScriptUpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error'

interface UserScriptValueRow {
  id: string
  script_id: string
  value_key: string
  value_json: string
  created_at: string
  updated_at: string
}

export interface UserScriptValue extends Omit<UserScriptValueRow, 'value_json'> {
  value: unknown
}

export interface UserScriptResource {
  id: string
  script_id: string
  resource_kind: UserScriptResourceKind
  resource_key: string
  declaration_order: number
  source_url: string
  content_blob: Uint8Array | null
  content_encoding: UserScriptResourceEncoding
  content_type: string | null
  integrity: string | null
  fetched_at: string | null
  created_at: string
  updated_at: string
}

export interface UserScriptResourceWriteInput {
  scriptId: string
  kind: UserScriptResourceKind
  key: string
  declarationOrder: number
  sourceUrl: string
  content?: Uint8Array | null
  contentEncoding?: UserScriptResourceEncoding
  contentType?: string | null
  integrity?: string | null
  fetchedAt?: string | null
}

export interface UserScriptHostPermission {
  id: string
  script_id: string
  host_pattern: string
  granted_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface UserScriptUpdateState {
  script_id: string
  last_checked_at: string | null
  next_check_at: string | null
  etag: string | null
  last_modified: string | null
  available_version: string | null
  status: UserScriptUpdateStatus
  last_error: string | null
  updated_at: string
}

export interface UserScriptUpdateStateInput {
  scriptId: string
  lastCheckedAt?: string | null
  nextCheckAt?: string | null
  etag?: string | null
  lastModified?: string | null
  availableVersion?: string | null
  status?: UserScriptUpdateStatus
  lastError?: string | null
}

export function setUserScriptValue(scriptId: string, key: string, value: unknown): string {
  const normalizedScriptId = requireNonEmpty(scriptId, 'scriptId')
  const normalizedKey = requireNonEmpty(key, 'key')
  const valueJson = serializeJson(value)
  const db = getDb()
  const now = nowChinaStandardTime()
  const existing = db.prepare(`
    SELECT id FROM user_script_values
    WHERE script_id = ? AND value_key = ?
  `).get(normalizedScriptId, normalizedKey) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE user_script_values
      SET value_json = ?, updated_at = ?
      WHERE id = ?
    `).run(valueJson, now, existing.id)
    return existing.id
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO user_script_values (
      id, script_id, value_key, value_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, normalizedScriptId, normalizedKey, valueJson, now, now)
  return id
}

export function getUserScriptValue(scriptId: string, key: string): UserScriptValue | null {
  const row = getDb().prepare(`
    SELECT * FROM user_script_values
    WHERE script_id = ? AND value_key = ?
  `).get(scriptId, key) as UserScriptValueRow | undefined
  return row ? normalizeValue(row) : null
}

export function listUserScriptValues(scriptId: string): UserScriptValue[] {
  const rows = getDb().prepare(`
    SELECT * FROM user_script_values
    WHERE script_id = ?
    ORDER BY value_key ASC
  `).all(scriptId) as UserScriptValueRow[]
  return rows.map(normalizeValue)
}

export function deleteUserScriptValue(scriptId: string, key: string): boolean {
  const result = getDb().prepare(`
    DELETE FROM user_script_values
    WHERE script_id = ? AND value_key = ?
  `).run(scriptId, key)
  return result.changes > 0
}

export function upsertUserScriptResource(input: UserScriptResourceWriteInput): string {
  const scriptId = requireNonEmpty(input.scriptId, 'scriptId')
  const key = requireNonEmpty(input.key, 'key')
  const sourceUrl = requireNonEmpty(input.sourceUrl, 'sourceUrl')
  if (!Number.isSafeInteger(input.declarationOrder) || input.declarationOrder < 0) {
    throw new TypeError('Userscript resource declarationOrder must be a non-negative integer')
  }

  const db = getDb()
  const now = nowChinaStandardTime()
  const existing = db.prepare(`
    SELECT id FROM user_script_resources
    WHERE script_id = ? AND resource_kind = ? AND resource_key = ?
  `).get(scriptId, input.kind, key) as { id: string } | undefined
  const content = input.content === undefined || input.content === null
    ? null
    : Buffer.from(input.content)
  const values = [
    input.declarationOrder,
    sourceUrl,
    content,
    input.contentEncoding ?? 'binary',
    input.contentType ?? null,
    input.integrity ?? null,
    input.fetchedAt ?? null,
    now,
  ] as const

  if (existing) {
    db.prepare(`
      UPDATE user_script_resources
      SET declaration_order = ?, source_url = ?, content_blob = ?,
          content_encoding = ?, content_type = ?, integrity = ?, fetched_at = ?, updated_at = ?
      WHERE id = ?
    `).run(...values, existing.id)
    return existing.id
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO user_script_resources (
      id, script_id, resource_kind, resource_key, declaration_order,
      source_url, content_blob, content_encoding, content_type, integrity,
      fetched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, scriptId, input.kind, key, ...values.slice(0, 7), now, now)
  return id
}

export function listUserScriptResources(
  scriptId: string,
  kind?: UserScriptResourceKind,
): UserScriptResource[] {
  const rows = kind
    ? getDb().prepare(`
        SELECT * FROM user_script_resources
        WHERE script_id = ? AND resource_kind = ?
        ORDER BY declaration_order ASC, id ASC
      `).all(scriptId, kind)
    : getDb().prepare(`
        SELECT * FROM user_script_resources
        WHERE script_id = ?
        ORDER BY resource_kind ASC, declaration_order ASC, id ASC
      `).all(scriptId)
  return rows as UserScriptResource[]
}

export function deleteUserScriptResources(scriptId: string): number {
  return getDb().prepare('DELETE FROM user_script_resources WHERE script_id = ?').run(scriptId).changes
}

export function grantUserScriptHost(scriptId: string, hostPattern: string): string {
  const normalizedScriptId = requireNonEmpty(scriptId, 'scriptId')
  const normalizedHost = normalizeHostPattern(hostPattern)
  const db = getDb()
  const now = nowChinaStandardTime()
  const existing = db.prepare(`
    SELECT id FROM user_script_host_permissions
    WHERE script_id = ? AND host_pattern = ?
  `).get(normalizedScriptId, normalizedHost) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE user_script_host_permissions
      SET granted_at = ?, revoked_at = NULL
      WHERE id = ?
    `).run(now, existing.id)
    return existing.id
  }

  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO user_script_host_permissions (
      id, script_id, host_pattern, granted_at, last_used_at, revoked_at
    ) VALUES (?, ?, ?, ?, NULL, NULL)
  `).run(id, normalizedScriptId, normalizedHost, now)
  return id
}

export function revokeUserScriptHost(scriptId: string, hostPattern: string): boolean {
  const result = getDb().prepare(`
    UPDATE user_script_host_permissions
    SET revoked_at = ?
    WHERE script_id = ? AND host_pattern = ? AND revoked_at IS NULL
  `).run(nowChinaStandardTime(), scriptId, normalizeHostPattern(hostPattern))
  return result.changes > 0
}

export function markUserScriptHostUsed(scriptId: string, hostPattern: string): boolean {
  const result = getDb().prepare(`
    UPDATE user_script_host_permissions
    SET last_used_at = ?
    WHERE script_id = ? AND host_pattern = ? AND revoked_at IS NULL
  `).run(nowChinaStandardTime(), scriptId, normalizeHostPattern(hostPattern))
  return result.changes > 0
}

export function hasUserScriptHostPermission(scriptId: string, hostPattern: string): boolean {
  return Boolean(getDb().prepare(`
    SELECT 1 FROM user_script_host_permissions
    WHERE script_id = ? AND host_pattern = ? AND revoked_at IS NULL
  `).get(scriptId, normalizeHostPattern(hostPattern)))
}

export function listUserScriptHostPermissions(scriptId: string): UserScriptHostPermission[] {
  return getDb().prepare(`
    SELECT * FROM user_script_host_permissions
    WHERE script_id = ? AND revoked_at IS NULL
    ORDER BY host_pattern ASC
  `).all(scriptId) as UserScriptHostPermission[]
}

export function getUserScriptUpdateState(scriptId: string): UserScriptUpdateState | null {
  return getDb().prepare(`
    SELECT * FROM user_script_update_state
    WHERE script_id = ?
  `).get(scriptId) as UserScriptUpdateState | undefined ?? null
}

export function upsertUserScriptUpdateState(input: UserScriptUpdateStateInput): void {
  const scriptId = requireNonEmpty(input.scriptId, 'scriptId')
  const existing = getUserScriptUpdateState(scriptId)
  const value = <T>(next: T | undefined, current: T | undefined, fallback: T): T => (
    next === undefined ? current ?? fallback : next
  )
  const now = nowChinaStandardTime()

  getDb().prepare(`
    INSERT INTO user_script_update_state (
      script_id, last_checked_at, next_check_at, etag, last_modified,
      available_version, status, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(script_id) DO UPDATE SET
      last_checked_at = excluded.last_checked_at,
      next_check_at = excluded.next_check_at,
      etag = excluded.etag,
      last_modified = excluded.last_modified,
      available_version = excluded.available_version,
      status = excluded.status,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(
    scriptId,
    value(input.lastCheckedAt, existing?.last_checked_at, null),
    value(input.nextCheckAt, existing?.next_check_at, null),
    value(input.etag, existing?.etag, null),
    value(input.lastModified, existing?.last_modified, null),
    value(input.availableVersion, existing?.available_version, null),
    value(input.status, existing?.status, 'idle'),
    value(input.lastError, existing?.last_error, null),
    now,
  )
}

function normalizeValue(row: UserScriptValueRow): UserScriptValue {
  const { value_json: valueJson, ...rest } = row
  return { ...rest, value: JSON.parse(valueJson) as unknown }
}

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('Userscript value must be JSON serializable')
  return serialized
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Userscript runtime ${field} must be a non-empty string`)
  }
  return value
}

function normalizeHostPattern(value: string): string {
  return requireNonEmpty(value, 'hostPattern').trim().toLowerCase()
}
