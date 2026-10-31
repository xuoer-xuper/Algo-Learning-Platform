import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, test } from 'vitest'
import {
  clearSessionRunningMarkerSync,
  createSessionRunningMarker,
  sessionRunningMarkerPath,
  wasLastSessionInterrupted,
} from '../../electron/windows/sessionExitMarker'

let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'algo-session-marker-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('marker lifecycle: absent means clean exit, present means interrupted, sync clear removes it', async () => {
  assert.strictEqual(
    await wasLastSessionInterrupted(dir),
    false,
    'no marker → last session closed cleanly',
  )

  await createSessionRunningMarker(dir)
  assert.strictEqual(
    await wasLastSessionInterrupted(dir),
    true,
    'marker present → last session was interrupted',
  )

  clearSessionRunningMarkerSync(dir)
  assert.strictEqual(
    await wasLastSessionInterrupted(dir),
    false,
    'sync clear on quit removes the marker',
  )
})

test('sync clear is a no-op when the marker is already gone', () => {
  clearSessionRunningMarkerSync(path.join(dir, 'never-created'))
  assert.strictEqual(sessionRunningMarkerPath(dir).endsWith('session-running.marker'), true)
})
