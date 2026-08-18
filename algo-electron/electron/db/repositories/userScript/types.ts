export interface UserScript {
  id: string
  name: string
  namespace: string | null
  identity_name: string
  description: string | null
  version: string | null
  match_urls_json: string
  code: string
  file_path: string | null
  site_ids_json: string | null
  enabled: boolean
  auto_update_enabled: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface UserScriptRow extends Omit<UserScript, 'enabled' | 'auto_update_enabled'> {
  enabled: number
  auto_update_enabled: number
}

type UserScriptContentInput = Omit<
  UserScript,
  | 'id'
  | 'namespace'
  | 'identity_name'
  | 'auto_update_enabled'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
>

export type UserScriptWriteInput = UserScriptContentInput & {
  /** undefined creates a local copy; null represents the legacy canonical identity. */
  namespace?: string | null
  /** Stable import identity; defaults to the initial display name. */
  identity_name?: string
  /** Defaults to false for local copies and true for canonical identities. */
  auto_update_enabled?: boolean
}

export type UserScriptUpdateInput = Partial<
  Omit<UserScriptWriteInput, 'namespace' | 'identity_name'>
>
