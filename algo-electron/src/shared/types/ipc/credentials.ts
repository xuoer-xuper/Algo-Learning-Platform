import { z } from 'zod'

/*
 * 凭据域各 channel 的输入 schema。消费方：electron/ipc/registerCredentialsIpc.ts。
 *
 * 复用的界，沿用本文件原先手写检查里的数字，不另立标准：
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
const credentialId = z.string().min(1).max(200)
const oneShotId = z.string().min(1).max(128)

export const listInput = [z.string().min(1).max(200).optional()] as const
export const deleteInput = [credentialId] as const
/*
 * R3 起 rename / autofillRespond / captureRespond 的 wire 形状是单对象参数（原先多参数
 * 按位置排列）。字段界与原先的元组逐位一致，只是搬进了对象；strictObject 拒绝多余字段。
 */
export const renameInput = [
  z.strictObject({ credentialId, displayName: z.string().min(1).max(200) }),
] as const
export const autofillRespondInput = [
  z.strictObject({ requestId: oneShotId, credentialId: credentialId.nullable() }),
] as const
export const captureRespondInput = [
  z.strictObject({ captureId: oneShotId, action: z.enum(['save', 'update', 'cancel']) }),
] as const
