// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TabStripTabInfo } from '../../src/components/tabApi'
import type { NoteItem } from '../../src/features/problems/notesTypes'

const api = vi.hoisted(() => ({
  listNotesByProblem: vi.fn(),
  loadNote: vi.fn(),
  updateNoteContent: vi.fn(async () => true),
  updateNoteTitle: vi.fn(async () => true),
}))

vi.mock('../../src/features/problems/problemsApi', () => ({
  ...api,
  createProblemNote: vi.fn(),
  deleteNote: vi.fn(),
  openNotesDirectory: vi.fn(),
  updateNoteType: vi.fn(),
  saveNoteImage: vi.fn(),
}))

// Keep the production editor's debounce and unmount flush; replace only Crepe.
vi.mock('@milkdown/crepe', async () => {
  const actual = await vi.importActual<typeof import('@milkdown/crepe')>('@milkdown/crepe')
  type MarkdownListener = (context: unknown, markdown: string, previous: string) => void
  return {
    ...actual,
    CrepeFeature: actual.CrepeFeature,
    Crepe: class {
      private readonly input = document.createElement('textarea')
      private listener: MarkdownListener | null = null
      private previous: string

      constructor(options: { root: HTMLElement; defaultValue: string }) {
        this.previous = options.defaultValue
        this.input.value = options.defaultValue
        this.input.setAttribute('aria-label', 'Markdown body')
        this.input.addEventListener('input', () => {
          this.listener?.(null, this.input.value, this.previous)
          this.previous = this.input.value
        })
        options.root.append(this.input)
      }

      on(setup: (listener: { markdownUpdated: (callback: MarkdownListener) => void }) => void) {
        setup({ markdownUpdated: callback => { this.listener = callback } })
      }

      create() { return Promise.resolve() }
      destroy() {
        this.input.remove()
        return Promise.resolve()
      }
    },
  }
})

import { ShellRouter } from '../../src/components/ShellRouter'

const noteA: NoteItem = {
  id: 'note-a', title: 'Note A', content: 'Body A', note_type: 'solution',
  word_count: 2, updated_at: '2026-09-05 10:00:00',
}
const noteB: NoteItem = { ...noteA, id: 'note-b', title: 'Note B', content: 'Body B' }

function notesTab(id: string, problemId: string): TabStripTabInfo {
  return {
    id, kind: 'internal', page: { type: 'notes', problemId },
    url: `algo://problem-notes?problemId=${problemId}`, title: 'Notes',
    favicon: null, isLoading: false, isCrashed: false, isUnresponsive: false,
    isUnresponsiveNoticeDismissed: false, isActive: true,
  }
}

function route(tab: TabStripTabInfo) {
  return <ShellRouter activeTab={tab} onNavigate={() => {}} onCloseActiveTab={() => {}} onReloadActiveTab={() => {}} />
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function openNote(note: NoteItem) {
  fireEvent.click(await screen.findByText(note.title))
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Markdown body' }, { timeout: 5000 })
  await waitFor(() => expect(editor.value).toBe(note.content))
  return editor
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listNotesByProblem.mockImplementation(async (problemId: string) => [problemId === 'problem-a' ? noteA : noteB])
  api.loadNote.mockImplementation(async (noteId: string) => noteId === noteA.id ? noteA : noteB)
})

afterEach(() => cleanup())

describe('notes tab identity', () => {
  it.each([
    ['another problem tab', notesTab('tab-b', 'problem-b'), noteB],
    ['another problem in the same tab', notesTab('tab-a', 'problem-b'), noteB],
    ['another tab for the same problem', notesTab('tab-b', 'problem-a'), noteA],
  ])('opens a clean editor for %s and saves to its note', async (_name, nextTab, nextNote) => {
    const view = render(route(notesTab('tab-a', 'problem-a')))
    await openNote(noteA)

    view.rerender(route(nextTab))
    await screen.findByText(nextNote.title)
    expect(screen.queryByRole('textbox', { name: 'Markdown body' })).toBeNull()
    expect(view.container.querySelector('.note-editor-title')).toBeNull()

    const editor = await openNote(nextNote)
    fireEvent.input(editor, { target: { value: 'Edited next note' } })
    await waitFor(() => expect(api.updateNoteContent).toHaveBeenCalledWith(nextNote.id, 'Edited next note'))
    expect(api.updateNoteContent).toHaveBeenCalledTimes(1)
  })

  it('flushes the previous note body and title before editing the next problem', async () => {
    const view = render(route(notesTab('tab-a', 'problem-a')))
    const editorA = await openNote(noteA)
    fireEvent.input(editorA, { target: { value: 'Pending body A' } })
    fireEvent.change(view.container.querySelector('.note-editor-title')!, { target: { value: 'Pending title A' } })

    view.rerender(route(notesTab('tab-b', 'problem-b')))
    await screen.findByText(noteB.title)
    expect(api.updateNoteContent).toHaveBeenCalledExactlyOnceWith(noteA.id, 'Pending body A')
    expect(api.updateNoteTitle).toHaveBeenCalledExactlyOnceWith(noteA.id, 'Pending title A')

    const editorB = await openNote(noteB)
    fireEvent.input(editorB, { target: { value: 'Edited body B' } })
    await waitFor(() => expect(api.updateNoteContent).toHaveBeenLastCalledWith(noteB.id, 'Edited body B'))
    expect(api.updateNoteContent).toHaveBeenCalledTimes(2)
  })

  it('ignores an old note read that resolves after switching tabs', async () => {
    const pendingNote = deferred<NoteItem>()
    api.loadNote.mockImplementation((noteId: string) => noteId === noteA.id ? pendingNote.promise : Promise.resolve(noteB))
    const view = render(route(notesTab('tab-a', 'problem-a')))
    fireEvent.click(await screen.findByText(noteA.title))
    await waitFor(() => expect(api.loadNote).toHaveBeenCalledWith(noteA.id))

    view.rerender(route(notesTab('tab-b', 'problem-b')))
    const editorB = await openNote(noteB)
    await act(async () => { pendingNote.resolve(noteA) })
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(editorB)
    expect(editorB.value).toBe(noteB.content)
    expect(view.container.querySelector<HTMLInputElement>('.note-editor-title')?.value).toBe(noteB.title)
    fireEvent.input(editorB, { target: { value: 'Still body B' } })
    await waitFor(() => expect(api.updateNoteContent).toHaveBeenCalledExactlyOnceWith(noteB.id, 'Still body B'))
  })

  it('preserves the editor for updates to the same tab metadata', async () => {
    const tab = notesTab('tab-a', 'problem-a')
    const view = render(route(tab))
    const editor = await openNote(noteA)

    view.rerender(route({ ...tab, title: 'Updated notes tab' }))

    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(editor)
    expect(editor.value).toBe(noteA.content)
    expect(api.loadNote).toHaveBeenCalledTimes(1)
  })
})
