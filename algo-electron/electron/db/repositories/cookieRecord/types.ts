export interface CookieRecord {
  id: string
  site_id: string
  domain: string
  name: string
  value_encrypted: string | null
  expires_at: number | null
  http_only: number
  secure: number
  same_site: string | null
  last_seen_at: number
  purpose: string | null
  sync_excluded: number
  created_at: number
  updated_at: number
}

export interface CookieMetadataInput {
  siteId: string
  domain: string
  name: string
  expiresAt?: number | null
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string | null
  purpose?: string | null
}
