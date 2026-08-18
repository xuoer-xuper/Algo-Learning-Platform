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
  harness.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-config-migration-'))
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(harness.userDataDir, { recursive: true, force: true })
})

describe('app config migration', () => {
  it('moves the legacy default home URL into shortcuts and removes the old field', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      defaultHomeUrl: 'https://legacy.example/problemset',
      coach: { enabled: false },
    }))

    const configModule = await import('../../electron/app/config.ts')
    const config = configModule.loadConfig()

    expect(config.homeShortcuts).toEqual(['https://legacy.example/problemset'])
    expect(config.coach.enabled).toBe(false)
    expect(config.coach.sound).toBe(true)
    expect(configModule.getHomeShortcuts()).toEqual(['https://legacy.example/problemset'])

    const migrated = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(migrated.defaultHomeUrl).toBeUndefined()
    expect(migrated.homeShortcuts).toEqual(['https://legacy.example/problemset'])
  })

  it('deduplicates valid HTTP shortcuts and drops unsupported legacy values', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      defaultHomeUrl: 'https://legacy.example/',
      homeShortcuts: [
        'https://legacy.example/',
        'not a url',
        'ftp://legacy.example/file',
        'https://user:password@private.example/problemset',
      ],
    }))

    const { loadConfig } = await import('../../electron/app/config.ts')
    expect(loadConfig().homeShortcuts).toEqual(['https://legacy.example/'])
  })

  it('keeps the migrated config in memory when legacy writeback fails', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      defaultHomeUrl: 'https://legacy.example/problemset',
      coach: { enabled: false },
    }))

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('read-only config')
    })
    try {
      const configModule = await import('../../electron/app/config.ts')
      expect(configModule.loadConfig()).toMatchObject({
        homeShortcuts: ['https://legacy.example/problemset'],
        coach: { enabled: false, sound: true },
      })
      expect(configModule.getHomeShortcuts()).toEqual(['https://legacy.example/problemset'])
    } finally {
      writeSpy.mockRestore()
    }

    const unchanged = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(unchanged.defaultHomeUrl).toBe('https://legacy.example/problemset')
  })
})
