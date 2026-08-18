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

  it('adds the default Bing search config to older config files', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ homeShortcuts: [] }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.loadConfig().search).toEqual({ engine: 'bing', customTemplate: null })
    expect(configModule.getSearchConfig()).toEqual({ engine: 'bing', customTemplate: null })

    const migrated = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(migrated.search).toEqual({ engine: 'bing', customTemplate: null })
  })

  it('preserves a valid custom HTTPS search template', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    const search = {
      engine: 'custom',
      customTemplate: 'https://search.example/?q={query}',
    }
    fs.writeFileSync(configPath, JSON.stringify({ search }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.loadConfig().search).toEqual(search)
  })

  it('sanitizes an unsafe custom search template to the Bing default', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      search: {
        engine: 'custom',
        customTemplate: 'http://user:password@search.example/?q={query}',
      },
    }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.loadConfig().search).toEqual({ engine: 'bing', customTemplate: null })

    const migrated = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(migrated.search).toEqual({ engine: 'bing', customTemplate: null })
  })

  it('sanitizes search config again before saving', async () => {
    const configModule = await import('../../electron/app/config.ts')
    configModule.saveSearchConfig({
      engine: 'custom',
      customTemplate: 'https://search.example/?q={query}&again={query}',
    })

    expect(configModule.getSearchConfig()).toEqual({ engine: 'bing', customTemplate: null })
    const persisted = JSON.parse(
      fs.readFileSync(path.join(harness.userDataDir, 'config.json'), 'utf-8'),
    ) as Record<string, unknown>
    expect(persisted.search).toEqual({ engine: 'bing', customTemplate: null })
  })

  it('keeps the active search config unchanged when saving fails', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    const originalSearch = { engine: 'google', customTemplate: null } as const
    fs.writeFileSync(configPath, JSON.stringify({ search: originalSearch }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getSearchConfig()).toEqual(originalSearch)

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('read-only config')
    })
    try {
      expect(() => configModule.saveSearchConfig({
        engine: 'custom',
        customTemplate: 'https://search.example/?q={query}',
      })).toThrow('read-only config')
    } finally {
      writeSpy.mockRestore()
    }

    expect(configModule.getSearchConfig()).toEqual(originalSearch)
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(persisted.search).toEqual(originalSearch)
  })

  it('does not expose the encrypted LLM envelope in renderer Coach config', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      coach: {
        enabled: true,
        llm: {
          encrypted_api_key: 'encrypted-envelope',
          base_url: 'https://llm.example/v1',
          model: 'model-a',
          enabled: true,
        },
      },
    }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.loadCoachConfig().llm?.encrypted_api_key).toBe('encrypted-envelope')
    expect(configModule.getCoachConfigForRenderer().llm).toEqual({
      base_url: 'https://llm.example/v1',
      model: 'model-a',
      enabled: true,
    })
  })
})
