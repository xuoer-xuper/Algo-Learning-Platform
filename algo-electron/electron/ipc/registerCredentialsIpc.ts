import { getShellWindowOwner, ipcMain } from './trustedSender'
import { CredentialVault } from '../credentials/CredentialVault'
import type { CredentialAutofillService } from '../credentials/autofill/CredentialAutofillService'

export interface RegisterCredentialsIpcOptions {
  getAutofillService?: () => CredentialAutofillService | null
}

export function registerCredentialsIpc(
  credentialVault = new CredentialVault(),
  options: RegisterCredentialsIpcOptions = {},
): void {
  ipcMain.handle('credentials:list', (_event, siteId?: unknown) => {
    if (siteId !== undefined && typeof siteId !== 'string') {
      throw new TypeError('credentials:list siteId must be a string')
    }
    return credentialVault.list(siteId as string | undefined)
  })

  ipcMain.handle('credentials:delete', (_event, credentialId: unknown) => {
    if (typeof credentialId !== 'string') {
      throw new TypeError('credentials:delete credentialId must be a string')
    }
    return credentialVault.delete(credentialId)
  })

  ipcMain.handle('credentials:rename', (_event, credentialId: unknown, displayName: unknown) => {
    if (typeof credentialId !== 'string' || typeof displayName !== 'string') return null
    return credentialVault.rename(credentialId, displayName)
  })

  ipcMain.handle('credentials:autofillPrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? options.getAutofillService?.()?.getCurrentPrompt(owner.id) ?? null : null
  })

  ipcMain.handle('credentials:autofillRespond', (event, requestId: unknown, credentialId: unknown) => {
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 128) return false
    if (credentialId !== null && typeof credentialId !== 'string') return false
    const owner = getShellWindowOwner(event)
    return owner
      ? options.getAutofillService?.()?.respondSelection(owner.id, requestId, credentialId as string | null) ?? false
      : false
  })
}
