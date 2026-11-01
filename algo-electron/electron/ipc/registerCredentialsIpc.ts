import { getShellWindowOwner, ipcMain, onFromOj } from './trustedSender'
import {
  autofillRespondInput,
  captureRespondInput,
  deleteInput,
  listInput,
  renameInput,
} from '../../src/shared/types/ipc/credentials'
import { CredentialVault } from '../credentials/CredentialVault'
import type { CredentialAutofillService } from '../credentials/autofill/CredentialAutofillService'
import type { CredentialCaptureService } from '../credentials/CredentialCaptureService'

export interface RegisterCredentialsIpcOptions {
  getAutofillService?: () => CredentialAutofillService | null
  getCaptureService?: () => CredentialCaptureService | null
}

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/credentials.ts`；
 * credentialId 200 / oneShotId 128 两个界的来历与"非法输入从返回 false 改为拒绝"的
 * 理由写在那里。
 */
export function registerCredentialsIpc(
  credentialVault = new CredentialVault(),
  options: RegisterCredentialsIpcOptions = {},
): void {
  ipcMain.handle('credentials:list', listInput, (_event, siteId) => {
    return credentialVault.list(siteId)
  })

  ipcMain.handle('credentials:delete', deleteInput, (_event, id) => {
    return credentialVault.delete(id)
  })

  ipcMain.handle('credentials:rename', renameInput, (_event, id, displayName) => {
    return credentialVault.rename(id, displayName)
  })

  ipcMain.handle('credentials:autofillPrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? (options.getAutofillService?.()?.getCurrentPrompt(owner.id) ?? null) : null
  })

  ipcMain.handle(
    'credentials:autofillRespond',
    autofillRespondInput,
    (event, requestId, chosen) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? (options.getAutofillService?.()?.respondSelection(owner.id, requestId, chosen) ?? false)
        : false
    },
  )

  ipcMain.handle('credentials:capturePrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? (options.getCaptureService?.()?.getCurrentPrompt(owner.id) ?? null) : null
  })

  ipcMain.handle(
    'credentials:captureRespond',
    captureRespondInput,
    async (event, captureId, action) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? ((await options.getCaptureService?.()?.respondCapture(owner.id, captureId, action)) ??
            false)
        : false
    },
  )

  /*
   * 明文载荷不在这里校验：`CredentialCaptureService.receiveCapture` 要按站点选择器、
   * 会话归属和是否已存在同名凭据一并判断，不是单纯的形状问题。
   * `onFromOj` 目前只有单一形态（无 schema 元组），所以这里没有可声明的位置——
   * 它也不在壳 renderer 的可达范围内，由 `checkOjSender` 限定只有 persist:oj-main 主 frame 能发。
   */
  onFromOj('oj-credentials:capture', (event, payload: unknown) => {
    void options.getCaptureService?.()?.receiveCapture(event.sender, payload)
  })
}
