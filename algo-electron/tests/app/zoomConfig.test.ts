import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    app: {
      getPath: () => harness.userDataDir,
    },
  }
})

beforeEach(() => {
  harness.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-zoom-config-'))
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(harness.userDataDir, { recursive: true, force: true })
})

describe('per-origin zoom config', () => {
  it('migrates missing and malformed preferences to a sparse normalized map', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      zoomByOrigin: {
        'HTTPS://EXAMPLE.COM:443/path': 1.249,
        'https://default.example': 1,
        'file:///tmp/a': 2,
        'https://too-large.example': 20,
      },
    }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getZoomPreferences()).toEqual({ 'https://example.com': 1.25 })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(persisted.zoomByOrigin).toEqual({ 'https://example.com': 1.25 })
  })

  it('looks up and saves zoom by normalized origin while keeping 100% sparse', async () => {
    const configModule = await import('../../electron/app/config.ts')

    expect(configModule.getZoomFactorForUrl('https://codeforces.com/problemset')).toBe(1)
    expect(configModule.saveZoomFactorForUrl(
      'https://CODEFORCES.com:443/problemset/problem/1/A',
      1.25,
    )).toBe(1.25)
    expect(configModule.getZoomFactorForUrl('https://codeforces.com/contest/1')).toBe(1.25)
    expect(configModule.saveZoomFactorForUrl('https://codeforces.com/', 1)).toBe(1)
    expect(configModule.getZoomPreferences()).toEqual({})
  })

  it('rejects invalid input without changing config', async () => {
    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.saveZoomFactorForUrl('file:///C:/secret', 1.25)).toBeNull()
    expect(configModule.saveZoomFactorForUrl('https://example.com', 20)).toBeNull()
    expect(configModule.getZoomPreferences()).toEqual({})
  })

  it('does not publish a zoom change when writing fails', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      zoomByOrigin: { 'https://example.com': 1.25 },
    }))
    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getZoomFactorForUrl('https://example.com/path')).toBe(1.25)

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('read-only config')
    })
    try {
      expect(() => configModule.saveZoomFactorForUrl('https://example.com/path', 1.5))
        .toThrow('read-only config')
    } finally {
      writeSpy.mockRestore()
    }

    expect(configModule.getZoomFactorForUrl('https://example.com/path')).toBe(1.25)
  })
})
