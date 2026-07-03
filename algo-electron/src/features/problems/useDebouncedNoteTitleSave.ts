import { useCallback, useEffect, useRef } from 'react'
import { updateNoteTitle } from './problemsApi'

interface PendingTitleUpdate {
  noteId: string
  title: string
}

interface UseDebouncedNoteTitleSaveOptions {
  delayMs?: number
  onSaved: () => Promise<void> | void
}

export function useDebouncedNoteTitleSave({
  delayMs = 600,
  onSaved,
}: UseDebouncedNoteTitleSaveOptions) {
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTitleRef = useRef<PendingTitleUpdate | null>(null)

  const clearTitleTimer = useCallback(() => {
    if (titleTimer.current) {
      clearTimeout(titleTimer.current)
      titleTimer.current = null
    }
  }, [])

  const flushPendingTitle = useCallback(async (reload: boolean) => {
    clearTitleTimer()

    const pending = pendingTitleRef.current
    pendingTitleRef.current = null
    if (!pending) return

    const finalTitle = pending.title.trim() || '未命名笔记'
    try {
      await updateNoteTitle(pending.noteId, finalTitle)
      if (reload) await onSaved()
    } catch {
      // 标题自动保存失败不阻塞编辑器关闭；用户后续内容保存仍可继续。
    }
  }, [clearTitleTimer, onSaved])

  useEffect(() => {
    // 卸载时 flush 最近一次标题修改，避免关闭弹层丢失防抖窗口内的输入。
    return () => { void flushPendingTitle(false) }
  }, [flushPendingTitle])

  const scheduleSaveTitle = useCallback((noteId: string, title: string) => {
    pendingTitleRef.current = { noteId, title }
    clearTitleTimer()
    titleTimer.current = setTimeout(() => {
      void flushPendingTitle(true)
    }, delayMs)
  }, [clearTitleTimer, delayMs, flushPendingTitle])

  const clearPendingTitleForNote = useCallback((noteId: string) => {
    if (pendingTitleRef.current?.noteId !== noteId) return
    pendingTitleRef.current = null
    clearTitleTimer()
  }, [clearTitleTimer])

  return {
    flushPendingTitle,
    scheduleSaveTitle,
    clearPendingTitleForNote,
  }
}
