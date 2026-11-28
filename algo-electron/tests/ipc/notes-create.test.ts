import { ipcRenderer } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetElectronMock } from '../electron/electronMock'
import * as service from '../../electron/notes/NoteService'
import { registerNotesIpc } from '../../electron/ipc/registerNotesIpc'
import { IPC_CHANNELS } from '../../src/shared/constants/channels'

vi.mock('../../electron/ipc/trustedSender', async () => {
  const { createTrustedSenderDouble } = await import('./trustedSenderDouble')
  return { ipcMain: createTrustedSenderDouble() }
})

vi.mock('../../electron/notes/NoteService', () => ({
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  deleteNotesByProblem: vi.fn(),
  getNotesByProblem: vi.fn(),
  getNotesByProblemForDelete: vi.fn(),
  getNoteWithContent: vi.fn(),
  openNotesDir: vi.fn(),
  saveNoteImage: vi.fn(),
  updateNoteContent: vi.fn(),
  updateNoteTitle: vi.fn(),
  updateNoteType: vi.fn(),
}))

beforeEach(() => {
  resetElectronMock()
  vi.resetAllMocks()
})

const INPUT = {
  problemId: null,
  title: 'Title',
  content: null,
  noteType: 'solution',
}
const NOTE: service.Note = {
  id: 'created',
  problem_id: null,
  title: 'Title',
  file_path: 'synthetic/created.md',
  note_type: 'solution',
  content: '',
  word_count: 0,
  created_at: 0,
  updated_at: 0,
}

describe('notes create IPC unchanged mapping and legacy callback', () => {
  it.each([null, '', 'body'])(
    'maps nullable content %j and returns the exact service object with extra fields',
    async (content) => {
      const trace: string[] = []
      const returned = { ...NOTE, diagnosticExtra: 'not output-parsed' }
      vi.mocked(service.createNote).mockImplementation((input) => {
        trace.push('service')
        expect(input).toEqual({
          problem_id: null,
          title: 'Title',
          content: content ?? undefined,
          note_type: 'solution',
        })
        expect(Object.hasOwn(input, 'content')).toBe(true)
        return returned
      })
      const notify = vi.fn(() => trace.push('legacy'))
      registerNotesIpc({ notifyProblemsUpdated: notify })
      expect(await ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, { ...INPUT, content })).toBe(
        returned,
      )
      expect(trace).toEqual(['service', 'legacy'])
      expect(notify).toHaveBeenCalledExactlyOnceWith(expect.any(Object))
    },
  )

  it('keeps the legacy notification optional', async () => {
    vi.mocked(service.createNote).mockReturnValue(NOTE)
    registerNotesIpc()
    expect(await ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, INPUT)).toBe(NOTE)
  })

  it('does not notify when the service throws', async () => {
    const sentinel = new Error('service failed after its own effects')
    vi.mocked(service.createNote).mockImplementation(() => {
      throw sentinel
    })
    const notify = vi.fn()
    registerNotesIpc({ notifyProblemsUpdated: notify })
    await expect(ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, INPUT)).rejects.toBe(sentinel)
    expect(notify).not.toHaveBeenCalled()
  })

  it('propagates legacy callback failure after the service completed', async () => {
    const trace: string[] = []
    const sentinel = new Error('legacy callback failure')
    vi.mocked(service.createNote).mockImplementation(() => {
      trace.push('committed-service')
      return NOTE
    })
    registerNotesIpc({
      notifyProblemsUpdated() {
        trace.push('legacy')
        throw sentinel
      },
    })
    await expect(ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, INPUT)).rejects.toBe(sentinel)
    expect(trace).toEqual(['committed-service', 'legacy'])
  })

  it.each([
    { ...INPUT, title: '' },
    { ...INPUT, noteType: 'not-enum' },
    { ...INPUT, problemId: '' },
    { ...INPUT, content: undefined },
    { ...INPUT, extra: true },
    { ...INPUT, content: 'x'.repeat(4 * 1024 * 1024 + 1) },
  ])('rejects invalid payload before service/legacy effects', async (input) => {
    const notify = vi.fn()
    registerNotesIpc({ notifyProblemsUpdated: notify })
    await expect(ipcRenderer.invoke(IPC_CHANNELS.NOTES.CREATE, input)).rejects.toThrow(
      'Rejected IPC sender (payload)',
    )
    expect(service.createNote).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
