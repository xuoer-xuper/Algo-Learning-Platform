import { z } from 'zod'

/*
 * 用户脚本域各 channel 的输入 schema。消费方：electron/ipc/registerScriptsIpc.ts。
 *
 * 复用的界，数字全部沿用本文件原先手写检查里的值，不另立标准：
 *
 * - `scriptId`：上限 200，与原 `validateScriptId` 一致。用 `/\S/` 正则而不是
 *   `min(1)`，因为原检查是 `id.trim().length === 0`——纯空白要拒。
 *   `min(1)` 会放过 `'   '`，那是一次查不到行的 DB 查询，不是拒绝。
 * - `installId`：上限 200（原 `installId.length > 200`），只拒空串，照搬原
 *   `installId.length === 0` 那一版：这个 id 由主进程生成并存进 registry，
 *   纯空白根本不可能匹配到任何待处理请求。
 * - 脚本名上限 200，与原 `record.name.length > 200` 一致，同样要求非纯空白。
 */

/** 非纯空白的标识符：上限 200，`/\S/` 挡掉纯空白（原 `validateScriptId` 的口径）。 */
const scriptId = z.string().max(200).regex(/\S/)
const installId = z.string().min(1).max(200)

const savePayload = z.strictObject({
  name: z.string().max(200).regex(/\S/),
  // JSON 文本自身的上限：站点 id 按 200 算，配 32 个站点也不到 8 KiB。
  site_ids_json: z
    .string()
    .min(1)
    .max(8 * 1024),
})

/* R3 起 save / toggle / confirmRemoteInstall 的 wire 形状是单对象参数。 */
export const saveInput = [z.strictObject({ id: scriptId, data: savePayload })] as const
export const getRemoteInstallPreviewInput = [installId] as const
export const confirmRemoteInstallInput = [
  z.strictObject({ installId, action: z.enum(['install', 'copy', 'cancel']) }),
] as const
export const cancelRemoteInstallInput = [installId] as const
export const getCodeInput = [scriptId] as const
export const openEditorInput = [scriptId] as const
export const toggleInput = [z.strictObject({ id: scriptId, enabled: z.boolean() })] as const
export const deleteInput = [scriptId] as const
