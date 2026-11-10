import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachConfig } from '@shared/types/coach'

/*
 * electron-store 替换（R3）的文件兼容性验收：electron-store 必须能直接读旧读取器
 * 写出的 userData/config.json，且一个字段都不能悄悄丢掉。
 *
 * 样本来源（design §3 的硬性要求：不得凭空编造）：开发者机器上的真实
 * %APPDATA%\algo-electron\config.json（2.0.0-rc.1 起写入格式未变：2 空格缩进、
 * homeShortcuts/coach/search/zoomByOrigin/appearance 顺序）。唯一改动是把
 * coach.llm.encrypted_api_key 的值换成等长假 envelope——字段形状才是被测对象，
 * 真实加密材料不入库。
 */

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

const FIXTURE_PATH = path.join(import.meta.dirname, 'fixtures', 'rc1-config.json')

function readFixture(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8')) as Record<string, unknown>
}

beforeEach(() => {
  harness.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algo-config-compat-'))
  vi.resetModules()
})

afterEach(() => {
  const resolved = path.resolve(harness.userDataDir)
  expect(resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}algo-config-compat-`)).toBe(
    true,
  )
  fs.rmSync(resolved, { recursive: true, force: true })
})

describe('rc.1 config.json 兼容', () => {
  it('真实样本的每个字段加载后原样保留，不丢字段、不改值', async () => {
    const fixture = readFixture()
    fs.writeFileSync(
      path.join(harness.userDataDir, 'config.json'),
      JSON.stringify(fixture, null, 2),
    )

    const configModule = await import('../../electron/app/config.ts')
    const loaded = configModule.loadConfig()

    expect(loaded.homeShortcuts).toEqual(fixture.homeShortcuts)
    expect(loaded.search).toEqual(fixture.search)
    expect(loaded.zoomByOrigin).toEqual(fixture.zoomByOrigin)
    expect(loaded.appearance).toEqual(fixture.appearance)
    expect(loaded.coach).toEqual(fixture.coach)

    // 逐项再点一遍 coach 的关键字段，断言失败时能直接看出是哪个字段丢了。
    const coach = fixture.coach as CoachConfig
    expect(loaded.coach.enabled).toBe(coach.enabled)
    expect(loaded.coach.sound).toBe(coach.sound)
    expect(loaded.coach.bubbleFrequency).toBe(coach.bubbleFrequency)
    expect(loaded.coach.position).toEqual(coach.position)
    expect(loaded.coach.scale).toBe(coach.scale)
    expect(loaded.coach.opacity).toBe(coach.opacity)
    expect(loaded.coach.pinMode).toBe(coach.pinMode)
    expect(loaded.coach.disclaimer_dismissed).toBe(coach.disclaimer_dismissed)
    expect(loaded.coach.llm).toEqual(coach.llm)
  })

  it('加密 API Key envelope 只存在于主进程配置，渲染层视图仍被摘除', async () => {
    const fixture = readFixture()
    fs.writeFileSync(
      path.join(harness.userDataDir, 'config.json'),
      JSON.stringify(fixture, null, 2),
    )

    const configModule = await import('../../electron/app/config.ts')
    const envelope = (fixture.coach as CoachConfig).llm?.encrypted_api_key
    expect(envelope).toBeTruthy()
    expect(configModule.loadCoachConfig().llm?.encrypted_api_key).toBe(envelope)
    expect(configModule.getCoachConfigForRenderer().llm).not.toHaveProperty('encrypted_api_key')
  })

  it('规范完整的配置文件在加载时不被改写（字节不变）', async () => {
    const fixture = readFixture()
    const configPath = path.join(harness.userDataDir, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify(fixture, null, 2))
    const before = fs.readFileSync(configPath, 'utf-8')

    const configModule = await import('../../electron/app/config.ts')
    configModule.loadConfig()

    expect(fs.readFileSync(configPath, 'utf-8')).toBe(before)
    expect(fs.existsSync(path.join(harness.userDataDir, 'config-normalization-backups'))).toBe(
      false,
    )
  })

  it('默认值只补真正缺失的键，已有字段不动', async () => {
    const fixture = readFixture()
    const partial = { ...fixture } as Record<string, unknown>
    delete partial.appearance
    delete partial.zoomByOrigin
    fs.writeFileSync(
      path.join(harness.userDataDir, 'config.json'),
      JSON.stringify(partial, null, 2),
    )

    const configModule = await import('../../electron/app/config.ts')
    const loaded = configModule.loadConfig()

    // 缺失的域用默认值补齐
    expect(loaded.appearance).toEqual({ theme: 'system' })
    expect(loaded.zoomByOrigin).toEqual({})
    // 未缺失的域原样保留（含 coach.position 这种非默认值）
    expect(loaded.coach).toEqual(fixture.coach)
    expect(loaded.search).toEqual(fixture.search)
  })

  it('无法解析的配置文件按默认配置运行且文件原样保留，绝不清空', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    const corrupt = '{ "homeShortcuts": [ broken'
    fs.writeFileSync(configPath, corrupt)

    const configModule = await import('../../electron/app/config.ts')
    expect(configModule.loadConfig()).toMatchObject({
      homeShortcuts: [],
      search: { engine: 'bing', customTemplate: null },
    })
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(corrupt)
    expect(fs.existsSync(path.join(harness.userDataDir, 'config-normalization-backups'))).toBe(
      false,
    )
  })

  it('降级态下保存设置会报错给调用方，而不是盲目覆写坏文件', async () => {
    const configPath = path.join(harness.userDataDir, 'config.json')
    const corrupt = 'not json at all'
    fs.writeFileSync(configPath, corrupt)

    const configModule = await import('../../electron/app/config.ts')
    expect(() =>
      configModule.saveSearchConfig({ engine: 'google', customTemplate: null }),
    ).toThrow()
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(corrupt)
  })
})
