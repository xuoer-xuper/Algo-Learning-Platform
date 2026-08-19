export const CREDENTIAL_ENVELOPE_VERSION = 1 as const
export const CREDENTIAL_ENVELOPE_PROVIDER = 'electron-safe-storage' as const

export interface CredentialSecretEnvelopeV1 {
  version: typeof CREDENTIAL_ENVELOPE_VERSION
  provider: typeof CREDENTIAL_ENVELOPE_PROVIDER
  ciphertextBase64: string
}

export interface SiteCredentialRow {
  id: string
  site_id: string
  username: string
  display_name: string | null
  secret_envelope: string | null
  last_used_at: string | null
  sync_excluded: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SiteCredential {
  id: string
  site_id: string
  username: string
  display_name: string | null
  secret_envelope: CredentialSecretEnvelopeV1
  last_used_at: string | null
  sync_excluded: true
  created_at: string
  updated_at: string
}

export interface SiteCredentialSummary {
  id: string
  site_id: string
  username: string
  display_name: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface SiteCredentialWriteInput {
  siteId: string
  username: string
  secretEnvelope: CredentialSecretEnvelopeV1
}
