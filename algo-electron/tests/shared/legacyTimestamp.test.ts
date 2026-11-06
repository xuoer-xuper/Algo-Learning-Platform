import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { parseLegacyTimestamp } from '../../electron/shared/legacyTimestamp'
import { formatForDisplay, localDayBounds, shiftLocalDay, toLocalDay } from '../../src/shared/time'

describe('legacy timestamp parsing', () => {
  it('should preserve explicit offsets, millisecond precision and epoch zero', () => {
    expect(parseLegacyTimestamp('2026-01-15T02:20:30.123Z', 'local')).toBe(1768443630123)
    expect(parseLegacyTimestamp('2026-01-15 10:20:30.123+08:00', 'local')).toBe(1768443630123)
    expect(parseLegacyTimestamp('2026-01-15T10:20:30.123', 'utc8')).toBe(1768443630123)
    expect(parseLegacyTimestamp('1970-01-01T00:00:00Z', 'utc8')).toBe(0)
    expect(parseLegacyTimestamp(0, 'local')).toBe(0)
    expect(parseLegacyTimestamp(null, 'local')).toBeNull()
    expect(parseLegacyTimestamp('0001-01-01T00:00:00Z', 'local')).toBe(-62135596800000)
  })

  it('should preserve integer milliseconds serialized by SQLite TEXT affinity without unit inference', () => {
    expect(parseLegacyTimestamp('1768443630123.0', 'local')).toBe(1768443630123)
    expect(parseLegacyTimestamp('1768443630123.000', 'utc8')).toBe(1768443630123)
    expect(parseLegacyTimestamp('0.0', 'local')).toBe(0)
    expect(parseLegacyTimestamp('-1.0', 'utc8')).toBe(-1)
    expect(parseLegacyTimestamp('123.0', 'local')).toBe(123)
    expect(() => parseLegacyTimestamp('1768443630123.1', 'local')).toThrow()
    expect(() => parseLegacyTimestamp('9007199254740992.0', 'local')).toThrow()
    expect(() => parseLegacyTimestamp('8640000000000001.0', 'local')).toThrow()
    expect(() => parseLegacyTimestamp('1768443630123', 'local')).toThrow()
    expect(() => parseLegacyTimestamp('1.768443630123e12', 'local')).toThrow()
  })

  it.each([
    '',
    '2026-01-15',
    '1768443630123',
    '2026-02-30T10:00:00',
    '2026-01-15T24:00:00',
    '2026-01-15T10:20:30.1234Z',
    '2026-01-15T10:20:30+24:00',
    '2026-01-15T10:20:30+01:60',
  ])('should reject invalid or ambiguous shapes without printing the value: %s', (value) => {
    expect(() =>
      parseLegacyTimestamp(value, 'local', { table: 'notes', column: 'created_at' }),
    ).toThrow(/Invalid legacy timestamp at notes.created_at/)
    try {
      parseLegacyTimestamp(value, 'local')
    } catch (error) {
      expect(String(error)).not.toContain(value || 'raw-empty-input')
    }
  })

  it('should use calendar days and format zero without treating it as missing', () => {
    expect(shiftLocalDay('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftLocalDay('2024-02-29', 1)).toBe('2024-03-01')
    expect(() => localDayBounds('2026-02-30')).toThrow()
    expect(toLocalDay(0)).toMatch(/^19[67]\d-\d{2}-\d{2}$/)
    expect(formatForDisplay(0, { timeZone: 'UTC' })).toContain('1970')
  })

  it.each([
    ['UTC', 0, 1768472430123],
    ['Asia/Shanghai', -480, 1768443630123],
    ['America/New_York', 300, 1768490430123],
  ])(
    'should honor local and fixed policies in a separate %s process',
    (zone, offset, localEpoch) => {
      const parser = fs.readFileSync(
        path.join(process.cwd(), 'electron/shared/legacyTimestamp.ts'),
        'utf8',
      )
      const helpers = fs.readFileSync(path.join(process.cwd(), 'src/shared/time.ts'), 'utf8')
      const url = (source: string) =>
        'data:text/javascript;base64,' +
        Buffer.from(
          ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          }).outputText,
        ).toString('base64')
      const script = `import assert from 'node:assert/strict';
      const {parseLegacyTimestamp:p}=await import(${JSON.stringify(url(parser))});
      const {localDayBounds:b}=await import(${JSON.stringify(url(helpers))});
      assert.equal(new Date('2026-01-15T00:00:00Z').getTimezoneOffset(), ${offset});
      assert.equal(p('2026-01-15T10:20:30.123','local'),${localEpoch});
      assert.equal(p('2026-01-15T10:20:30.123','utc8'),1768443630123);
      assert.equal(p('2026-01-15T02:20:30.123Z','local'),1768443630123);
      assert.equal(p('1768443630123.0','local'),1768443630123);
      assert.equal(p('1768443630123.0','utc8'),1768443630123);
      if(process.env.TZ==='America/New_York') {
        assert.throws(()=>p('2026-03-08T02:30:00','local'),/nonexistent/);
        assert.equal(p('2026-11-01T01:30:00','local'),1793511000000);
        assert.equal(b('2026-03-08').end-b('2026-03-08').start,23*3600000);
        assert.equal(b('2026-11-01').end-b('2026-11-01').start,25*3600000);
      }`
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: String(zone) },
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
    },
  )
})
