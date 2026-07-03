import type { NoteItem } from './notesTypes'
import type { ProblemDetailRecord, SidebarProblemRecord } from './problemTypes'

export function loadRecentProblems(
  limit = 200,
  platform?: string,
  status?: string,
): Promise<SidebarProblemRecord[]> {
  return window.electronAPI.listRecentProblems(limit, platform, status)
}

export function subscribeProblemsUpdated(callback: () => void): () => void {
  return window.electronAPI.onProblemsUpdated(callback)
}

export function setProblemSidebarWidth(width: number): void {
  window.electronAPI.setSidebarWidth(width)
}

export async function loadProblemDetail(problemId: string): Promise<ProblemDetailRecord | null> {
  const [detail, visitStats] = await Promise.all([
    window.electronAPI.getProblemDetail(problemId),
    window.electronAPI.getProblemVisitStats(problemId),
  ])

  if (!detail) return null
  return {
    ...detail,
    visitStats,
  }
}

export function loadNotesForDelete(problemId: string): Promise<NoteItem[]> {
  return window.electronAPI.getNotesForDelete(problemId)
}

export function deleteNotesByProblem(problemId: string): Promise<number> {
  return window.electronAPI.deleteNotesByProblem(problemId)
}

export function deleteProblemRecord(problemId: string): Promise<boolean> {
  return window.electronAPI.deleteProblem(problemId)
}

export function navigateToProblemUrl(url: string): void {
  window.electronAPI.navigate(url)
}

export function listNotesByProblem(problemId: string): Promise<NoteItem[]> {
  return window.electronAPI.listNotesByProblem(problemId)
}

export function createProblemNote(problemId: string): Promise<NoteItem> {
  return window.electronAPI.createNote(problemId, '未命名笔记', '', 'solution')
}

export function loadNote(noteId: string): Promise<NoteItem | null> {
  return window.electronAPI.getNote(noteId)
}

export function updateNoteContent(noteId: string, markdown: string): Promise<boolean> {
  return window.electronAPI.updateNoteContent(noteId, markdown)
}

export function updateNoteType(noteId: string, noteType: string): Promise<boolean> {
  return window.electronAPI.updateNoteType(noteId, noteType)
}

export function updateNoteTitle(noteId: string, title: string): Promise<boolean> {
  return window.electronAPI.updateNoteTitle(noteId, title)
}

export function deleteNote(noteId: string): Promise<boolean> {
  return window.electronAPI.deleteNote(noteId)
}

export function openNotesDirectory(): Promise<void> {
  return window.electronAPI.openNotesDir()
}

export async function saveNoteImage(
  noteId: string,
  fileName: string,
  mimeType: string,
  data: ArrayBuffer,
): Promise<string> {
  const result = await window.electronAPI.saveNoteImage(noteId, fileName, mimeType, data)
  return result.markdownUrl
}
