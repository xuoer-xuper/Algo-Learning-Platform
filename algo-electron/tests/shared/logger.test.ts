import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { AppLogger } from '../../electron/shared/logger.ts'

test('file logger buffers early entries, redacts secrets, and rotates bounded archives', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-logger-'))
  try {
    const logger = new AppLogger({
      maxFileBytes: 220,
      maxArchives: 2,
      mirrorToConsole: false,
      now: () => new Date('2026-08-17T02:30:00.000Z'),
    })

    logger.info('startup https://example.com/path?token=visible#fragment', {
      password: 'plain-password',
      nested: { apiKey: 'plain-key' },
      authorization: 'Bearer plain-token',
    })
    logger.initialize(root)

    const initialOutput = fs.readFileSync(path.join(root, 'main.log'), 'utf8')
    assert.ok(initialOutput.includes('https://example.com/path'))
    assert.ok(!initialOutput.includes('?token=visible'))
    assert.ok(!initialOutput.includes('plain-password'))
    assert.ok(!initialOutput.includes('plain-key'))
    assert.ok(!initialOutput.includes('plain-token'))
    assert.ok(initialOutput.includes('[redacted]'))

    for (let index = 0; index < 8; index += 1) {
      logger.warn(`rotation-entry-${index}`, { detail: 'x'.repeat(80) })
    }

    const files = fs.readdirSync(root).sort()
    assert.deepStrictEqual(files, ['main.log', 'main.log.1', 'main.log.2'])
    assert.strictEqual(logger.getLogFilePath(), path.join(root, 'main.log'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('logger serializes errors and circular values without throwing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-logger-circular-'))
  try {
    const logger = new AppLogger({ mirrorToConsole: false })
    const circular: Record<string, unknown> = { label: 'value' }
    circular.self = circular
    logger.initialize(root)

    assert.doesNotThrow(() => logger.error('failure', new Error('broken'), circular, undefined, null))
    const output = fs.readFileSync(path.join(root, 'main.log'), 'utf8')
    assert.ok(output.includes('Error: broken'))
    assert.ok(output.includes('[circular]'))
    assert.ok(output.includes('undefined'))
    assert.ok(output.includes('null'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
