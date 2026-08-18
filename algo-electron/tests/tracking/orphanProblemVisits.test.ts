import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  closeOrphanProblemVisits,
  ORPHAN_VISIT_LEAVE_REASON,
} from '../../electron/tracking/orphanProblemVisits.ts'

test('closes every orphan visit at entered_at with an explicit recovery reason', () => {
  let preparedSql = ''
  let runArgs: unknown[] = []
  const database = {
    prepare: (sql: string) => {
      preparedSql = sql
      return {
        run: (...args: unknown[]) => {
          runArgs = args
          return { changes: 2 }
        },
      }
    },
  }

  const changes = closeOrphanProblemVisits(
    database as never,
    '2026-08-18T10:00:00.000',
  )

  assert.strictEqual(changes, 2)
  assert.match(preparedSql, /left_at = entered_at/)
  assert.match(preparedSql, /WHERE left_at IS NULL/)
  assert.deepStrictEqual(runArgs, [ORPHAN_VISIT_LEAVE_REASON, '2026-08-18T10:00:00.000'])
})
