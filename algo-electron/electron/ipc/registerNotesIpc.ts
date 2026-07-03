import { ipcMain, shell } from 'electron'
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
  type NoteType,
} from '../notes/NoteService'

interface RegisterNotesIpcOptions {
  notifyProblemsUpdated?: () => void
}

export function registerNotesIpc(options: RegisterNotesIpcOptions = {}): void {
  ipcMain.handle('notes:listByProblem', (_event, problemId: string) => {
    return getNotesByProblem(problemId)
  })

  ipcMain.handle('notes:get', (_event, noteId: string) => {
    return getNoteWithContent(noteId)
  })

  ipcMain.handle('notes:create', (_event, problemId: string | null, title: string, content: string | null, noteType: NoteType) => {
    const note = createNote({ problem_id: problemId, title, content: content ?? undefined, note_type: noteType })
    options.notifyProblemsUpdated?.()
    return note
  })

  ipcMain.handle('notes:updateTitle', (_event, noteId: string, title: string) => {
    return updateNoteTitle(noteId, title)
  })

  ipcMain.handle('notes:updateContent', (_event, noteId: string, content: string) => {
    return updateNoteContent(noteId, content)
  })

  ipcMain.handle('notes:saveImage', (_event, noteId: string, fileName: string, mimeType: string, data: ArrayBuffer | Uint8Array) => {
    return saveNoteImage(noteId, fileName, mimeType, data)
  })

  ipcMain.handle('notes:updateType', (_event, noteId: string, noteType: NoteType) => {
    return updateNoteType(noteId, noteType)
  })

  ipcMain.handle('notes:delete', (_event, noteId: string) => {
    return deleteNote(noteId)
  })

  ipcMain.handle('notes:getForDelete', (_event, problemId: string) => {
    return getNotesByProblemForDelete(problemId)
  })

  ipcMain.handle('notes:deleteByProblem', (_event, problemId: string) => {
    return deleteNotesByProblem(problemId)
  })

  ipcMain.handle('notes:openDir', () => {
    const dir = openNotesDir()
    void shell.openPath(dir)
  })
}
