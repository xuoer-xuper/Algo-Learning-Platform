import { ipcMain } from './trustedSender'
import { CredentialVault } from '../credentials/CredentialVault'

export function registerCredentialsIpc(credentialVault = new CredentialVault()): void {
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
}
