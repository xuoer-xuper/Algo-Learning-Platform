import type { OjCredentialCapturePayload } from './captureTypes'

/** OJ isolated preload -> main only. Never expose this channel in shell preload. */
export const OJ_CREDENTIAL_CAPTURE_CHANNEL = 'oj-credentials:capture'
export type { OjCredentialCapturePayload }
