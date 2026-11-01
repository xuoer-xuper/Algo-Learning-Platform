import { z } from 'zod'

/*
 * 笔记域各 channel 的输入 schema。消费方：electron/ipc/registerNotesIpc.ts。
 *
 * 复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `title` 上限 200：沿用本目录既有手写校验的同一档（scripts 域的脚本名
 *   用的就是 200）。标题会被写进 Markdown 文件首行的 `# ` 标题，不进文件名。
 *   渲染进程那个输入框没有 maxLength，所以上限只能在这里给。
 *   下限取 1：渲染进程侧 `useDebouncedNoteTitleSave` 已经做了
 *   `title.trim() || '未命名笔记'`，空标题不是一个会被发上来的合法输入。
 * - 正文上限 4 MiB：沿用 scripts 域的 `MAX_VIEWABLE_SCRIPT_BYTES`。
 *   `checkIpcPayload` 对单个字符串的上限是 8 MiB，这里按 channel 再收紧一档。
 *   允许空串：清空笔记正文是合法操作。
 * - `noteType` 的三项就是 `NoteType` 联合的全部成员。这个界值得单独说：`preload.ts` 把它
 *   声明成 `string`，handler 声明成 `NoteType`，而 `notes.note_type` 列是裸 TEXT
 *   （migration 010，`DEFAULT 'solution'`，无 CHECK）。也就是说那个联合此前只是编译期的
 *   一句自述——运行时任何字符串都能写进库，再由 `rowToNote` 一路 `as NoteType` 收窄回来。
 *   现在它第一次有了运行时含义。
 */

/** 标识符类字符串：非空、上限 200（noteId / problemId，标识符 200 的既有口径）。 */
const identifier = z.string().min(1).max(200)
const noteTitle = z.string().min(1).max(200)
const noteContent = z.string().max(4 * 1024 * 1024)
const noteType = z.enum(['solution', 'review', 'summary'])

export const listByProblemInput = [identifier] as const
export const getInput = [identifier] as const

/*
 * `problemId` 用 nullable 而非 optional：独立笔记走的就是显式 `null`，
 * 由 `createNote` 落成 `_standalone` 目录，这与"没传"是两件事。
 */
export const createInput = [
  identifier.nullable(),
  noteTitle,
  noteContent.nullable(),
  noteType,
] as const

export const updateTitleInput = [identifier, noteTitle] as const
export const updateContentInput = [identifier, noteContent] as const

/*
 * - `fileName` 允许空串——剪贴板粘贴的图片常常没有文件名，此时扩展名由
 *   `mimeType` 决定，见 `noteStorage.getImageExtension`；255 是各主流文件系统的单段
 *   文件名上限，且这个值不进磁盘路径（落盘名是 `Date.now()-uuid` 重新生成的）。
 * - mime 与扩展名的白名单判定留在 `noteStorage.getImageExtension`：那里要同时看文件名和
 *   mime 两个来源，是 schema 表达不了的跨字段判断，这里只给长度上限。
 * - 图片二进制接受 ArrayBuffer 与 Uint8Array 两种：唯一产出方 `MilkdownEditor` 的上传
 *   回调走 `file.arrayBuffer()`，preload 原样透传、结构化克隆把 ArrayBuffer 原样送达
 *   主进程（旧 `binary()` 组合子正是按这两种类型判的，两种都收）。体积上限 16 MiB 由
 *   `checkIpcPayload` 对 ArrayBuffer/视图的同一档上限兜住，不在 schema 里重复。
 *   这是本文件里唯一一条渲染进程侧完全没有前置检查的通道：`MilkdownEditor` 的上传
 *   回调把整个文件读出来直接发过来，既不看体积也不看类型。
 */
export const saveImageInput = [
  identifier,
  z.string().max(255),
  z.string().min(1).max(128),
  z.union([z.instanceof(ArrayBuffer), z.instanceof(Uint8Array)]),
] as const

export const updateTypeInput = [identifier, noteType] as const
export const deleteInput = [identifier] as const
export const getForDeleteInput = [identifier] as const
export const deleteByProblemInput = [identifier] as const
