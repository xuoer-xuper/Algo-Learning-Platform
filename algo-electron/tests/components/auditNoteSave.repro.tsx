// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import type { NoteItem } from '../../src/features/problems/notesTypes'

const api = vi.hoisted(() => ({
  listNotesByProblem: vi.fn(),
  loadNote: vi.fn(),
  updateNoteContent: vi.fn(async () => false),
  updateNoteTitle: vi.fn(async () => true),
}))

vi.mock('../../src/features/problems/problemsApi', () => ({
  ...api, createProblemNote: vi.fn(), deleteNote: vi.fn(), openNotesDirectory: vi.fn(),
  updateNoteType: vi.fn(), saveNoteImage: vi.fn(),
}))

// Preserve the real panel and status UI; make editor changes deterministic.
vi.mock('../../src/features/problems/MilkdownEditor', () => ({
  MilkdownEditor: ({ initialValue, onChange }: { initialValue: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Audit body" defaultValue={initialValue} onChange={event => onChange(event.target.value)} />
  ),
}))

import { NotePanelModal } from '../../src/features/problems/NotePanelModal'

afterEach(cleanup)

it('records the current false-success display when note persistence returns false', async () => {
  const note: NoteItem = {
    id: 'audit-note', title: 'Audit note', content: 'Old body', note_type: 'solution',
    word_count: 2, updated_at: '2026-09-10T10:00:00+08:00',
  }
  api.listNotesByProblem.mockResolvedValue([note])
  api.loadNote.mockResolvedValue(note)
  const view = render(<NotePanelModal problemId="audit-problem" onClose={() => {}} />)
  fireEvent.click(await screen.findByText(note.title))
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Audit body' })
  const readsBefore = api.listNotesByProblem.mock.calls.length
  fireEvent.change(editor, { target: { value: 'New body rejected by storage' } })
  await waitFor(() => expect(api.updateNoteContent).toHaveBeenCalledExactlyOnceWith(note.id, 'New body rejected by storage'))
  await waitFor(() => expect(api.listNotesByProblem.mock.calls.length).toBeGreaterThan(readsBefore))
  const status = view.container.querySelector('.note-save-status')?.textContent
  expect(status).toBe('\u5df2\u4fdd\u5b58')
  expect(editor.value).toBe('New body rejected by storage')
  view.unmount()
  render(<NotePanelModal problemId="audit-problem" onClose={() => {}} />)
  fireEvent.click(await screen.findByText(note.title))
  const reopened = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Audit body' })
  expect(reopened.value).toBe('Old body')
  const output = path.resolve('tmp/audit-20260911')
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'note-save-ui-results.json'), JSON.stringify({
    environment: 'Vitest jsdom; real NotePanelModal and NoteEditorPane; editor and IPC are doubles',
    persistenceReturn: false, statusAfterFailure: status, reopenedBody: reopened.value,
  }, null, 2))
})
