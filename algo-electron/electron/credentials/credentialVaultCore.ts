import {
  getCredentialById,
  listCredentials,
  markCredentialUsed,
  renameCredential,
  softDeleteCredential,
  upsertCredential,
  type SiteCredentialSummary,
} from '../db/repositories/credentialRepository'
import {
  CREDENTIAL_ENVELOPE_PROVIDER,
  CREDENTIAL_ENVELOPE_VERSION,
  parseCredentialEnvelope,
  type CredentialSecretEnvelopeV1,
} from '../db/repositories/credentialRepository'

export type CredentialVaultErrorCode =
  | 'invalid-input'
  | 'encryption-unavailable'
  | 'encryption-failed'
  | 'decryption-failed'
  | 'invalid-envelope'
  | 'rotation-failed'
  | 'storage-failed'

export class CredentialVaultError extends Error {
  readonly code: CredentialVaultErrorCode
  readonly errorCode: CredentialVaultErrorCode

  constructor(code: CredentialVaultErrorCode, message: string) {
    super(message)
    this.name = 'CredentialVaultError'
    this.code = code
    this.errorCode = code
  }
}

export interface CredentialSafeStorage {
  isEncryptionAvailable: () => boolean
  isAsyncEncryptionAvailable?: () => Promise<boolean>
  encryptStringAsync: (plainText: string) => Promise<Buffer>
  decryptStringAsync: (encrypted: Buffer) => Promise<{
    result: string
    shouldReEncrypt: boolean
  }>
}

export interface CredentialRepository {
  upsertCredential: typeof upsertCredential
  listCredentials: typeof listCredentials
  getCredentialById: typeof getCredentialById
  softDeleteCredential: typeof softDeleteCredential
  markCredentialUsed: typeof markCredentialUsed
  renameCredential: typeof renameCredential
}

export interface CredentialVaultDependencies {
  safeStorage: CredentialSafeStorage
  repository: CredentialRepository
}

export interface CredentialSaveInput {
  siteId: string
  username: string
  password: string
}

export interface CredentialSummary {
  credentialId: string
  siteId: string
  username: string
  displayName: string | null
  masked: string
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * This value is deliberately fixed. A summary is an existence signal only;
 * it must never become a password oracle or contain ciphertext metadata.
 */
export const MASKED_CREDENTIAL_SECRET = '********'

export interface CredentialAutofillValue {
  credentialId: string
  siteId: string
  username: string
  password: string
}

const defaultRepository: CredentialRepository = {
  upsertCredential,
  listCredentials,
  getCredentialById,
  softDeleteCredential,
  markCredentialUsed,
  renameCredential,
}

export class CredentialVaultCore {
  private readonly dependencies: CredentialVaultDependencies

  constructor(dependencies: CredentialVaultDependencies) {
    this.dependencies = dependencies
  }

  async save(input: CredentialSaveInput): Promise<CredentialSummary> {
    const validated = validateSaveInput(input)
    await this.ensureEncryptionAvailable()

    let encrypted: Buffer
    try {
      encrypted = await this.dependencies.safeStorage.encryptStringAsync(validated.password)
    } catch {
      throw new CredentialVaultError('encryption-failed', 'Credential encryption failed')
    }

    let id: string
    try {
      id = this.dependencies.repository.upsertCredential({
        siteId: validated.siteId,
        username: validated.username,
        secretEnvelope: createEnvelope(encrypted),
      })
    } catch {
      throw new CredentialVaultError('storage-failed', 'Credential could not be stored')
    }

    const summary = this.list(validated.siteId).find(entry => entry.credentialId === id)
    if (!summary) {
      throw new CredentialVaultError('storage-failed', 'Stored credential could not be read back')
    }
    return summary
  }

  list(siteId?: string): CredentialSummary[] {
    if (siteId !== undefined) validateIdentifier(siteId, 'siteId')
    try {
      return this.dependencies.repository.listCredentials(siteId).map(toSummary)
    } catch {
      throw new CredentialVaultError('storage-failed', 'Credentials could not be listed')
    }
  }

  delete(credentialId: string): boolean {
    validateIdentifier(credentialId, 'credentialId')
    try {
      return this.dependencies.repository.softDeleteCredential(credentialId)
    } catch {
      throw new CredentialVaultError('storage-failed', 'Credential could not be deleted')
    }
  }

  rename(credentialId: string, displayName: string): CredentialSummary | null {
    validateIdentifier(credentialId, 'credentialId')
    const normalized = normalizeDisplayName(displayName)
    try {
      if (!this.dependencies.repository.renameCredential(credentialId, normalized)) return null
      return this.list().find(entry => entry.credentialId === credentialId) ?? null
    } catch {
      throw new CredentialVaultError('storage-failed', 'Credential could not be renamed')
    }
  }

