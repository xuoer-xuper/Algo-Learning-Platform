import assert from 'node:assert/strict'
import { test } from 'vitest'
import { toChinaStandardTime } from '../../electron/shared/time'

test('formats explicit UTC+8 timestamps independently of the host timezone', () => {
  assert.strictEqual(
    toChinaStandardTime(new Date('2026-08-17T16:30:45.123Z')),
    '2026-08-18T00:30:45.123',
  )
})
