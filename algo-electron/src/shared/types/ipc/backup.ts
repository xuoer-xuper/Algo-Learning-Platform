import { z } from 'zod'

/*
 * 备份域各 channel 的输入 schema。消费方：electron/ipc/registerBackupIpc.ts。
 *
 * `backup:confirmLearningDataImport` 只收一个 boolean，没有界要挑。
 *
 * 要导入的数据本身不走这个 channel：它由 `backup:previewLearningDataImport` 从
 * 用户选中的文件里读出、按 `ownerId` 存在主进程的 `pendingImports` 里。渲染进程发过来的
 * 只是"冲突时是否覆盖"这一个开关——也就是说这里没有"结构化对象"要校验，
 * 而 boolean 不接受 `0/1/'true'` 这类等价物正好对上开关的语义。
 *
 * 其余三个 channel（createDatabaseBackup / exportLearningData /
 * previewLearningDataImport）是零参 handler，没有参数就没有形状可校验。
 */
export const confirmLearningDataImportInput = [z.boolean()] as const
