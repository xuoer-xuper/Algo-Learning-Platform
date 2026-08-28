// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 设置页三个面板的读路径失败契约。
 *
 * 这些面板的「读失败」与「本来就没配置」在界面上长得一样：Key 未配置、输入框为空、
 * 停在加载中。守住这层是为了让静默失败不能再伪装成正常空态。
 */

const loadLlmConfig = vi.fn<() => Promise<LlmConfigStatus | null>>()
const loadPrimaryCodeforcesAccount = vi.fn<() => Promise<unknown>>()

vi.mock('../../src/features/settings/settingsApi', () => ({
  loadLlmConfig: () => loadLlmConfig(),
  saveLlmApiKey: vi.fn(async () => true),
  saveLlmConfig: vi.fn(async () => undefined),
  testLlmConnection: vi.fn(async () => ({ success: true, message: 'ok' })),
  loadPrimaryCodeforcesAccount: () => loadPrimaryCodeforcesAccount(),
  syncCodeforcesRatingProfile: vi.fn(),
  syncCodeforcesSubmissions: vi.fn(),
}))

import { CoachPanel } from '../../src/features/settings/CoachPanel'
import { CodeforcesSyncPanel } from '../../src/features/settings/CodeforcesSyncPanel'
import { LlmConfigPanel } from '../../src/features/settings/LlmConfigPanel'

const coachGetConfig = vi.fn<() => Promise<CoachConfig>>()
const coachSaveConfig = vi.fn<(partial: Partial<CoachConfig>) => Promise<unknown>>()

function createCoachConfig(): CoachConfig {
  return {
    enabled: true,
    sound: false,
    bubbleFrequency: 'medium',
    scale: 1,
    opacity: 0.9,
  } as CoachConfig
}

beforeEach(() => {
  vi.clearAllMocks()
  loadLlmConfig.mockResolvedValue(null)
  loadPrimaryCodeforcesAccount.mockResolvedValue(null)
  coachGetConfig.mockResolvedValue(createCoachConfig())
  coachSaveConfig.mockResolvedValue(undefined)
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      coachGetConfig: () => coachGetConfig(),
      coachSaveConfig: (partial: Partial<CoachConfig>) => coachSaveConfig(partial),
      coachTestHint: vi.fn(),
      coachResetPosition: vi.fn(),
    },
  })
})

afterEach(cleanup)

describe('LlmConfigPanel', () => {
  it('读配置失败时报错，且不再声称「未配置 API Key」', async () => {
    loadLlmConfig.mockRejectedValue(new Error('safeStorage 不可用'))
    render(<LlmConfigPanel />)

    expect((await screen.findByRole('alert')).textContent).toContain('读取失败：safeStorage 不可用')
    // 关键区分：状态未知 ≠ 没配置。后者会诱导用户覆盖掉已存在的 Key。
    expect(screen.getByText('配置状态未知')).not.toBeNull()
    expect(screen.queryByText('未配置 API Key，请先填写并保存')).toBeNull()
  })

  it('读成功且确实没配置时，保留原有空态文案', async () => {
    loadLlmConfig.mockResolvedValue({ has_key: false, key_masked: '', base_url: '', model: '', enabled: false } as LlmConfigStatus)
    render(<LlmConfigPanel />)

    expect(await screen.findByText('未配置 API Key，请先填写并保存')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('CoachPanel', () => {
  it('读配置失败时报错，而不是永远停在「加载中...」', async () => {
    coachGetConfig.mockRejectedValue(new Error('config.json 损坏'))
    render(<CoachPanel />)

    expect((await screen.findByRole('alert')).textContent).toContain('读取配置失败：config.json 损坏')
    expect(screen.queryByText('加载中...')).toBeNull()
  })

  it('保存失败时回滚开关，避免界面与已持久化配置不一致', async () => {
    coachSaveConfig.mockRejectedValue(new Error('磁盘只读'))
    render(<CoachPanel />)

    const sound = await screen.findByLabelText('提示声音') as HTMLInputElement
    expect(sound.checked).toBe(false)

    fireEvent.click(sound)
    // 乐观更新先生效，随后写失败必须把勾选状态退回去。
    expect(sound.checked).toBe(true)

    await waitFor(() => expect(screen.getByText('保存失败：磁盘只读')).not.toBeNull())
    expect((screen.getByLabelText('提示声音') as HTMLInputElement).checked).toBe(false)
  })
})

describe('CodeforcesSyncPanel', () => {
  it('读已绑定 Handle 失败时报错，而不是留一个空输入框', async () => {
    loadPrimaryCodeforcesAccount.mockRejectedValue(new Error('database is locked'))
    render(<CodeforcesSyncPanel onStatsRefresh={vi.fn()} />)

    expect(await screen.findByText('读取已绑定 Handle 失败: database is locked')).not.toBeNull()
  })
})
