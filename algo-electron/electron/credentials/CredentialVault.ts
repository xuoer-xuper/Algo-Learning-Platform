import { safeStorage } from 'electron'
import {
  CredentialVaultCore,
  createDefaultCredentialVaultDependencies,
  type CredentialRepository,
  type CredentialSafeStorage,
  type CredentialVaultDependencies,
} from './credentialVaultCore'

export * from './credentialVaultCore'

export interface CredentialVaultOptions {
  safeStorage?: CredentialSafeStorage
  repository?: Partial<CredentialRepository>
}

/**
 * Electron-bound default shell. All stateful behavior lives in
 * `credentialVaultCore.ts` so it can be tested without starting Electron.
 */
export class CredentialVault extends CredentialVaultCore {
  constructor(options: CredentialVaultOptions = {}) {
    const defaults = createDefaultCredentialVaultDependencies(safeStorage)
    const dependencies: CredentialVaultDependencies = {
      safeStorage: options.safeStorage ?? defaults.safeStorage,
      repository: {
        ...defaults.repository,
        ...options.repository,
      },
    }
    super(dependencies)
  }
}
