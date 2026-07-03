export interface UserScript {
  id: string
  name: string
  description: string | null
  version: string | null
  match_urls_json: string
  code: string
  file_path: string | null
  site_ids_json: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface UserScriptRow extends Omit<UserScript, 'enabled'> {
  enabled: number
}

export type UserScriptWriteInput = Omit<UserScript, 'id' | 'created_at' | 'updated_at'>

export type UserScriptUpdateInput = Partial<UserScriptWriteInput>
