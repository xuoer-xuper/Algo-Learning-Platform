import {
  CREDENTIAL_ENVELOPE_PROVIDER,
  CREDENTIAL_ENVELOPE_VERSION,
  type CredentialSecretEnvelopeV1,
} from './types'

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function serializeCredentialEnvelope(value: unknown): string {
  const envelope = parseCredentialEnvelope(value)
  return JSON.stringify({
    version: envelope.version,
    provider: envelope.provider,
    ciphertextBase64: envelope.ciphertextBase64,
  })
}

export function parseCredentialEnvelope(raw: unknown): CredentialSecretEnvelopeV1 {
  const value = typeof raw === 'string' ? parseJson(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Credential secret envelope must be an object')
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 3 || keys.join(',') !== 'ciphertextBase64,provider,version') {
    throw new TypeError('Credential secret envelope has an unsupported shape')
  }
  if (record.version !== CREDENTIAL_ENVELOPE_VERSION) {
    throw new TypeError('Credential secret envelope version is unsupported')
  }
  if (record.provider !== CREDENTIAL_ENVELOPE_PROVIDER) {
    throw new TypeError('Credential secret envelope provider is unsupported')
  }
  if (
    typeof record.ciphertextBase64 !== 'string'
    || record.ciphertextBase64.length === 0
    || record.ciphertextBase64.length % 4 !== 0
    || !BASE64_PATTERN.test(record.ciphertextBase64)
  ) {
    throw new TypeError('Credential secret envelope ciphertext must be non-empty base64')
  }

  return {
    version: CREDENTIAL_ENVELOPE_VERSION,
    provider: CREDENTIAL_ENVELOPE_PROVIDER,
    ciphertextBase64: record.ciphertextBase64,
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new TypeError('Credential secret envelope must be valid JSON')
  }
}
