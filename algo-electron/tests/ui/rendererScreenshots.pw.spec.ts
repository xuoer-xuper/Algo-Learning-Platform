import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAIN_WINDOW_BOUNDS } from '../../electron/app/windowBounds'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.join(tmpRoot, 'ui-screenshots')
const harnessHtml = path.join(outputDir, 'rendererScreenshotHarness.html')
const electronAppPath = path.join(projectRoot, 'tests', 'ui', 'electronScreenshotApp.mjs')

const shellScreenshotNames = [
  'omnibox.png',
  'problem-sidebar.png',
] as const

const internalPageScreenshotNames = [
  'dashboard.png',
  'settings.png',
  'llm-settings.png',
  'scripts.png',
  'coach-metrics.png',
  'problem-detail.png',
  'note-editor.png',
] as const

const requestedCustomViewport = process.env.ALP_SCREENSHOT_WINDOW_WIDTH && process.env.ALP_SCREENSHOT_WINDOW_HEIGHT
  ? [{
      name: 'custom',
      width: Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH),
      height: Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT),
    }]
  : null

const viewportScenarios = requestedCustomViewport ?? [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'medium', width: 1024, height: 720 },
  { name: 'narrow', width: MAIN_WINDOW_BOUNDS.minWidth, height: MAIN_WINDOW_BOUNDS.minHeight },
]

interface LayoutCheckConfig {
  required?: string[]
  minElements?: Array<[string, number]>
  minWidthRatios?: Array<[string, number]>
  maxWidthRatios?: Array<[string, number]>
  withinViewportX?: string[]
  withinX?: Array<[string, string]>
  fillsX?: Array<[string, string, string]>
}

interface InternalPageContract {
  page: InternalPage
  title: string
  url: string
  routeSelector: string
}

const internalPages = {
  dashboard: {
    page: { type: 'dashboard' },
    title: '学习统计',
    url: 'algo://dashboard',
    routeSelector: '.shell-route-dashboard',
  },
  settings: {
    page: { type: 'settings' },
    title: '设置',
    url: 'algo://settings',
    routeSelector: '.shell-route-settings',
  },
  scripts: {
    page: { type: 'scripts' },
    title: '脚本管理',
    url: 'algo://scripts',
    routeSelector: '.shell-route-scripts',
  },
  coachMetrics: {
    page: { type: 'coach-metrics' },
    title: 'Coach 指标',
    url: 'algo://coach-metrics',
    routeSelector: '.shell-route-coach-metrics',
  },
  problemDetail: {
    page: { type: 'problem-detail', problemId: 'problem-cf-1' },
    title: '题目详情',
    url: 'algo://problem-detail?problemId=problem-cf-1',
    routeSelector: '.shell-route-problem-detail',
  },
  notes: {
    page: { type: 'notes', problemId: 'problem-cf-1' },
    title: '本地笔记',
    url: 'algo://problem-notes?problemId=problem-cf-1',
    routeSelector: '.shell-route-notes',
  },
} as const satisfies Record<string, InternalPageContract>