  /**
   * Main-process-only boundary for the later OJ preload bridge. The returned
   * password must never be passed through the shell renderer or a generic IPC
   * channel.
   */
  async getForAutofill(credentialId: string): Promise<CredentialAutofillValue | null> {
    validateIdentifier(credentialId, 'credentialId')

    let credential: ReturnType<CredentialRepository['getCredentialById']>
    try {
      credential = this.dependencies.repository.getCredentialById(credentialId)
    } catch {
      throw new CredentialVaultError('storage-failed', 'Credential could not be read')
    }
    if (!credential) return null

    const envelope = parseEnvelope(credential.secret_envelope)
    await this.ensureEncryptionAvailable()
    const decrypted = await this.decryptEnvelope(envelope)

    if (decrypted.shouldReEncrypt) {
      await this.reEncrypt(credential.site_id, credential.username, decrypted.password)
    }

    try {
      this.dependencies.repository.markCredentialUsed(credential.id)
    } catch {
      // A usage timestamp is telemetry, not a reason to expose or lose the
      // already decrypted credential. The secret boundary remains intact.
    }

    return {
      credentialId: credential.id,
      siteId: credential.site_id,
      username: credential.username,
      password: decrypted.password,
    }
  }

  private async decryptEnvelope(envelope: CredentialSecretEnvelopeV1): Promise<{
    password: string
    shouldReEncrypt: boolean
  }> {
    let firstResult: { result: string; shouldReEncrypt: boolean }
    try {
      firstResult = await this.dependencies.safeStorage.decryptStringAsync(
        Buffer.from(envelope.ciphertextBase64, 'base64'),
      )
    } catch {
      throw new CredentialVaultError('decryption-failed', 'Credential decryption failed')
    }

    if (!isDecryptResult(firstResult)) {
      throw new CredentialVaultError('decryption-failed', 'Credential decryption failed')
    }

    if (!firstResult.shouldReEncrypt) {
      return { password: firstResult.result, shouldReEncrypt: false }
    }

    // Electron asks callers to decrypt once more after key rotation so the
    // result is produced by the current key generation before re-encryption.
    try {
      const rotatedResult = await this.dependencies.safeStorage.decryptStringAsync(
        Buffer.from(envelope.ciphertextBase64, 'base64'),
      )
      if (!isDecryptResult(rotatedResult)) {
        throw new Error('invalid rotated decrypt result')
      }
      return { password: rotatedResult.result, shouldReEncrypt: true }
    } catch {
      throw new CredentialVaultError('rotation-failed', 'Credential key rotation failed')
    }
  }

  private async reEncrypt(siteId: string, username: string, password: string): Promise<void> {
    let encrypted: Buffer
    try {
      encrypted = await this.dependencies.safeStorage.encryptStringAsync(password)
    } catch {
      throw new CredentialVaultError('rotation-failed', 'Credential key rotation failed')
    }

    try {
      this.dependencies.repository.upsertCredential({
        siteId,
        username,
        secretEnvelope: createEnvelope(encrypted),
      })
    } catch {
      throw new CredentialVaultError('rotation-failed', 'Credential key rotation failed')
    }
  }

  private async ensureEncryptionAvailable(): Promise<void> {
    let available: boolean
    try {
      available = this.dependencies.safeStorage.isEncryptionAvailable()
      if (available && this.dependencies.safeStorage.isAsyncEncryptionAvailable) {
        available = await this.dependencies.safeStorage.isAsyncEncryptionAvailable()
      }
    } catch {
      throw new CredentialVaultError('encryption-unavailable', 'Secure credential storage is unavailable')
    }
    if (!available) {
      throw new CredentialVaultError('encryption-unavailable', 'Secure credential storage is unavailable')
    }
  }
}

export function createDefaultCredentialVaultDependencies(
  safeStorage: CredentialSafeStorage,
): CredentialVaultDependencies {
  return { safeStorage, repository: defaultRepository }
}

function createEnvelope(encrypted: Buffer): CredentialSecretEnvelopeV1 {
  return {
    version: CREDENTIAL_ENVELOPE_VERSION,
    provider: CREDENTIAL_ENVELOPE_PROVIDER,
    ciphertextBase64: encrypted.toString('base64'),
  }
}

function parseEnvelope(value: unknown): CredentialSecretEnvelopeV1 {
  try {
    return parseCredentialEnvelope(value)
  } catch {
    throw new CredentialVaultError('invalid-envelope', 'Credential envelope is unsupported')
  }
}

function toSummary(value: SiteCredentialSummary): CredentialSummary {
  return {
    credentialId: value.id,
    siteId: value.site_id,
    username: value.username,
    displayName: value.display_name ?? null,
    masked: MASKED_CREDENTIAL_SECRET,
    lastUsedAt: value.last_used_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  }
}

function validateSaveInput(input: CredentialSaveInput): CredentialSaveInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CredentialVaultError('invalid-input', 'Credential input is invalid')
  }
  const keys = Object.keys(input as object).sort()
  if (keys.length !== 3 || keys.join(',') !== 'password,siteId,username') {
    throw new CredentialVaultError('invalid-input', 'Credential input is invalid')
  }
  validateIdentifier(input.siteId, 'siteId')
  validateIdentifier(input.username, 'username')
  if (typeof input.password !== 'string' || input.password.length === 0 || input.password.length > 16 * 1024) {
    throw new CredentialVaultError('invalid-input', 'Credential password is invalid')
  }
  return {
    siteId: input.siteId,
    username: input.username,
    password: input.password,
  }
}

function validateIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new CredentialVaultError('invalid-input', `Credential ${field} is invalid`)
  }
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 128) {
    throw new CredentialVaultError('invalid-input', 'Credential display name is invalid')
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function isDecryptResult(value: unknown): value is { result: string; shouldReEncrypt: boolean } {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { result?: unknown }).result === 'string'
    && typeof (value as { shouldReEncrypt?: unknown }).shouldReEncrypt === 'boolean'
}
