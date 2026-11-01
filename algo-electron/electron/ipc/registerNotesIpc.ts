import { shell, type IpcMainInvokeEvent } from 'electron'
import { ipcMain } from './trustedSender'
import {
  createInput,
  deleteByProblemInput,
  deleteInput,
  getForDeleteInput,
  getInput,
  listByProblemInput,
  saveImageInput,
  updateContentInput,
  updateTitleInput,
  updateTypeInput,
} from '../../src/shared/types/ipc/notes'
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
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/notes.ts`；
 * 标题 200 / 正文 4 MiB / noteType 闭集枚举 / problemId 用 nullable 的理由写在那里。
 */
export function registerNotesIpc(options: RegisterNotesIpcOptions = {}): void {
  ipcMain.handle('notes:listByProblem', listByProblemInput, (_event, problemId) => {
    return getNotesByProblem(problemId)
  })

  ipcMain.handle('notes:get', getInput, (_event, noteId) => {
    return getNoteWithContent(noteId)
  })

  ipcMain.handle('notes:create', createInput, (event, problemId, title, content, noteType) => {
    const note = createNote({
      problem_id: problemId,
      title,
      content: content ?? undefined,
      note_type: noteType,
    })
    options.notifyProblemsUpdated?.(event)
    return note
  })

  ipcMain.handle('notes:updateTitle', updateTitleInput, (_event, noteId, title) => {
    return updateNoteTitle(noteId, title)
  })

  ipcMain.handle('notes:updateContent', updateContentInput, (_event, noteId, content) => {
    return updateNoteContent(noteId, content)
  })

  ipcMain.handle('notes:saveImage', saveImageInput, (_event, noteId, fileName, mimeType, data) => {
    return saveNoteImage(noteId, fileName, mimeType, data)
  })

  ipcMain.handle('notes:updateType', updateTypeInput, (_event, noteId, type) => {
    return updateNoteType(noteId, type)
  })

  ipcMain.handle('notes:delete', deleteInput, (_event, noteId) => {
    return deleteNote(noteId)
  })

  ipcMain.handle('notes:getForDelete', getForDeleteInput, (_event, problemId) => {
    return getNotesByProblemForDelete(problemId)
  })

  ipcMain.handle('notes:deleteByProblem', deleteByProblemInput, (_event, problemId) => {
    return deleteNotesByProblem(problemId)
  })

  ipcMain.handle('notes:openDir', () => {
    const dir = openNotesDir()
    void shell.openPath(dir)
  })
}