const layoutChecks: Record<string, LayoutCheckConfig> = {
  'omnibox.png': {
    required: ['.toolbar', '.omnibox-suggestions-panel', '.omnibox-suggestions-list'],
    minElements: [['.omnibox-suggestion-option', 2]],
    withinViewportX: ['.toolbar', '.omnibox-suggestions-panel', '.omnibox-suggestions-list'],
    withinX: [['.omnibox-suggestions-list', '.omnibox-suggestions-panel']],
  },
  'problem-sidebar.png': {
    required: ['.content-area', '.sidebar', '.main-content', '.home-page'],
    minWidthRatios: [['.main-content', 0.7]],
    maxWidthRatios: [['.sidebar', 0.3]],
    withinViewportX: ['.content-area', '.sidebar', '.main-content', '.home-page'],
    fillsX: [['.sidebar', '.main-content', '.content-area']],
  },
  'dashboard.png': {
    required: ['.shell-route-dashboard', '.dashboard-page', '.dashboard-cards', '.dashboard-chart-section'],
    minElements: [
      ['.dashboard-chart-pie .recharts-pie-sector path', 1],
      ['.dashboard-chart-bar .recharts-bar-rectangle path', 1],
    ],
    withinViewportX: ['.shell-route-dashboard'],
    withinX: [
      ['.shell-route-dashboard', '.main-content'],
      ['.dashboard-page', '.shell-route-dashboard'],
      ['.dashboard-header', '.dashboard-page'],
      ['.dashboard-cards', '.dashboard-page'],
      ['.ai-suggest-section', '.dashboard-page'],
      ['.dashboard-chart-section', '.dashboard-page'],
    ],
  },
  'settings.png': {
    required: ['.shell-route-settings', '.settings-page', '.settings-cols', '.site-list'],
    withinViewportX: ['.shell-route-settings'],
    withinX: [
      ['.shell-route-settings', '.main-content'],
      ['.settings-page', '.shell-route-settings'],
      ['.settings-header', '.settings-page'],
      ['.settings-cols', '.settings-page'],
      ['.site-list', '.settings-page'],
    ],
  },
  'llm-settings.png': {
    required: ['.shell-route-settings', '.settings-page', '.llm-config-section', '.llm-config-section .settings-input'],
    withinViewportX: ['.shell-route-settings'],
    withinX: [
      ['.llm-config-section', '.settings-page'],
      ['.llm-config-section .settings-input', '.llm-config-section'],
    ],
  },
  'coach-metrics.png': {
    required: ['.shell-route-coach-metrics', '.coach-metrics-view', '.coach-metrics-cards', '.coach-charts-row'],
    minElements: [
      ['.coach-metrics-view .recharts-bar-rectangle path', 1],
      ['.coach-metrics-view .recharts-pie-sector path', 1],
    ],
    withinViewportX: ['.shell-route-coach-metrics'],
    withinX: [
      ['.shell-route-coach-metrics', '.main-content'],
      ['.coach-metrics-view', '.shell-route-coach-metrics'],
      ['.coach-metrics-cards', '.coach-metrics-view'],
      ['.coach-charts-row', '.coach-metrics-view'],
    ],
  },
  'note-editor.png': {
    required: ['.shell-route-notes', '.notes-modal', '.notes-sidebar', '.note-editor-area', '.milkdown', '.ProseMirror'],
    withinViewportX: ['.shell-route-notes'],
    withinX: [
      ['.shell-route-notes', '.main-content'],
      ['.notes-modal', '.shell-route-notes'],
      ['.notes-modal-body', '.notes-modal'],
      ['.note-editor-area', '.notes-modal-body'],
      ['.milkdown-wrapper', '.note-editor-container'],
    ],
  },
  'scripts.png': {
    required: ['.shell-route-scripts', '.scripts-page', '.scripts-header', '.scripts-body', '.scripts-table'],
    withinViewportX: ['.shell-route-scripts'],
    withinX: [
      ['.shell-route-scripts', '.main-content'],
      ['.scripts-page', '.shell-route-scripts'],
      ['.scripts-header', '.scripts-page'],
      ['.scripts-body', '.scripts-page'],
      ['.scripts-table-wrap', '.scripts-body'],
    ],
  },
  'problem-detail.png': {
    required: ['.shell-route-problem-detail', '.detail-page', '.detail-header', '.detail-info', '.detail-submissions'],
    withinViewportX: ['.shell-route-problem-detail'],
    withinX: [
      ['.shell-route-problem-detail', '.main-content'],
      ['.detail-page', '.shell-route-problem-detail'],
      ['.detail-header', '.detail-page'],
      ['.detail-info', '.detail-page'],
      ['.detail-submissions', '.detail-page'],
    ],
  },
}

function buildRendererHarness(): void {
  const result = spawnSync(process.execPath, [
    path.join('tests', 'ui', 'buildRendererScreenshotHarness.mjs'),
    outputDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })

  expect(result.error).toBeUndefined()
  expect(result.status, `Failed to build screenshot harness\n${result.stdout}\n${result.stderr}`).toBe(0)
  expect(fs.existsSync(harnessHtml)).toBe(true)
}

