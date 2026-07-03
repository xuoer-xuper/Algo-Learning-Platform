export interface UserScriptRecord {
  id: string
  name: string
  enabled: boolean
  site_ids_json?: string | null
  file_path?: string | null
  [key: string]: unknown
}

export interface ScriptSite {
  id: string
  name?: string | null
  home_url?: string | null
  [key: string]: unknown
}
