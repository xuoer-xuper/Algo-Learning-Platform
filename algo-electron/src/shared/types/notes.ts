import { z } from 'zod'

/*
 * 笔记域的跨进程类型（阶段 2 R2 从 electron-env.d.ts 收口）。
 * 笔记是本地题解 Markdown（notes/NoteService），内容存文件系统、元数据入库。
 * 渲染层的列表项刻意不含 problem_id（列表总在单题上下文里），见
 * src/features/problems/notesTypes.ts 的 NoteItem = Omit<NoteRecord, 'problem_id'>。
 */

export const noteRecordSchema = z.object({
  id: z.string(),
  problem_id: z.string().nullable().optional(),
  title: z.string(),
  content: z.string(),
  note_type: z.string(),
  word_count: z.number(),
  updated_at: z.number().int(),
})

/** 笔记元数据行（notes:listByProblem / get / create 的输出）。 */
export type NoteRecord = z.infer<typeof noteRecordSchema>

export const saveNoteImageResultSchema = z.object({
  /** 图片落盘后替换进 Markdown 的引用 URL（notes:// 相对形式）。 */
  markdownUrl: z.string(),
})

/** notes:saveImage 的输出。 */
export type SaveNoteImageResult = z.infer<typeof saveNoteImageResultSchema>
