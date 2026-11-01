import type { NoteItem } from './notesTypes'
import type { ProblemRecord } from '@shared/types/problem'
import type { ProblemDetailView } from './problemTypes'

/*
 * R3 起输入形状从 window.api 推导：listRecent 的 platform/status 是 schema 里的
 * 闭集枚举（下拉框的取值与之一一对应），编译期就拦住越界取值。
 */
type ListRecentInput = Parameters<typeof window.api.problem.listRecent>[0]
type UpdateNoteTypeInput = Parameters<typeof window.api.notes.updateType>[0]

export function loadRecentProblems(
  limit = 200,
  platform?: ListRecentInput['platform'],
  status?: ListRecentInput['status'],
): Promise<ProblemRecord[]> {
  return window.api.problem.listRecent({ limit, platform, status })
}

export function subscribeProblemsUpdated(callback: () => void): () => void {
  return window.api.problem.onUpdated(callback)
}

export function setProblemSidebarWidth(width: number): void {
  window.api.browser.setSidebarWidth(width)
}

export async function loadProblemDetail(problemId: string): Promise<ProblemDetailView | null> {
  const [detail, visitStats] = await Promise.all([
    window.api.problem.getDetail(problemId),
    window.api.stats.getProblemVisitStats(problemId),
  ])

  if (!detail) return null
  return {
    ...detail,
    visitStats,
  }
}

export function loadNotesForDelete(problemId: string): Promise<NoteItem[]> {
  return window.api.notes.getForDelete(problemId)
}

export function deleteNotesByProblem(problemId: string): Promise<number> {
  return window.api.notes.deleteByProblem(problemId)
}

export function deleteProblemRecord(problemId: string): Promise<boolean> {
  return window.api.problem.delete(problemId)
}

export function navigateToProblemUrl(url: string): void {
  window.api.browser.navigate(url)
}

export function listNotesByProblem(problemId: string): Promise<NoteItem[]> {
  return window.api.notes.listByProblem(problemId)
}

export function createProblemNote(problemId: string): Promise<NoteItem> {
  return window.api.notes.create({
    problemId,
    title: '未命名笔记',
    content: '',
    noteType: 'solution',
  })
}

export function loadNote(noteId: string): Promise<NoteItem | null> {
  return window.api.notes.get(noteId)
}

export function updateNoteContent(noteId: string, markdown: string): Promise<boolean> {
  return window.api.notes.updateContent({ noteId, content: markdown })
}

export function updateNoteType(
  noteId: string,
  noteType: UpdateNoteTypeInput['noteType'],
): Promise<boolean> {
  return window.api.notes.updateType({ noteId, noteType })
}

export function updateNoteTitle(noteId: string, title: string): Promise<boolean> {
  return window.api.notes.updateTitle({ noteId, title })
}

export function deleteNote(noteId: string): Promise<boolean> {
  return window.api.notes.delete(noteId)
}

export function openNotesDirectory(): Promise<void> {
  return window.api.notes.openDir()
}

export async function saveNoteImage(
  noteId: string,
  fileName: string,
  mimeType: string,
  data: ArrayBuffer,
): Promise<string> {
  const result = await window.api.notes.saveImage({ noteId, fileName, mimeType, data })
  return result.markdownUrl
}
