import { getShellWindowOwner, ipcMain, onFromOj } from './trustedSender'
import { nullable, oneOf, optional, text } from './payloadSchema'
import { CredentialVault } from '../credentials/CredentialVault'
import type { CredentialAutofillService } from '../credentials/autofill/CredentialAutofillService'
import type { CredentialCaptureService } from '../credentials/CredentialCaptureService'

export interface RegisterCredentialsIpcOptions {
  getAutofillService?: () => CredentialAutofillService | null
  getCaptureService?: () => CredentialCaptureService | null
}

/*
 * 两个复用的界，沿用本文件原先手写检查里的数字，不另立标准：
 *
 * - `credentialId`：Vault 生成的 id，上限按通用标识符 200。
 * - `oneShotId`：`requestId` / `captureId` 这类一次性令牌，原先手写的是
 *   `length === 0 || length > 128`，照搬 128。
 *
 * 迁移改变了非法输入的表现：原先 `rename` 返回 null、两个 respond 返回 false，
 * 现在一律在进 handler 之前被拒。这是刻意的——这些值只可能来自壳 renderer 自己的代码，
 * 形状不对说明我们的代码有 bug，而返回 false 会和"服务说不"（没有待处理的 prompt、
 * owner 已销毁）混在一起看不出区别。App.tsx 两处调用点本来就 catch，不会产生
 * 无人接管的 rejection；captureRespond 那处 catch 还会把错误提示显示出来，正是想要的。
 */
const credentialId = () => text({ max: 200 })
const oneShotId = () => text({ max: 128 })

export function registerCredentialsIpc(
  credentialVault = new CredentialVault(),
  options: RegisterCredentialsIpcOptions = {},
): void {
  ipcMain.handle('credentials:list', [optional(text())], (_event, siteId) => {
    return credentialVault.list(siteId)
  })

  ipcMain.handle('credentials:delete', [credentialId()], (_event, id) => {
    return credentialVault.delete(id)
  })

  ipcMain.handle('credentials:rename', [credentialId(), text({ max: 200 })], (_event, id, displayName) => {
    return credentialVault.rename(id, displayName)
  })

  ipcMain.handle('credentials:autofillPrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? options.getAutofillService?.()?.getCurrentPrompt(owner.id) ?? null : null
  })

  ipcMain.handle(
    'credentials:autofillRespond',
    [oneShotId(), nullable(credentialId())],
    (event, requestId, chosen) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? options.getAutofillService?.()?.respondSelection(owner.id, requestId, chosen) ?? false
        : false
    },
  )

  ipcMain.handle('credentials:capturePrompt', (event) => {
    const owner = getShellWindowOwner(event)
    return owner ? options.getCaptureService?.()?.getCurrentPrompt(owner.id) ?? null : null
  })

  ipcMain.handle(
    'credentials:captureRespond',
    [oneShotId(), oneOf(['save', 'update', 'cancel'] as const)],
    async (event, captureId, action) => {
      const owner = getShellWindowOwner(event)
      return owner
        ? await options.getCaptureService?.()?.respondCapture(owner.id, captureId, action) ?? false
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
