export interface UserScriptRecord {
  id: string
  name: string
  enabled: boolean
  site_ids_json?: string | null
  has_file: boolean
}

export interface ScriptSite {
  id: string
  name?: string | null
  homeUrl?: string | null
}
