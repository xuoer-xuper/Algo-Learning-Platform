export interface UserScript {
  id: string
  name: string
  namespace: string | null
  identity_name: string
  description: string | null
  version: string | null
  match_urls_json: string
  include_rules_json: string
  exclude_rules_json: string
  exclude_match_rules_json: string
  grant_json: string
  connect_json: string
  noframes: boolean
  run_at: string
  update_url: string | null
  download_url: string | null
  last_install_url: string | null
  antifeature_json: string
  icon_url: string | null
  code: string
  file_path: string | null
  site_ids_json: string | null
  enabled: boolean
  auto_update_enabled: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface UserScriptRow extends Omit<UserScript, 'enabled' | 'auto_update_enabled' | 'noframes'> {
  enabled: number
  auto_update_enabled: number
  noframes: number
}

type OptionalMetadataField =
  | 'include_rules_json'
  | 'exclude_rules_json'
  | 'exclude_match_rules_json'
  | 'grant_json'
  | 'connect_json'
  | 'noframes'
  | 'run_at'
  | 'update_url'
  | 'download_url'
  | 'last_install_url'
  | 'antifeature_json'
  | 'icon_url'

type UserScriptContentInput = Omit<
  UserScript,
  | 'id'
  | 'namespace'
  | 'identity_name'
  | 'auto_update_enabled'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | OptionalMetadataField
>
  & Partial<Pick<UserScript, OptionalMetadataField>>

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
