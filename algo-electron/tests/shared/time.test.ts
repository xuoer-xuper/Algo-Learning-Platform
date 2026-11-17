import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parseLegacyTimestamp } from '../../electron/shared/legacyTimestamp'

test('parses legacy explicit UTC+8 timestamps independently of the host timezone', () => {
  assert.strictEqual(
    parseLegacyTimestamp('2026-08-18T00:30:45.123', 'utc8'),
    Date.parse('2026-08-17T16:30:45.123Z'),
  )
})
