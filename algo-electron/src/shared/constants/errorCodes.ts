/**
 * IPC 失败分支 `code` 字段的闭集。
 *
 * 渲染层拿到的失败结果只该有这六类，`createOutputSchema`（`src/shared/types/common.ts`）
 * 在 schema 层也按这份清单收口。新增类别必须在这里登记，让"哪些失败类别存在"成为
 * 一个可 grep 的事实，而不是散落在各 handler 里的自由字符串。
 *
 * 用户取消系统对话框（保存/打开）不是失败类别：它没有可恢复动作，`code` 留空，
 * 由 `error` 文案说明发生了什么。
 */
export const ERROR_CODES = {
  /** 参数/载荷没有通过校验（含导入文件内容不合法这类"输入数据"问题） */
  VALIDATION: 'VALIDATION',
  /** 目标资源不存在，含"前置状态缺失"（如没有待确认的导入数据） */
  NOT_FOUND: 'NOT_FOUND',
  /** 业务冲突（如导入遇到主键冲突且未选择覆盖） */
  CONFLICT: 'CONFLICT',
  /** 本机文件/数据库读写失败 */
  IO: 'IO',
  /** 外部依赖失败（网络 API、LLM 服务等） */
  EXTERNAL: 'EXTERNAL',
  /** 发送方无权执行该操作（如无法归属到宿主窗口） */
  FORBIDDEN: 'FORBIDDEN',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * `z.enum` 需要的元组形式。手写而不是 `Object.values` 转型：`satisfies` 只保证
 * 元素都在闭集里，元组字面量还保证顺序与穷举——漏写一个会在这里先红。
 */
export const ERROR_CODE_VALUES = [
  ERROR_CODES.VALIDATION,
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.CONFLICT,
  ERROR_CODES.IO,
  ERROR_CODES.EXTERNAL,
  ERROR_CODES.FORBIDDEN,
] as const
