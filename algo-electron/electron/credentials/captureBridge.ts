import { IPC_CHANNELS } from '../../src/shared/constants/channels'
import type { OjCredentialCapturePayload } from './captureTypes'

/** OJ isolated preload -> main only. Never expose this channel in shell preload. */
export const OJ_CREDENTIAL_CAPTURE_CHANNEL = IPC_CHANNELS.OJ.CREDENTIALS_CAPTURE
export type { OjCredentialCapturePayload }
