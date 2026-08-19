import type { CredentialFormFillPayload } from './formFiller'

/** Main-process -> isolated OJ preload only. Never expose this in shell preload. */
export const OJ_CREDENTIAL_FILL_CHANNEL = 'oj-credentials:fill'

export type OjCredentialFillPayload = CredentialFormFillPayload
