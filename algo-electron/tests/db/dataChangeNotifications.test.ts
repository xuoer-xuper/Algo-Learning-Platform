import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb, initDbAtPath } from '../../electron/db/connection'
import { subscribeDataChanges } from '../../electron/shared/dataEvents'
import type { DataChangedPayload } from '../../src/shared/types/data'
import {
  deleteProblem,
  getRecentProblems,
  upsertProblem,
} from '../../electron/db/repositories/problemRepository'
import {
  upsertSubmission,
  updateFirstAc,
} from '../../electron/db/repositories/submissionRepository'
import {
  startProblemVisit,
  finishProblemVisit,
} from '../../electron/db/repositories/problemVisitRepository'
import { recomputeDailyStats } from '../../electron/db/repositories/statsRepository'
import { createSite, deleteSite } from '../../electron/db/repositories/siteRepository'
import {
  upsertCredential,
  renameCredential,
} from '../../electron/db/repositories/credentialRepository'
import { upsertAccount } from '../../electron/db/repositories/accountRepository'
import { createScript, getAllScripts } from '../../electron/db/repositories/userScriptRepository'
import {
  runUserScriptTransaction,
  updateScriptWithLegacyClaim,
} from '../../electron/db/repositories/userScript/mutations'
import {
  setUserScriptValue,
  getUserScriptValue,
} from '../../electron/db/repositories/userScriptRuntimeRepository'
import {
  insertCoachEvent,
  buildCoachEvent,
} from '../../electron/db/repositories/coach/eventsRepository'
import { exportLearningData, importLearningData } from '../../electron/backup/learningDataExport'
import { upsertCookieMetadata } from '../../electron/db/repositories/cookieRecordRepository'
import { createNote, updateNoteTitle, deleteNote } from '../../electron/notes/NoteService'
import { createDefaultSubmissionBatchWriter } from '../../electron/submissions/createDefaultSubmissionBatchWriter'

vi.mock('../../electron/notes/noteStorage', () => ({
  createNoteFile: () => 'test-note.md',
  deleteNoteFiles: () => undefined,
  ensureNotesRoot: () => '.',
  readNoteFile: () => '',
  resolveNoteAssetPathFromFile: () => null,
  saveNoteImageAsset: () => ({ markdownUrl: '' }),
  writeNoteContent: () => undefined,
}))

let tempDir: string
let dispose: () => void
let observed: DataChangedPayload[]
let transactionStates: boolean[]
const identity = {
  platform: 'codeforces',
  platformProblemId: '1000A',
  canonicalUrl: 'https://codeforces.com/problemset/problem/1000/A',
  title: 'Data refresh example',
  confidence: 'url' as const,
}
const scriptInput = {
  name: 'Refresh helper',
  description: null,
  version: '1.0',
  match_urls_json: '[]',
  code: '',
  file_path: null,
  site_ids_json: null,
  enabled: true,
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-data-events-'))
  initDbAtPath(path.join(tempDir, 'data.sqlite'))
  observed = []
  transactionStates = []
  dispose = subscribeDataChanges((payload) => {
    // A real SQLite transaction must already be committed at the observable boundary.
    transactionStates.push(getDb().inTransaction)
    observed.push(payload)
  })
})

