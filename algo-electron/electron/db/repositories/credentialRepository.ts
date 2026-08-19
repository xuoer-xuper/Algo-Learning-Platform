export type {
  CredentialSecretEnvelopeV1,
  SiteCredential,
  SiteCredentialRow,
  SiteCredentialSummary,
  SiteCredentialWriteInput,
} from './credential/types'

export {
  CREDENTIAL_ENVELOPE_PROVIDER,
  CREDENTIAL_ENVELOPE_VERSION,
} from './credential/types'

export {
  parseCredentialEnvelope,
  serializeCredentialEnvelope,
} from './credential/serialization'

export {
  getCredentialById,
  getCredentialBySiteAndUsername,
  listCredentials,
} from './credential/queries'

export {
  markCredentialUsed,
  softDeleteCredential,
  upsertCredential,
} from './credential/mutations'
