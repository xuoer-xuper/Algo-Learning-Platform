import assert from 'node:assert/strict'
import { test } from 'vitest'
import { localDayFromTimestamp, nextLocalDay } from '../../electron/db/repositories/stats/date.ts'

test('builds stable local-day range boundaries', () => {
  assert.strictEqual(nextLocalDay('2026-08-18'), '2026-08-19')
  assert.strictEqual(nextLocalDay('2024-02-29'), '2024-03-01')
  assert.strictEqual(nextLocalDay('2026-12-31'), '2027-01-01')
  assert.throws(() => nextLocalDay('2026-02-30'), /Invalid local day/)
})

test('extracts only valid leading local days from timestamps', () => {
  assert.strictEqual(localDayFromTimestamp(new Date(2026, 7, 18, 10).getTime()), '2026-08-18')
  assert.strictEqual(localDayFromTimestamp(new Date(2026, 7, 18).getTime()), '2026-08-18')
  assert.strictEqual(localDayFromTimestamp(Number.NaN), null)
})
