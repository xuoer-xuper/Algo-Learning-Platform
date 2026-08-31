import { shell, type IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './trustedSender'
import { binary, freeText, nullable, oneOf, text } from './payloadSchema'
import {
  createNote,
  deleteNote,
  deleteNotesByProblem,
  getNotesByProblem,
  getNotesByProblemForDelete,
  getNoteWithContent,
  openNotesDir,
  saveNoteImage,
  updateNoteContent,
  updateNoteTitle,
  updateNoteType,
} from '../notes/NoteService'

interface RegisterNotesIpcOptions {
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
}

/*
 * 两个复用的界，理由写在这里而不是每个 channel 重复一遍：
 *
 * - `title` 上限 200：沿用本目录既有手写校验的同一档（`registerScriptsIpc` 的脚本名
 *   用的就是 200）。标题会被写进 Markdown 文件首行的 `# ` 标题，不进文件名。
 *   渲染进程那个输入框没有 maxLength，所以上限只能在这里给。
 *   `min` 取默认的 1：渲染进程侧 `useDebouncedNoteTitleSave` 已经做了
 *   `title.trim() || '未命名笔记'`，空标题不是一个会被发上来的合法输入。
 * - 正文上限 4 MiB：沿用 `registerScriptsIpc` 的 `MAX_VIEWABLE_SCRIPT_BYTES`。
 *   `checkIpcPayload` 对单个字符串的上限是 8 MiB，这里按 channel 再收紧一档。
 *   用 `freeText` 而不是 `text`：清空笔记正文是合法操作，空串必须放过。
 * - `noteType` 的三项就是 `NoteType` 联合的全部成员。这个界值得单独说：`preload.ts` 把它
 *   声明成 `string`，handler 声明成 `NoteType`，而 `notes.note_type` 列是裸 TEXT
 *   （migration 010，`DEFAULT 'solution'`，无 CHECK）。也就是说那个联合此前只是编译期的
 *   一句自述——运行时任何字符串都能写进库，再由 `rowToNote` 一路 `as NoteType` 收窄回来。
 *   现在它第一次有了运行时含义。
 */
const noteTitle = () => text({ max: 200 })
const noteContent = () => freeText({ max: 4 * 1024 * 1024 })
const noteType = () => oneOf(['solution', 'review', 'summary'] as const)

export function registerNotesIpc(options: RegisterNotesIpcOptions = {}): void {
  ipcMain.handle('notes:listByProblem', [text()], (_event, problemId) => {
    return getNotesByProblem(problemId)
  })

  ipcMain.handle('notes:get', [text()], (_event, noteId) => {
    return getNoteWithContent(noteId)
  })

  /*
   * `problemId` 用 `nullable` 而非 `optional`：独立笔记走的就是显式 `null`，
   * 由 `createNote` 落成 `_standalone` 目录，这与"没传"是两件事。
   */
  ipcMain.handle('notes:create', [
    nullable(text()),
    noteTitle(),
    nullable(noteContent()),
    noteType(),
  ], (event, problemId, title, content, noteType) => {
    const note = createNote({ problem_id: problemId, title, content: content ?? undefined, note_type: noteType })
    options.notifyProblemsUpdated?.(event)
    return note
  })

  ipcMain.handle('notes:updateTitle', [text(), noteTitle()], (_event, noteId, title) => {
    return updateNoteTitle(noteId, title)
  })

  ipcMain.handle('notes:updateContent', [text(), noteContent()], (_event, noteId, content) => {
    return updateNoteContent(noteId, content)
  })

  /*
   * - `fileName` 用 `freeText`——剪贴板粘贴的图片常常没有文件名（空串），此时扩展名由
   *   `mimeType` 决定，见 `noteStorage.getImageExtension`；255 是各主流文件系统的单段
   *   文件名上限，且这个值不进磁盘路径（落盘名是 `Date.now()-uuid` 重新生成的）。
   * - mime 与扩展名的白名单判定留在 `noteStorage.getImageExtension`：那里要同时看文件名和
   *   mime 两个来源，是 schema 表达不了的跨字段判断，这里只该给长度上限。
   * - 二进制上限 16 MiB 与 `checkIpcPayload` 对 ArrayBuffer 的上限同档。这是本文件里唯一
   *   一条渲染进程侧完全没有前置检查的通道：`MilkdownEditor` 的上传回调把整个文件读成
   *   ArrayBuffer 直接发过来，既不看体积也不看类型。
   */
  ipcMain.handle('notes:saveImage', [
    text(),
    freeText({ max: 255 }),
    text({ max: 128 }),
    binary({ maxBytes: 16 * 1024 * 1024 }),
  ], (_event, noteId, fileName, mimeType, data) => {
    return saveNoteImage(noteId, fileName, mimeType, data)
  })

  ipcMain.handle('notes:updateType', [text(), noteType()], (_event, noteId, type) => {
    return updateNoteType(noteId, type)
  })

  ipcMain.handle('notes:delete', [text()], (_event, noteId) => {
    return deleteNote(noteId)
  })

  ipcMain.handle('notes:getForDelete', [text()], (_event, problemId) => {
    return getNotesByProblemForDelete(problemId)
  })

  ipcMain.handle('notes:deleteByProblem', [text()], (_event, problemId) => {
    return deleteNotesByProblem(problemId)
  })

  ipcMain.handle('notes:openDir', () => {
    const dir = openNotesDir()
    void shell.openPath(dir)
  })
}