afterEach(() => {
  dispose()
  closeDb()
  const resolved = path.resolve(tempDir)
  expect(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-data-events-`)).toBe(true)
  fs.rmSync(resolved, { recursive: true, force: true })
  expect(transactionStates.every((inTransaction) => !inTransaction)).toBe(true)
})

function topics(): string[] {
  return [...new Set(observed.flatMap((payload) => payload.tables))].sort()
}

describe('committed repository invalidations', () => {
  it('should cover problem, submission and derived statistics writes without emitting for duplicates', () => {
    upsertProblem(identity)
    const problem = getRecentProblems(1)[0]
    expect(problem).toBeDefined()
    observed.length = 0
    const input = {
      platform: 'codeforces',
      platformSubmissionId: 'refresh-submission',
      problemId: problem.id,
      verdict: 'AC' as const,
      submittedAt: '2026-11-04T10:00:00',
    }
    expect(upsertSubmission(input)).toBe(true)
    updateFirstAc(problem.id)
    recomputeDailyStats('2026-11-04')
    expect(topics()).toEqual(['problems', 'stats', 'submissions'])
    observed.length = 0
    expect(upsertSubmission(input)).toBe(false)
    expect(deleteProblem('missing')).toBe(false)
    expect(observed).toEqual([])
    expect(deleteProblem(problem.id)).toBe(true)
    expect(topics()).toEqual(['problems', 'stats', 'submissions'])
  })

  it('should publish visit creation once after commit and discard failed visit writes', () => {
    const input = {
      identity,
      visitId: 'visit-1',
      activityId: 'activity-1',
      now: '2026-11-04T10:00:00',
      localDay: '2026-11-04',
    }
    expect(startProblemVisit(input)).toBe(true)
    expect(observed).toEqual([{ tables: ['problems', 'stats'] }])
    observed.length = 0
    expect(() =>
      startProblemVisit({ ...input, identity: { ...identity, platformProblemId: '1000B' } }),
    ).toThrow()
    expect(getRecentProblems(10)).toHaveLength(1)
    expect(observed).toEqual([])
    expect(finishProblemVisit({ visitId: 'visit-1', leftAt: input.now, durationSeconds: 1 })).toBe(
      true,
    )
    expect(topics()).toEqual(['problems', 'stats'])
    observed.length = 0
    expect(finishProblemVisit({ visitId: 'visit-1', leftAt: input.now, durationSeconds: 1 })).toBe(
      false,
    )
    expect(observed).toEqual([])
  })

  it('should cover safe site, credential, account, note and Coach topics without row data', () => {
    createSite({
      id: 'example',
      name: 'Example',
      domains: ['example.com'],
      homeUrl: 'https://example.com',
      enabled: true,
    })
    const credentialId = upsertCredential({
      siteId: 'example',
      username: 'private-user',
      secretEnvelope: {
        version: 1,
        provider: 'electron-safe-storage',
        ciphertextBase64: Buffer.from('test-ciphertext').toString('base64'),
      },
    })
    renameCredential(credentialId, 'private-label')
    upsertAccount('codeforces', 'private-handle')
    const note = createNote({ title: 'Private title', content: 'Private content' })
    updateNoteTitle(note.id, 'Another private title')
    deleteNote(note.id)
    insertCoachEvent(
      buildCoachEvent({ event_type: 'idle_too_long', severity: 'info', score: 0, evidence: {} }),
    )
    expect(topics()).toEqual(['coach', 'credentials', 'notes', 'sites', 'stats'])
    for (const payload of observed) expect(Object.keys(payload)).toEqual(['tables'])
    expect(JSON.stringify(observed)).not.toContain('private')
    observed.length = 0
    expect(renameCredential('missing', 'label')).toBe(false)
    expect(deleteSite('missing')).toBe(false)
    expect(updateNoteTitle('missing', 'title')).toBe(false)
    expect(observed).toEqual([])
  })

  it('should buffer nested script writes and retain committed autocommit changes', () => {
    const id = runUserScriptTransaction(() => {
      const created = createScript(scriptInput)
      runUserScriptTransaction(() => setUserScriptValue(created, 'key', 'private value'))
      expect(observed).toEqual([])
      return created
    })
    expect(observed).toEqual([{ tables: ['scripts'] }])
    observed.length = 0
    expect(() =>
      runUserScriptTransaction(() => {
        setUserScriptValue(id, 'key', 'rolled back')
        createScript(scriptInput)
        throw new Error('rollback')
      }),
    ).toThrow('rollback')
    expect(getUserScriptValue(id, 'key')?.value).toBe('private value')
    expect(getAllScripts()).toHaveLength(1)
    expect(observed).toEqual([])
    expect(() => {
      createScript(scriptInput)
      throw new Error('later item failed')
    }).toThrow('later item failed')
    expect(getAllScripts()).toHaveLength(2)
    expect(observed).toEqual([{ tables: ['scripts'] }])
  })

  it('should keep read-side cookie metadata outside the refresh bus', () => {
    upsertCookieMetadata({
      siteId: 'example',
      domain: 'example.com',
      name: 'session',
      purpose: 'login',
      secure: true,
      httpOnly: true,
    })
    expect(observed).toEqual([])
  })

  it('should discard queued topics when SQLite fails at COMMIT rather than inside the callback', () => {
    getDb().exec(`CREATE TABLE refresh_commit_probe (
      script_id TEXT REFERENCES user_scripts(id) DEFERRABLE INITIALLY DEFERRED
    )`)
    let callbackFinished = false
    expect(() =>
      runUserScriptTransaction(() => {
        createScript(scriptInput)
        getDb().prepare('INSERT INTO refresh_commit_probe(script_id) VALUES (?)').run('missing')
        callbackFinished = true
      }),
    ).toThrow('FOREIGN KEY constraint failed')
    expect(callbackFinished).toBe(true)
    expect(getDb().inTransaction).toBe(false)
    expect(getAllScripts()).toEqual([])
    expect(observed).toEqual([])
  })

  it('should keep the outer native commit when an inner savepoint failure is caught', () => {
    let outerId = ''
    runUserScriptTransaction(() => {
      outerId = createScript(scriptInput)
      expect(() =>
        runUserScriptTransaction(() => {
          upsertProblem(identity)
          throw new Error('inner rollback')
        }),
      ).toThrow('inner rollback')
      setUserScriptValue(outerId, 'state', 'outer committed')
    })
    expect(getRecentProblems(10)).toEqual([])
    expect(getAllScripts()).toHaveLength(1)
    expect(getUserScriptValue(outerId, 'state')?.value).toBe('outer committed')
    expect(observed).toEqual([{ tables: ['scripts'] }])
  })

  it('should retain notifications for committed submissions when a later batch insert fails', () => {
    upsertProblem(identity)
    const problemId = getRecentProblems(1)[0].id
    observed.length = 0
    getDb().exec(`CREATE TRIGGER reject_batch_second BEFORE INSERT ON submissions
      WHEN NEW.platform_submission_id = 'second'
      BEGIN SELECT RAISE(ABORT, 'second item rejected'); END;`)
    const writer = createDefaultSubmissionBatchWriter()
    expect(() =>
      writer.write({
        platform: 'codeforces',
        submissions: ['first', 'second'].map((platformSubmissionId) => ({
          platform: 'codeforces',
          platformSubmissionId,
          problemId,
          verdict: 'WA' as const,
          submittedAt: '2026-11-04T10:00:00',
        })),
      }),
    ).toThrow('second item rejected')
    const stored = getDb().prepare('SELECT platform_submission_id FROM submissions').all()
    expect(stored).toEqual([{ platform_submission_id: 'first' }])
    expect(observed).toEqual([{ tables: ['submissions', 'problems', 'stats'] }])
  })

  it('should discard failed legacy script claims and publish successful claims after commit', () => {
    const id = createScript({ ...scriptInput, namespace: null })
    observed.length = 0
    expect(updateScriptWithLegacyClaim(id, 'legacy.example', {})).toBe(false)
    expect(getAllScripts()[0].namespace).toBeNull()
    expect(observed).toEqual([])
    expect(updateScriptWithLegacyClaim(id, 'legacy.example', { code: 'updated' })).toBe(true)
    expect(observed).toEqual([{ tables: ['scripts'] }])
  })

  it('should suppress all import notifications when derived-stat rebuilding rolls back', () => {
    upsertProblem(identity)
    const incoming = exportLearningData()
    const original = incoming.tables.problems[0]
    incoming.tables.problems = [{ ...original, id: 'new-id', platform_problem_id: '1000B' }]
    incoming.tables.submissions = [
      {
        id: 'incoming-ac',
        problem_id: 'new-id',
        platform: 'codeforces',
        platform_submission_id: 'incoming-ac',
        verdict: 'AC',
        is_first_ac: 0,
        submitted_at: '2026-11-04T10:00:00',
        created_at: '2026-11-04T10:00:00',
        updated_at: '2026-11-04T10:00:00',
      },
    ]
    observed.length = 0
    getDb().exec(`CREATE TRIGGER reject_refresh_stats BEFORE INSERT ON user_daily_stats
      BEGIN SELECT RAISE(ABORT, 'forced stats failure'); END;`)
    expect(() => importLearningData(incoming)).toThrow('forced stats failure')
    expect(getRecentProblems(10)).toHaveLength(1)
    expect(observed).toEqual([])
    getDb().exec('DROP TRIGGER reject_refresh_stats')
    expect(importLearningData(incoming).success).toBe(true)
    expect(getRecentProblems(10)).toHaveLength(2)
    expect(observed).toHaveLength(1)
    expect(topics()).toEqual(['problems', 'stats', 'submissions'])
  })
})
