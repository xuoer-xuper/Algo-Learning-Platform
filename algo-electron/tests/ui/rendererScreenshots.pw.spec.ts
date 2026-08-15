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

const screenshotNames = [
  'problem-sidebar.png',
  'dashboard.png',
  'settings.png',
  'llm-settings.png',
  'coach-metrics.png',
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

const layoutChecks: Record<string, LayoutCheckConfig> = {
  'problem-sidebar.png': {
    required: ['.content-area', '.sidebar', '.main-content', '.home-page'],
    minWidthRatios: [['.main-content', 0.7]],
    maxWidthRatios: [['.sidebar', 0.3]],
    withinViewportX: ['.content-area', '.sidebar', '.main-content', '.home-page'],
    fillsX: [['.sidebar', '.main-content', '.content-area']],
  },
  'dashboard.png': {
    required: ['.modal-panel', '.dashboard-page', '.dashboard-cards', '.dashboard-chart-section'],
    minElements: [
      ['.dashboard-chart-pie .recharts-pie-sector path', 1],
      ['.dashboard-chart-bar .recharts-bar-rectangle path', 1],
    ],
    withinViewportX: ['.modal-panel'],
    withinX: [
      ['.dashboard-page', '.modal-panel'],
      ['.dashboard-header', '.dashboard-page'],
      ['.dashboard-cards', '.dashboard-page'],
      ['.ai-suggest-section', '.dashboard-page'],
      ['.dashboard-chart-section', '.dashboard-page'],
    ],
  },
  'settings.png': {
    required: ['.modal-panel', '.settings-page', '.settings-cols', '.site-list'],
    withinViewportX: ['.modal-panel'],
    withinX: [
      ['.settings-page', '.modal-panel'],
      ['.settings-header', '.settings-page'],
      ['.settings-cols', '.settings-page'],
      ['.site-list', '.settings-page'],
    ],
  },
  'llm-settings.png': {
    required: ['.modal-panel', '.settings-page', '.llm-config-section', '.llm-config-section .settings-input'],
    withinViewportX: ['.modal-panel'],
    withinX: [
      ['.llm-config-section', '.settings-page'],
      ['.llm-config-section .settings-input', '.llm-config-section'],
    ],
  },
  'coach-metrics.png': {
    required: ['.modal-panel', '.coach-metrics-view', '.coach-metrics-cards', '.coach-charts-row'],
    minElements: [
      ['.coach-metrics-view .recharts-bar-rectangle path', 1],
      ['.coach-metrics-view .recharts-pie-sector path', 1],
    ],
    withinViewportX: ['.modal-panel'],
    withinX: [
      ['.coach-metrics-view', '.modal-panel'],
      ['.coach-metrics-cards', '.coach-metrics-view'],
      ['.coach-charts-row', '.coach-metrics-view'],
    ],
  },
  'note-editor.png': {
    required: ['.modal-panel', '.notes-modal', '.notes-sidebar', '.note-editor-area', '.milkdown', '.ProseMirror'],
    withinViewportX: ['.modal-panel'],
    withinX: [
      ['.notes-modal', '.modal-panel'],
      ['.notes-modal-body', '.notes-modal'],
      ['.note-editor-area', '.notes-modal-body'],
      ['.milkdown-wrapper', '.note-editor-container'],
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
      workspace: rect('.modal-workspace'),
      panel: rect('.modal-panel'),
      content: rect('.content-area'),
      main: rect('.main-content'),
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
  if (!result.content || result.content.width <= 0) issues.push('content-area has no usable width')
  if (result.workspace && result.content) {
    if (result.workspace.width > result.content.width + tolerance) issues.push('modal workspace exceeds content-area width')
    if (result.workspace.left < result.content.left - tolerance || result.workspace.right > result.content.right + tolerance) {
      issues.push('modal workspace is not contained by content-area')
    }
  }
  if (result.workspace && result.main) {
    if (Math.abs(result.workspace.left - result.main.left) > tolerance
      || Math.abs(result.workspace.right - result.main.right) > tolerance) {
      issues.push('modal workspace does not match the rendered main-content boundary')
    }
  }
  if (name === 'dashboard.png' && result.panel) {
    if (result.panel.width <= 820 && result.dashboardCharts !== 1) issues.push('dashboard charts did not stack')
    if (result.panel.width <= 600 && result.dashboardCards !== 1) issues.push('dashboard cards did not collapse')
  }
  if (name === 'settings.png' && result.panel && result.panel.width <= 680 && result.settingsColumns !== 1) {
    issues.push('settings columns did not collapse')
  }
  if (name === 'coach-metrics.png' && result.panel && result.panel.width <= 820) {
    if (result.coachCharts !== 1) issues.push('Coach charts did not stack')
    if (result.panel.width <= 560 && result.coachCards !== 1) issues.push('Coach cards did not collapse')
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
  test(`${scenario.name} container ${scenario.width}x${scenario.height}`, async () => {
    const scenarioOutputDir = path.join(outputDir, scenario.name)
    fs.mkdirSync(scenarioOutputDir, { recursive: true })

    const electronApp = await launchScenario(scenario)
    const page = await electronApp.firstWindow()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    try {
      await assertNativeViewport(electronApp, page)
      await expect(page.locator('.sidebar')).toBeVisible()
      await expect(page.locator('body')).toContainText('题库')
      await capture(page, scenario.name, 'problem-sidebar.png')

      await page.locator('button[title="统计"]').click()
      await expect(page.locator('.dashboard-page')).toBeVisible()
      await expect(page.locator('body')).toContainText('学习统计')
      await expect(page.locator('.dashboard-chart-pie .recharts-pie-sector path').first()).toBeVisible()
      await capture(page, scenario.name, 'dashboard.png')

      await page.locator('.dashboard-close').click()
      await expect(page.locator('.dashboard-page')).toHaveCount(0)
      await page.locator('button[title="设置"]').click()
      await expect(page.locator('.settings-title')).toHaveText('设置')
      await expect(page.locator('.site-list')).toBeVisible()
      await capture(page, scenario.name, 'settings.png')

      await page.locator('.llm-config-section').scrollIntoViewIfNeeded()
      await capture(page, scenario.name, 'llm-settings.png')

      await page.locator('.settings-close').click()
      await expect(page.locator('.settings-page')).toHaveCount(0)
      await page.locator('button[title="Coach 干预效果指标"]').click()
      await expect(page.locator('.coach-metrics-view')).toBeVisible()
      await expect(page.locator('.coach-metrics-view .recharts-pie-sector path').first()).toBeVisible()
      await capture(page, scenario.name, 'coach-metrics.png')

      await page.locator('.dashboard-close').click()
      await expect(page.locator('.coach-metrics-view')).toHaveCount(0)
      await page.locator('.sidebar-item-notes').first().click()
      await expect(page.locator('.notes-modal')).toBeVisible()
      await page.locator('.note-item').first().click()
      await expect(page.locator('.milkdown .ProseMirror')).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('body')).toContainText('边界条件复盘')
      await capture(page, scenario.name, 'note-editor.png')

      expect(pageErrors).toEqual([])
      for (const screenshotName of screenshotNames) {
        expect(fs.statSync(path.join(scenarioOutputDir, screenshotName)).size).toBeGreaterThan(20_000)
      }
    } finally {
      await electronApp.close()
    }
  })
}
