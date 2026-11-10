import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  normalizeThemePreference,
} from '../../electron/app/themePreference'
import { ThemeController } from '../../electron/app/themeController'
import { THEME_PREFERENCES } from '@shared/constants/preferences'

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
  harness.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-theme-config-'))
  vi.resetModules()
})

afterEach(() => {
  fs.rmSync(harness.userDataDir, { recursive: true, force: true })
})

describe('主题偏好规范化', () => {
  it('三档偏好与 Electron themeSource 同名，默认跟随系统', () => {
    expect([...THEME_PREFERENCES]).toEqual(['system', 'light', 'dark'])
    expect(DEFAULT_THEME_PREFERENCE).toBe('system')
  })

  it('非法值一律落回默认档', () => {
    for (const value of ['System', 'DARK', '', 'auto', null, undefined, 1, {}, ['dark']]) {
      expect(isThemePreference(value)).toBe(false)
      expect(normalizeThemePreference(value)).toBe('system')
    }
    for (const value of THEME_PREFERENCES) {
      expect(isThemePreference(value)).toBe(true)
      expect(normalizeThemePreference(value)).toBe(value)
    }
  })

  // appearance 域的结构规范化（缺失/非对象 → 默认档）已随 electron-store 替换
  // 收进 config.ts 的 zod schema（appearanceConfigSchema），行为由下文
  // "主题偏好持久化"与 tests/app/configCompatibility.test.ts 覆盖。
})

describe('主题偏好持久化', () => {
  it('缺 appearance 的旧配置读成默认档并回写一次', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ homeShortcuts: [] }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getThemePreference()).toBe('system')

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(persisted.appearance).toEqual({ theme: 'system' })
  })

  it('非法存量值被规范化后落盘，不保留原值', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ appearance: { theme: 'midnight' } }))

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getThemePreference()).toBe('system')
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(persisted.appearance).toEqual({ theme: 'system' })
  })

  it('已规范化的完整配置不触发回写', async () => {
    // 必须每段都规范（含 coach）：electron-store 版的收敛判定是"文件内容 == 解析
    // 结果则不动盘"，缺任何一段都会触发一次补齐回写。
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        homeShortcuts: [],
        coach: {
          enabled: true,
          sound: true,
          bubbleFrequency: 'medium',
          position: null,
          scale: 1,
          opacity: 1,
          pinMode: 'follow',
        },
        search: { engine: 'bing', customTemplate: null },
        zoomByOrigin: {},
        appearance: { theme: 'dark' },
      }),
    )

    const original = fs.readFileSync(configPath)
    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getThemePreference()).toBe('dark')
    expect(fs.readFileSync(configPath)).toEqual(original)
    expect(fs.existsSync(path.join(harness.userDataDir, 'config-normalization-backups'))).toBe(
      false,
    )
  })

  it('appearance 是唯一未规范化的段时也会回写', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        homeShortcuts: [],
        coach: {
          enabled: true,
          sound: true,
          bubbleFrequency: 'medium',
          position: null,
          scale: 1,
          opacity: 1,
          pinMode: 'follow',
        },
        search: { engine: 'bing', customTemplate: null },
        zoomByOrigin: {},
        appearance: { theme: 'midnight' },
      }),
    )

    const original = fs.readFileSync(configPath)
    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.getThemePreference()).toBe('system')
    const normalized = fs.readFileSync(configPath)
    expect(JSON.parse(normalized.toString('utf8'))).toEqual({
      ...JSON.parse(original.toString('utf8')),
      appearance: { theme: 'system' },
    })
    const backupDir = path.join(harness.userDataDir, 'config-normalization-backups')
    const backups = fs.readdirSync(backupDir)
    expect(backups).toHaveLength(1)
    expect(fs.readFileSync(path.join(backupDir, backups[0]))).toEqual(original)

    vi.resetModules()
    const restartedConfig = await import('../../electron/app/config.ts')
    expect(restartedConfig.getThemePreference()).toBe('system')
    expect(fs.readFileSync(configPath)).toEqual(normalized)
    expect(fs.readdirSync(backupDir)).toEqual(backups)
  })

  it('保存返回落盘后的值，并且不动其他配置段', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        homeShortcuts: ['https://codeforces.com/'],
        appearance: { theme: 'system' },
      }),
    )

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.saveThemePreference('dark')).toBe('dark')
    expect(configModule.getThemePreference()).toBe('dark')

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    expect(persisted.appearance).toEqual({ theme: 'dark' })
    expect(persisted.homeShortcuts).toEqual(['https://codeforces.com/'])
  })
})

describe('ThemeController', () => {
  const createController = (initial: string) => {
    const nativeTheme = { themeSource: 'system' as 'system' | 'light' | 'dark' }
    const store = { theme: initial }
    const controller = new ThemeController({
      nativeTheme,
      readPreference: () => store.theme as never,
      writePreference: (theme) => {
        store.theme = theme
        return theme
      },
    })
    return { controller, nativeTheme, store }
  }

  it('启动时把持久化偏好推给 themeSource', () => {
    const { controller, nativeTheme } = createController('dark')
    expect(controller.apply()).toBe('dark')
    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('存量值损坏时启动不会把非法值写进 themeSource', () => {
    const { controller, nativeTheme } = createController('midnight')
    expect(controller.apply()).toBe('system')
    expect(nativeTheme.themeSource).toBe('system')
  })

  it('set 先落盘再赋值，返回的是落盘结果', () => {
    const order: string[] = []
    const nativeTheme = {
      get themeSource() {
        return 'system' as const
      },
      set themeSource(_value: 'system' | 'light' | 'dark') {
        order.push('assign')
      },
    }
    const controller = new ThemeController({
      nativeTheme,
      readPreference: () => 'system',
      writePreference: (theme) => {
        order.push('persist')
        return theme
      },
    })

    expect(controller.set('light')).toBe('light')
    expect(order).toEqual(['persist', 'assign'])
  })

  it('落盘失败时不改 themeSource', () => {
    const nativeTheme = { themeSource: 'light' as 'system' | 'light' | 'dark' }
    const controller = new ThemeController({
      nativeTheme,
      readPreference: () => 'light',
      writePreference: () => {
        throw new Error('read-only config')
      },
    })

    expect(() => controller.set('dark')).toThrow('read-only config')
    expect(nativeTheme.themeSource).toBe('light')
  })

  it('set 收到非法值时存的是规范化结果', () => {
    const { controller, nativeTheme, store } = createController('system')
    expect(controller.set('neon')).toBe('system')
    expect(store.theme).toBe('system')
    expect(nativeTheme.themeSource).toBe('system')
  })

  it('get 也对损坏的存量值兜底', () => {
    const { controller } = createController('DARK')
    expect(controller.get()).toBe('system')
  })
})
