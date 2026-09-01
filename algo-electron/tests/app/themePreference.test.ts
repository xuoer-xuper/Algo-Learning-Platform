import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME_PREFERENCE,
  isStoredAppearanceConfig,
  isThemePreference,
  normalizeAppearanceConfig,
  normalizeThemePreference,
  THEME_PREFERENCES,
} from '../../electron/app/themePreference'
import { ThemeController } from '../../electron/app/themeController'

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

  it('appearance 结构缺失、非对象或数组时给出默认外观', () => {
    for (const value of [undefined, null, 'dark', 42, ['dark']]) {
      expect(normalizeAppearanceConfig(value)).toEqual({ theme: 'system' })
    }
    expect(normalizeAppearanceConfig({ theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(normalizeAppearanceConfig({ theme: 'nope' })).toEqual({ theme: 'system' })
  })

  it('存量判定要求键数相符，多出的陌生键算未规范化', () => {
    expect(isStoredAppearanceConfig({ theme: 'dark' }, { theme: 'dark' })).toBe(true)
    expect(isStoredAppearanceConfig({ theme: 'light' }, { theme: 'dark' })).toBe(false)
    // 多一个键：规范化会把它丢掉，因此必须回写，否则那个键永远留在盘上
    expect(isStoredAppearanceConfig({ theme: 'dark', accent: 'red' }, { theme: 'dark' })).toBe(false)
    expect(isStoredAppearanceConfig(null, { theme: 'system' })).toBe(false)
    expect(isStoredAppearanceConfig(['dark'], { theme: 'system' })).toBe(false)
  })
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
    // 必须每段都规范：只写 appearance 会让 search 那条迁移判定失败而回写，
    // 于是"appearance 没触发回写"就验不出来了。
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      homeShortcuts: [],
      search: { engine: 'bing', customTemplate: null },
      zoomByOrigin: {},
      appearance: { theme: 'dark' },
    }))

    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    try {
      const configModule = await import('../../electron/app/config.ts')
      expect(configModule.getThemePreference()).toBe('dark')
      expect(writeSpy).not.toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('appearance 是唯一未规范化的段时也会回写', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      homeShortcuts: [],
      search: { engine: 'bing', customTemplate: null },
      zoomByOrigin: {},
      appearance: { theme: 'midnight' },
    }))

    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    try {
      const configModule = await import('../../electron/app/config.ts')
      expect(configModule.getThemePreference()).toBe('system')
      expect(writeSpy).toHaveBeenCalledTimes(1)
    } finally {
      writeSpy.mockRestore()
    }
  })

  it('保存返回落盘后的值，并且不动其他配置段', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      homeShortcuts: ['https://codeforces.com/'],
      appearance: { theme: 'system' },
    }))

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
      get themeSource() { return 'system' as const },
      set themeSource(_value: 'system' | 'light' | 'dark') { order.push('assign') },
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
      writePreference: () => { throw new Error('read-only config') },
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
