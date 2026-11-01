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
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

interface RegisterNotesIpcOptions {
  notifyProblemsUpdated?: (event: IpcMainInvokeEvent) => void
}

/*
 * 各 channel 的输入 schema 元组来自 `src/shared/types/ipc/notes.ts`；
 * 标题 200 / 正文 4 MiB / noteType 闭集枚举 / problemId 用 nullable 的理由写在那里。
 */
export function registerNotesIpc(options: RegisterNotesIpcOptions = {}): void {
  ipcMain.handle(IPC_CHANNELS.NOTES.LIST_BY_PROBLEM, listByProblemInput, (_event, problemId) => {
    return getNotesByProblem(problemId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.GET, getInput, (_event, noteId) => {
    return getNoteWithContent(noteId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.CREATE, createInput, (event, input) => {
    const note = createNote({
      problem_id: input.problemId,
      title: input.title,
      content: input.content ?? undefined,
      note_type: input.noteType,
    })
    options.notifyProblemsUpdated?.(event)
    return note
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.UPDATE_TITLE, updateTitleInput, (_event, input) => {
    return updateNoteTitle(input.noteId, input.title)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.UPDATE_CONTENT, updateContentInput, (_event, input) => {
    return updateNoteContent(input.noteId, input.content)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.SAVE_IMAGE, saveImageInput, (_event, input) => {
    return saveNoteImage(input.noteId, input.fileName, input.mimeType, input.data)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.UPDATE_TYPE, updateTypeInput, (_event, input) => {
    return updateNoteType(input.noteId, input.noteType)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.DELETE, deleteInput, (_event, noteId) => {
    return deleteNote(noteId)
  })

  ipcMain.handle(IPC_CHANNELS.NOTES.GET_FOR_DELETE, getForDeleteInput, (_event, problemId) => {
    return getNotesByProblemForDelete(problemId)
  })

  ipcMain.handle(
    IPC_CHANNELS.NOTES.DELETE_BY_PROBLEM,
    deleteByProblemInput,
    (_event, problemId) => {
      return deleteNotesByProblem(problemId)
    },
  )

  ipcMain.handle(IPC_CHANNELS.NOTES.OPEN_DIR, () => {
    const dir = openNotesDir()
    void shell.openPath(dir)
  })
}
