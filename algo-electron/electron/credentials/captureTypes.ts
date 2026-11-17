/** Payload sent from the isolated OJ preload to the main process. */
export interface OjCredentialCapturePayload {
  username: string
  password: string
}

export function isOjCredentialCapturePayload(value: unknown): value is OjCredentialCapturePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.username === 'string' &&
    typeof record.password === 'string' &&
    record.username.length <= 512 &&
    record.password.length <= 4096
  )
}
