import { z } from 'zod'
import { ERROR_CODE_VALUES } from '../constants/errorCodes'

/**
 * IPC 输出形状的统一入口（阶段 1 R4，design §4）。
 *
 * 之前 IPC 返回有两种互不兼容的形状：`{ ok }`（快照校验、userscript 协议）和
 * `{ success, ...散装字段 }`（backup / sites / rating / coach）。渲染层为了读一个
 * path 要先判 `success` 再读可选字段，失败原因也没有类别可循。这里把"调用结果"
 * 收敛成一个判别联合：
 *
 * - 成功：`{ success: true, data }`——业务载荷全部收进 `data`，不再散装；
 * - 失败：`{ success: false, error, code? }`——`error` 是给用户看的固定文案，
 *   绝不拼入原始异常文本；`code` 是 `ERROR_CODES` 的闭集（用户取消对话框时
 *   留空，见 errorCodes.ts 的说明）。
 *
 * 判别键用 `success` 而不是 `ok`：`{ success: … }` 一侧已经是多数（22:34 里的
 * 全部 IPC 面），且模板 `type-safety.md` 的窄化示例都以它为准。消费端窄化一律
 * 写 `result.success === true`（严格等号判别联合，模板红线）。
 *
 * v4.6.7 实测：`z.discriminatedUnion(discriminator, options)` 的两参形态与
 * design 草图一致，无需适配（v4 也支持省略 discriminator 的数组形态，这里保留
 * 显式键名，报错信息更可读）。
 */
export const createOutputSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('success', [
    z.object({ success: z.literal(true), data }),
    z.object({
      success: z.literal(false),
      error: z.string(),
      code: z.enum(ERROR_CODE_VALUES).optional(),
    }),
  ])

/**
 * 与 `createOutputSchema` 同源的 TS 侧类型：直接从 schema 推导，保证"类型"和
 * "schema"不会各自漂移。`z.ZodType<T>` 把任意 TS 类型升成 schema 形参，从而
 * `data` 落回 `T` 本身。
 *
 * 用法：`Promise<IpcOutput<{ path: string; count: number }>>`。
 * 渲染层环境（electron-env.d.ts 的全局声明）无法 import 本文件，那里的联合是
 * 手写镜像，由 `tests/ipc/ipcOutputShapes.test.ts` 在 IPC 边界用本 schema 实测
 * 兜底——两边漂移测试会红。
 */
export type IpcOutput<T> = z.infer<ReturnType<typeof createOutputSchema<z.ZodType<T>>>>