async function launchScenario(scenario: { width: number, height: number }): Promise<ElectronApplication> {
  return electron.launch({
    args: [electronAppPath],
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ALP_SCREENSHOT_HARNESS_HTML: harnessHtml,
      ALP_SCREENSHOT_WINDOW_WIDTH: String(scenario.width),
      ALP_SCREENSHOT_WINDOW_HEIGHT: String(scenario.height),
    },
  })
}

async function assertNativeViewport(app: ElectronApplication, page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  expect(viewport.width).toBeGreaterThanOrEqual(MAIN_WINDOW_BOUNDS.minWidth)
  expect(viewport.height).toBeGreaterThanOrEqual(MAIN_WINDOW_BOUNDS.minHeight)

  const zoomFactor = await app.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor() ?? 0
  })
  expect(zoomFactor).toBeCloseTo(1, 3)
}

async function openInternalPageTab(
  page: Page,
  contract: InternalPageContract,
): Promise<{ tabId: string, previousTabCount: number }> {
  const tabs = page.getByRole('tab')
  const homeTab = page.getByRole('tab', { name: '首页', exact: true })
  await expect(homeTab).toHaveCount(1)
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  const previousTabCount = await tabs.count()
  const tabId = await page.evaluate(
    (target) => window.electronAPI.openInternalTab(target),
    contract.page,
  )

  expect(tabId).not.toBe('')
  await expect(tabs).toHaveCount(previousTabCount + 1)

  const tabItem = page.locator(`.tab-item[data-tab-id="${tabId}"]`)
  const tab = tabItem.getByRole('tab', { name: contract.title, exact: true })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: '地址和搜索栏' })).toHaveValue(contract.url)
  await expect(page.locator(contract.routeSelector)).toBeVisible()
  await expect(page.locator('.content-area')).toBeVisible()
  await expect(page.locator('.main-content')).toBeVisible()

  await homeTab.click()
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: '地址和搜索栏' })).toHaveValue('algo://home')
  await expect(page.locator(contract.routeSelector)).toHaveCount(0)
  await expect(page.locator('.shell-route-home')).toBeVisible()

  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: '地址和搜索栏' })).toHaveValue(contract.url)
  await expect(page.locator(contract.routeSelector)).toBeVisible()
  return { tabId, previousTabCount }
}

async function closeInternalPageTab(
  page: Page,
  contract: InternalPageContract,
  state: { tabId: string, previousTabCount: number },
): Promise<void> {
  await page.getByRole('button', { name: `关闭 ${contract.title}`, exact: true }).click()
  await expect(page.locator(`.tab-item[data-tab-id="${state.tabId}"]`)).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(state.previousTabCount)
  await expect(page.getByRole('tab', { name: '首页', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: '地址和搜索栏' })).toHaveValue('algo://home')
  await expect(page.locator(contract.routeSelector)).toHaveCount(0)
}

async function assertNoSensitiveText(page: Page, label: string): Promise<void> {
  const text = await page.locator('body').innerText()
  const forbiddenText = /set-cookie|sessionid[ :=]|csrf(?:[_-]?token)?[ :=]|(?:access|refresh|api)[_-]?token[ :=]|ark-[A-Za-z0-9_-]{8,}/i
  expect(forbiddenText.test(text), `${label} contains forbidden sensitive text`).toBe(false)
  expect(text).not.toContain('应用崩溃了 (React Error)')
}

