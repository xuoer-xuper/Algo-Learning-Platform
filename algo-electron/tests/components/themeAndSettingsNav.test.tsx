// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { applyThemeAttribute, DARK_COLOR_SCHEME_QUERY, installThemeAttribute } from '../../src/theme'

/**
 * B5.4 暗色模式与 B5.1 设置页分区导航。
 *
 * 主题的生效路径不经 React：主进程改 `nativeTheme.themeSource`，renderer 靠
 * `prefers-color-scheme` 的 media query 同步读出结果并翻 `data-theme`。这里验的就是
 * 那一层，以及"选完立刻写盘、写盘失败要把下拉框拨回去"这条界面契约。
 */

const loadThemePreference = vi.fn<() => Promise<ThemePreference>>()
const saveThemePreference = vi.fn<(theme: ThemePreference) => Promise<ThemePreference>>()
const loadSettingsOverviewStats = vi.fn<() => Promise<unknown>>()
const loadRealtimeSubmissionStatus = vi.fn<() => Promise<unknown>>()

vi.mock('../../src/features/settings/settingsApi', () => ({
  loadThemePreference: () => loadThemePreference(),
  saveThemePreference: (theme: ThemePreference) => saveThemePreference(theme),
  loadSettingsOverviewStats: () => loadSettingsOverviewStats(),
  loadRealtimeSubmissionStatus: () => loadRealtimeSubmissionStatus(),
}))

/*
 * 九个面板各自替换成一个探针：本组用例的单元边界是「导航选了谁、渲染了谁」，
 * 不是各面板自己的读路径（那些有各自的用例）。不替换的话每个 case 都要给九条
 * 读路径搭替身，而且任一面板改了内部实现都会让导航用例连带变红。
 */
const { panelProbe } = vi.hoisted(() => ({
  panelProbe: (name: string) => () => <div data-testid={`panel-${name}`}>{name}</div>,
}))

vi.mock('../../src/features/settings/CoachPanel', () => ({ CoachPanel: panelProbe('coach') }))
vi.mock('../../src/features/settings/SearchEnginePanel', () => ({ SearchEnginePanel: panelProbe('search') }))
vi.mock('../../src/features/settings/LlmConfigPanel', () => ({ LlmConfigPanel: panelProbe('llm') }))
vi.mock('../../src/features/settings/SiteManagementPanel', () => ({ SiteManagementPanel: panelProbe('sites') }))
vi.mock('../../src/features/settings/CodeforcesSyncPanel', () => ({ CodeforcesSyncPanel: panelProbe('sync') }))
vi.mock('../../src/features/settings/BackupPanel', () => ({ BackupPanel: panelProbe('data') }))
vi.mock('../../src/features/settings/LearningOverviewPanel', () => ({ LearningOverviewPanel: panelProbe('overview') }))
vi.mock('../../src/features/settings/PlatformDistributionSummary', () => ({
  PlatformDistributionSummary: panelProbe('distribution'),
}))
vi.mock('../../src/features/settings/RealtimeSubmissionPanel', () => ({
  RealtimeSubmissionPanel: panelProbe('diagnostics'),
}))

import { AppearancePanel } from '../../src/features/settings/AppearancePanel'
import { SettingsPage } from '../../src/features/settings/SettingsPage'
import { SETTINGS_SECTIONS } from '../../src/features/settings/settingsSections'

class FakeColorSchemeQuery {
  matches: boolean
  private readonly listeners = new Set<() => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener)
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  emit(matches: boolean): void {
    this.matches = matches
    for (const listener of [...this.listeners]) listener()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  loadThemePreference.mockResolvedValue('system')
  saveThemePreference.mockImplementation(async (theme) => theme)
  loadSettingsOverviewStats.mockResolvedValue({ platformDistribution: [] })
  loadRealtimeSubmissionStatus.mockResolvedValue(null)
  document.documentElement.removeAttribute('data-theme')
})

afterEach(cleanup)

