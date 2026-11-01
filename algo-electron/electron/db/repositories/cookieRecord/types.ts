export interface CookieRecord {
  id: string
  site_id: string
  domain: string
  name: string
  value_encrypted: string | null
  expires_at: string | null
  http_only: number
  secure: number
  same_site: string | null
  last_seen_at: string
  purpose: string | null
  sync_excluded: number
  created_at: string
  updated_at: string
}

export interface CookieMetadataInput {
  siteId: string
  domain: string
  name: string
  expiresAt?: string | null
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string | null
  purpose?: string | null
}