async function assertResponsiveContainer(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const value = element.getBoundingClientRect()
      return { width: value.width, height: value.height, left: value.left, right: value.right }
    }
    const gridTracks = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return 0
      return getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
    }
    return {
      content: rect('.content-area'),
      main: rect('.main-content'),
      route: rect('.shell-route'),
      dashboardCards: gridTracks('.dashboard-cards'),
      dashboardCharts: gridTracks('.dashboard-chart-row'),
      settingsColumns: gridTracks('.settings-cols'),
      coachCards: gridTracks('.coach-metrics-cards'),
      coachCharts: gridTracks('.coach-charts-row'),
      notesColumns: gridTracks('.notes-modal-body'),
    }
  })

  const issues: string[] = []
  const tolerance = 2
  if (name !== 'omnibox.png' && (!result.content || result.content.width <= 0)) {
    issues.push('content-area has no usable width')
  }
  if (name !== 'omnibox.png' && (!result.route || result.route.width <= 0)) {
    issues.push('shell-route has no usable width')
  }
  if (result.route && result.main) {
    if (result.route.left < result.main.left - tolerance || result.route.right > result.main.right + tolerance) {
      issues.push('shell-route is not contained by main-content')
    }
  }
  const routeWidth = result.route?.width ?? 0
  if (name === 'dashboard.png' && routeWidth > 0) {
    if (routeWidth <= 820 && result.dashboardCharts !== 1) issues.push('dashboard charts did not stack')
    if (routeWidth <= 600 && result.dashboardCards !== 1) issues.push('dashboard cards did not collapse')
  }
  if (name === 'settings.png' && routeWidth > 0 && routeWidth <= 680 && result.settingsColumns !== 1) {
    issues.push('settings columns did not collapse')
  }
  if (name === 'coach-metrics.png' && routeWidth > 0 && routeWidth <= 820) {
    if (result.coachCharts !== 1) issues.push('Coach charts did not stack')
    if (routeWidth <= 560 && result.coachCards !== 1) issues.push('Coach cards did not collapse')
  }
  if (name === 'note-editor.png' && result.notesColumns !== 2) {
    issues.push('notes layout did not preserve two responsive tracks')
  }

  expect(issues, `${name} responsive container issues`).toEqual([])
}

async function assertLayout(page: Page, name: string): Promise<void> {
  const config = layoutChecks[name]
  if (!config) return

  const issues = await page.evaluate((checkConfig: LayoutCheckConfig) => {
    const failures: string[] = []
    const tolerance = 2

    const rectFor = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) {
        failures.push(`missing selector: ${selector}`)
        return null
      }
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, width: rect.width }
    }

    for (const selector of checkConfig.required ?? []) rectFor(selector)
    for (const selector of checkConfig.withinViewportX ?? []) {
      const rect = rectFor(selector)
      if (rect && (rect.left < -tolerance || rect.right > window.innerWidth + tolerance)) {
        failures.push(`${selector} exceeds viewport horizontally`)
      }
    }
    for (const [innerSelector, outerSelector] of checkConfig.withinX ?? []) {
      const inner = rectFor(innerSelector)
      const outer = rectFor(outerSelector)
      if (inner && outer && (inner.left < outer.left - tolerance || inner.right > outer.right + tolerance)) {
        failures.push(`${innerSelector} exceeds ${outerSelector} horizontally`)
      }
    }
    for (const [selector, minRatio] of checkConfig.minWidthRatios ?? []) {
      const rect = rectFor(selector)
      if (rect && rect.width / window.innerWidth < minRatio) failures.push(`${selector} is too narrow`)
    }
    for (const [selector, maxRatio] of checkConfig.maxWidthRatios ?? []) {
      const rect = rectFor(selector)
      if (rect && rect.width / window.innerWidth > maxRatio) failures.push(`${selector} is too wide`)
    }
    for (const [leftSelector, rightSelector, outerSelector] of checkConfig.fillsX ?? []) {
      const left = rectFor(leftSelector)
      const right = rectFor(rightSelector)
      const outer = rectFor(outerSelector)
      if (left && right && outer && (
        Math.abs(left.left - outer.left) > tolerance
        || Math.abs(left.right - right.left) > tolerance
        || Math.abs(right.right - outer.right) > tolerance
      )) {
        failures.push(`${leftSelector} and ${rightSelector} do not fill ${outerSelector}`)
      }
    }
    for (const [selector, minCount] of checkConfig.minElements ?? []) {
      if (document.querySelectorAll(selector).length < minCount) failures.push(`${selector} has too few elements`)
    }

    if (document.documentElement.scrollWidth - window.innerWidth > tolerance) failures.push('document horizontal overflow')
    if (document.body.scrollWidth - window.innerWidth > tolerance) failures.push('body horizontal overflow')
    return failures
  }, config)

  expect(issues, `${name} layout issues`).toEqual([])
}