describe('主题属性落地', () => {
  it('暗色写 data-theme，浅色移除属性而不是写 light', () => {
    applyThemeAttribute(true, document.documentElement)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    applyThemeAttribute(false, document.documentElement)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('安装时立刻同步一次，不等 change 事件', () => {
    const query = new FakeColorSchemeQuery(true)
    installThemeAttribute(query, document.documentElement)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('themeSource 变化经 media query 反映到属性上', () => {
    const query = new FakeColorSchemeQuery(false)
    installThemeAttribute(query, document.documentElement)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)

    query.emit(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    query.emit(false)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('退订后不再跟随变化', () => {
    const query = new FakeColorSchemeQuery(false)
    const dispose = installThemeAttribute(query, document.documentElement)
    expect(query.listenerCount).toBe(1)

    dispose()
    expect(query.listenerCount).toBe(0)
    query.emit(true)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('查询串就是 prefers-color-scheme: dark', () => {
    expect(DARK_COLOR_SCHEME_QUERY).toBe('(prefers-color-scheme: dark)')
  })
})

describe('外观面板', () => {
  it('回填已保存的偏好', async () => {
    loadThemePreference.mockResolvedValue('dark')
    render(<AppearancePanel />)
    await waitFor(() => {
      expect((screen.getByLabelText('主题') as HTMLSelectElement).value).toBe('dark')
    })
  })

  it('选完即写盘，没有保存按钮', async () => {
    render(<AppearancePanel />)
    const select = screen.getByLabelText('主题') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'dark' } })
    await waitFor(() => expect(saveThemePreference).toHaveBeenCalledWith('dark'))
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull()
  })

  it('主进程返回的值覆盖界面选择', async () => {
    saveThemePreference.mockResolvedValue('system')
    render(<AppearancePanel />)
    const select = screen.getByLabelText('主题') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))

    fireEvent.change(select, { target: { value: 'dark' } })
    await waitFor(() => expect(select.value).toBe('system'))
  })

  it('写盘失败时把下拉框拨回原值并报错', async () => {
    loadThemePreference.mockResolvedValue('light')
    saveThemePreference.mockRejectedValue(new Error('read-only config'))
    render(<AppearancePanel />)
    const select = screen.getByLabelText('主题') as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('light'))

    fireEvent.change(select, { target: { value: 'dark' } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('read-only config'))
    // 主进程先落盘再改 themeSource，写盘失败时界面主题没变，下拉框也不能停在新值
    expect(select.value).toBe('light')
  })

  it('读失败进错误行，不伪装成"跟随系统"', async () => {
    loadThemePreference.mockRejectedValue(new Error('boom'))
    render(<AppearancePanel />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('读取失败：boom'))
  })
})

describe('设置页分区导航', () => {
  it('默认停在外观分区，只渲染该分区', () => {
    render(<SettingsPage onClose={() => {}} />)
    expect(screen.getByLabelText('主题')).toBeTruthy()
    expect(screen.queryByTestId('panel-sites')).toBeNull()
    expect(screen.queryByTestId('panel-llm')).toBeNull()
  })

  /*
   * 这条对着 SETTINGS_SECTIONS 比，只能证明"清单被完整渲染且保序"——改清单它会跟着变。
   * 保序本身仍值得验（用 map/Object.keys 组织就会丢顺序），但"顺序应该是什么"要另外钉，
   * 见下一条。
   */
  it('清单被完整渲染且保序', () => {
    render(<SettingsPage onClose={() => {}} />)
    const items = [...document.querySelectorAll('.settings-nav-item')]
    expect(items.map((item) => item.getAttribute('data-section')))
      .toEqual(SETTINGS_SECTIONS.map((section) => section.id))
    expect(items.map((item) => item.textContent))
      .toEqual(SETTINGS_SECTIONS.map((section) => section.label))
  })

  /*
   * 分区 id 与首项独立钉死：id 被 CSS/Playwright 依赖，首项决定打开设置页先看到什么。
   * 这条不引用 SETTINGS_SECTIONS 的顺序，所以改动清单顺序时它会红——那正是要人确认的事。
   */
  it('分区 id 集合与默认首项是稳定契约', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'appearance', 'coach', 'search', 'llm', 'sites', 'sync', 'data', 'overview', 'diagnostics',
    ])
  })

  it('导航不使用 role=tab（会和浏览器标签条的计数契约撞车）', () => {
    render(<SettingsPage onClose={() => {}} />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByRole('navigation', { name: '设置分区' })).toBeTruthy()
  })

  it('点击切换分区：旧分区卸载、新分区挂载、aria-current 跟随', () => {
    render(<SettingsPage onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '站点管理' }))

    expect(screen.getByTestId('panel-sites')).toBeTruthy()
    expect(screen.queryByLabelText('主题')).toBeNull()
    const active = [...document.querySelectorAll('.settings-nav-item[aria-current="page"]')]
    expect(active).toHaveLength(1)
    expect(active[0].getAttribute('data-section')).toBe('sites')
  })

  it('每个分区都渲染出对应面板', () => {
    render(<SettingsPage onClose={() => {}} />)
    const expected: Record<string, string[]> = {
      appearance: [],
      coach: ['panel-coach'],
      search: ['panel-search'],
      llm: ['panel-llm'],
      sites: ['panel-sites'],
      sync: ['panel-sync'],
      data: ['panel-data'],
      overview: ['panel-overview', 'panel-distribution'],
      diagnostics: ['panel-diagnostics'],
    }

    for (const section of SETTINGS_SECTIONS) {
      fireEvent.click(screen.getByRole('button', { name: section.label }))
      expect(
        document.querySelector('.settings-content')?.getAttribute('data-active-section'),
      ).toBe(section.id)
      for (const testId of expected[section.id]) {
        expect(screen.getByTestId(testId), `${section.id} 缺 ${testId}`).toBeTruthy()
      }
    }
  })

  it('保留跨 feature 借用的契约类名与关闭钮', () => {
    const onClose = vi.fn()
    render(<SettingsPage onClose={onClose} />)
    expect(document.querySelector('.settings-page')).toBeTruthy()
    expect(document.querySelector('.settings-header')).toBeTruthy()
    expect(document.querySelector('.settings-cols')).toBeTruthy()
    expect(document.querySelector('.settings-title')?.textContent).toBe('设置')

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