async function capture(page: Page, scenarioName: string, name: string): Promise<void> {
  await assertNoSensitiveText(page, name)
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.waitForTimeout(100)
  await assertResponsiveContainer(page, name)
  await assertLayout(page, name)

  const filePath = path.join(outputDir, scenarioName, name)
  const png = await page.screenshot({ path: filePath })
  expect(png.byteLength, `${name} screenshot appears empty`).toBeGreaterThan(20_000)
}

test.beforeAll(() => {
  if (fs.existsSync(outputDir)) {
    expect(outputDir.startsWith(`${tmpRoot}${path.sep}`)).toBe(true)
    fs.rmSync(outputDir, { recursive: true, force: true })
  }
  fs.mkdirSync(outputDir, { recursive: true })
  buildRendererHarness()
})

for (const scenario of viewportScenarios) {
  test(`${scenario.name} shell surfaces ${scenario.width}x${scenario.height}`, async () => {
    const scenarioOutputDir = path.join(outputDir, scenario.name)
    fs.mkdirSync(scenarioOutputDir, { recursive: true })

    const electronApp = await launchScenario(scenario)
    const page = await electronApp.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    try {
      await assertNativeViewport(electronApp, page)
      await expect(page.getByRole('tab')).toHaveCount(1)
      await expect(page.getByRole('tab', { name: '首页', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('combobox', { name: '地址和搜索栏' })).toHaveValue('algo://home')

      const omnibox = page.getByRole('combobox', { name: '地址和搜索栏' })
      await omnibox.focus()
      await omnibox.fill('')
      await expect(page.getByRole('listbox', { name: '本地浏览建议' })).toBeVisible()
      await expect(page.getByRole('option')).toHaveCount(2)
      await expect(page.locator('.content-area')).toHaveCount(0)
      await expect(page.locator('.sidebar')).toHaveCount(0)
      await capture(page, scenario.name, 'omnibox.png')

      await omnibox.press('Escape')
      await expect(page.getByRole('listbox', { name: '本地浏览建议' })).toHaveCount(0)
      await expect(page.locator('.content-area')).toBeVisible()
      await expect(page.locator('.sidebar')).toBeVisible()
      await expect(page.locator('body')).toContainText('题库')
      await capture(page, scenario.name, 'problem-sidebar.png')

      expect(pageErrors).toEqual([])
      for (const screenshotName of shellScreenshotNames) {
        expect(fs.statSync(path.join(scenarioOutputDir, screenshotName)).size).toBeGreaterThan(20_000)
      }
    } finally {
      await electronApp.close()
    }
  })

  test(`${scenario.name} six internal pages use tabs ${scenario.width}x${scenario.height}`, async () => {
    const scenarioOutputDir = path.join(outputDir, scenario.name)
    fs.mkdirSync(scenarioOutputDir, { recursive: true })

    const electronApp = await launchScenario(scenario)
    const page = await electronApp.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    try {
      await assertNativeViewport(electronApp, page)

      const dashboardTab = await openInternalPageTab(page, internalPages.dashboard)
      await expect(page.locator('.dashboard-page')).toBeVisible()
      await expect(page.locator('body')).toContainText('学习统计')
      await expect(page.locator('.dashboard-chart-pie .recharts-pie-sector path').first()).toBeVisible()
      await capture(page, scenario.name, 'dashboard.png')
      await closeInternalPageTab(page, internalPages.dashboard, dashboardTab)

      const settingsTab = await openInternalPageTab(page, internalPages.settings)
      await expect(page.locator('.settings-title')).toHaveText('设置')
      await expect(page.locator('.site-list')).toBeVisible()
      await capture(page, scenario.name, 'settings.png')

      await page.locator('.llm-config-section').scrollIntoViewIfNeeded()
      await capture(page, scenario.name, 'llm-settings.png')
      await closeInternalPageTab(page, internalPages.settings, settingsTab)

      const scriptsTab = await openInternalPageTab(page, internalPages.scripts)
      await expect(page.locator('.scripts-title')).toContainText('本地脚本管理')
      await expect(page.locator('.scripts-table')).toBeVisible()
      await capture(page, scenario.name, 'scripts.png')
      await closeInternalPageTab(page, internalPages.scripts, scriptsTab)

      const coachTab = await openInternalPageTab(page, internalPages.coachMetrics)
      await expect(page.locator('.coach-metrics-view')).toBeVisible()
      await expect(page.locator('.coach-metrics-view .recharts-pie-sector path').first()).toBeVisible()
      await capture(page, scenario.name, 'coach-metrics.png')
      await closeInternalPageTab(page, internalPages.coachMetrics, coachTab)

      const detailTab = await openInternalPageTab(page, internalPages.problemDetail)
      await expect(page.locator('.detail-title')).toHaveText('A. Example Problem')
      await expect(page.locator('.detail-submissions')).toBeVisible()
      await capture(page, scenario.name, 'problem-detail.png')
      await closeInternalPageTab(page, internalPages.problemDetail, detailTab)

      const notesTab = await openInternalPageTab(page, internalPages.notes)
      await expect(page.locator('.notes-modal')).toBeVisible()
      await page.locator('.note-item').first().click()
      await expect(page.locator('.milkdown .ProseMirror')).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('body')).toContainText('边界条件复盘')
      await capture(page, scenario.name, 'note-editor.png')
      await closeInternalPageTab(page, internalPages.notes, notesTab)

      expect(pageErrors).toEqual([])
      for (const screenshotName of internalPageScreenshotNames) {
        expect(fs.statSync(path.join(scenarioOutputDir, screenshotName)).size).toBeGreaterThan(20_000)
      }
    } finally {
      await electronApp.close()
    }
  })
}

test('native tab strip overflows horizontally and reorders with a pointer drag', async () => {
  const scenario = viewportScenarios.find((candidate) => candidate.name === 'narrow')!
  const electronApp = await launchScenario(scenario)
  const page = await electronApp.firstWindow()

  try {
    await assertNativeViewport(electronApp, page)
    await page.evaluate(async () => {
      for (let index = 0; index < 12; index += 1) {
        await window.electronAPI.openInternalTab({ type: 'notes', problemId: `drag-${index}` })
      }
    })
    await expect(page.getByRole('tab')).toHaveCount(13)

    const stripState = await page.locator('.tab-strip-tabs').evaluate((element) => {
      const dragRegion = document.querySelector<HTMLElement>('.tab-strip-drag-region')
      const styles = dragRegion ? getComputedStyle(dragRegion) as CSSStyleDeclaration & { webkitAppRegion?: string } : null
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        dragRegionWidth: dragRegion?.getBoundingClientRect().width ?? 0,
        dragRegionMode: styles?.webkitAppRegion ?? '',
      }
    })
    expect(stripState.scrollWidth).toBeGreaterThan(stripState.clientWidth)
    expect(stripState.dragRegionWidth).toBeGreaterThan(0)
    expect(stripState.dragRegionMode).toBe('drag')

    const tabItems = page.locator('.tab-item')
    const before = await tabItems.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-tab-id')))
    await page.locator('.tab-strip-tabs').evaluate((element) => { element.scrollLeft = 0 })
    const first = tabItems.nth(0).locator('.tab-item-main')
    const firstBox = await first.boundingBox()
    const stripBox = await page.locator('.tab-strip-tabs').boundingBox()
    expect(firstBox).not.toBeNull()
    expect(stripBox).not.toBeNull()

    await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(stripBox!.x + stripBox!.width - 3, firstBox!.y + firstBox!.height / 2, { steps: 8 })
    await page.waitForTimeout(450)
    await page.mouse.up()

    await expect.poll(async () => {
      const current = await tabItems.evaluateAll(
        (elements) => elements.map((element) => element.getAttribute('data-tab-id')),
      )
      return current.indexOf(before[0])
    }).toBeGreaterThan(3)
    await expect.poll(() => page.locator('.tab-strip-tabs').evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0)
    const after = await tabItems.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-tab-id')))
    expect(after.filter((tabId) => tabId !== before[0])).toEqual(before.slice(1))
  } finally {
    await electronApp.close()
  }
})
