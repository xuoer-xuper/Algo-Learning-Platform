import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { MAIN_WINDOW_BOUNDS } from '../../electron/app/windowBounds'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.join(tmpRoot, 'ui-screenshots')
const harnessHtml = path.join(outputDir, 'rendererScreenshotHarness.html')
const runnerPath = path.join(outputDir, 'electronScreenshotRunner.mjs')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

const screenshotNames = [
  'problem-sidebar.png',
  'dashboard.png',
  'settings.png',
  'llm-settings.png',
  'coach-metrics.png',
  'note-editor.png',
]

const requestedCustomViewport = process.env.ALP_SCREENSHOT_WINDOW_WIDTH && process.env.ALP_SCREENSHOT_WINDOW_HEIGHT
  ? [{
      name: 'custom',
      width: Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH),
      height: Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT),
    }]
  : null

const viewportScenarios = requestedCustomViewport ?? [
  // Representative container modes; the requested desktop size is not a product contract.
  { name: 'wide', width: 1280, height: 800 },
  { name: 'medium', width: 1024, height: 720 },
  { name: 'narrow', width: MAIN_WINDOW_BOUNDS.minWidth, height: MAIN_WINDOW_BOUNDS.minHeight },
]

function runViteBuild(): void {
  const result = spawnSync(process.execPath, [
    path.join('tests', 'ui', 'buildRendererScreenshotHarness.mjs'),
    outputDir,
  ], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })

  assert.strictEqual(
    result.status,
    0,
    `Failed to build renderer screenshot harness\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
  assert.ok(fs.existsSync(harnessHtml), 'Vite did not emit the screenshot harness HTML')
}

function writeRunner(): void {
  fs.writeFileSync(
    runnerPath,
    `import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const htmlPath = process.argv[2]
const outputDir = process.argv[3]
const forbiddenText = /set-cookie|sessionid[ :=]|csrf(?:[_-]?token)?[ :=]|(?:access|refresh|api)[_-]?token[ :=]|ark-[A-Za-z0-9_-]{8,}/i
const requestedWindow = {
  width: Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH || 1024),
  height: Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT || 720),
}
const supportedMinimum = ${JSON.stringify({
  width: MAIN_WINDOW_BOUNDS.minWidth,
  height: MAIN_WINDOW_BOUNDS.minHeight,
})}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(win, expression, label, timeoutMs = 10000) {
  const startedAt = Date.now()
  let lastValue = ''
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const value = await win.webContents.executeJavaScript(expression)
      lastValue = String(value)
      if (value) return value
    } catch (error) {
      lastValue = String(error)
    }
    await delay(100)
  }
  throw new Error(\`Timed out waiting for \${label}; last=\${lastValue}\`)
}

async function clickSelector(win, selector, label) {
  const script = '(() => { const element = document.querySelector(' + JSON.stringify(selector) + '); if (!element) return false; element.click(); return true })()'
  const clicked = await win.webContents.executeJavaScript(script)
  if (!clicked) {
    throw new Error('Could not find clickable element for ' + label + ': ' + selector)
  }
}

async function assertNativeViewport(win) {
  const viewport = await win.webContents.executeJavaScript('({ width: window.innerWidth, height: window.innerHeight })')
  if (viewport.width < supportedMinimum.width || viewport.height < supportedMinimum.height) {
    throw new Error('Screenshot viewport is below the supported window size: ' + viewport.width + 'x' + viewport.height)
  }
  if (Math.abs(win.webContents.getZoomFactor() - 1) > 0.001) {
    throw new Error('Screenshot viewport must use the native zoom factor')
  }
  console.log('[STEP] native viewport=' + viewport.width + 'x' + viewport.height + ' (requested fixture ' + requestedWindow.width + 'x' + requestedWindow.height + ')')
}

async function assertNoSensitiveText(win, label) {
  const text = await win.webContents.executeJavaScript('document.body.innerText')
  if (forbiddenText.test(text)) {
    throw new Error(\`\${label} contains forbidden sensitive text\`)
  }
  if (text.includes('应用崩溃了 (React Error)')) {
    throw new Error(\`\${label} rendered the React ErrorBoundary\`)
  }
}

async function assertResponsiveContainer(win, name) {
  const script = '(' + function measureResponsiveLayout() {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const value = element.getBoundingClientRect()
      return {
        width: value.width,
        height: value.height,
        left: value.left,
        right: value.right,
      }
    }
    const gridTracks = (selector) => {
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
  }.toString() + ')()'
  const result = await win.webContents.executeJavaScript(script)

  const issues = []
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
    if (result.panel.width <= 820 && result.dashboardCharts !== 1) issues.push('dashboard charts did not stack inside a narrow container')
    if (result.panel.width <= 600 && result.dashboardCards !== 1) issues.push('dashboard cards did not collapse inside a narrow container')
  }
  if (name === 'settings.png' && result.panel && result.panel.width <= 680 && result.settingsColumns !== 1) {
    issues.push('settings columns did not collapse inside a narrow container')
  }
  if (name === 'coach-metrics.png' && result.panel && result.panel.width <= 820) {
    if (result.coachCharts !== 1) issues.push('Coach charts did not stack inside a narrow container')
    if (result.panel.width <= 560 && result.coachCards !== 1) issues.push('Coach cards did not collapse inside a narrow container')
  }
  if (name === 'note-editor.png' && result.notesColumns !== 2) {
    issues.push('notes layout did not preserve a responsive sidebar and editor track')
  }
  if (issues.length > 0) throw new Error(name + ' responsive container issues:\\n' + issues.join('\\n'))
  console.log('[STEP] ' + name + ' container=' + JSON.stringify(result))
}

async function assertLayout(win, name) {
  const checksByName = {
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
  const config = checksByName[name]
  if (!config) return

  const script = '(' + function checkLayout(checkConfig) {
    const issues = []
    const tolerance = 2

    function rectFor(selector) {
      const el = document.querySelector(selector)
      if (!el) {
        issues.push('missing selector: ' + selector)
        return null
      }
      const rect = el.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }
    }

    function checkWithinViewportX(selector) {
      const rect = rectFor(selector)
      if (!rect) return
      if (rect.left < -tolerance || rect.right > window.innerWidth + tolerance) {
        issues.push(selector + ' exceeds viewport horizontally: left=' + rect.left.toFixed(1) + ' right=' + rect.right.toFixed(1) + ' viewport=' + window.innerWidth)
      }
    }

    function checkWithinX(innerSelector, outerSelector) {
      const inner = rectFor(innerSelector)
      const outer = rectFor(outerSelector)
      if (!inner || !outer) return
      if (inner.left < outer.left - tolerance || inner.right > outer.right + tolerance) {
        issues.push(innerSelector + ' exceeds ' + outerSelector + ' horizontally: inner=' + inner.left.toFixed(1) + '..' + inner.right.toFixed(1) + ' outer=' + outer.left.toFixed(1) + '..' + outer.right.toFixed(1))
      }
    }

    function checkMinWidth(selector, minWidth) {
      const rect = rectFor(selector)
      if (!rect) return
      if (rect.width < minWidth - tolerance) {
        issues.push(selector + ' is too narrow: width=' + rect.width.toFixed(1) + ' expected>=' + minWidth)
      }
    }

    function checkMinWidthRatio(selector, minRatio) {
      const rect = rectFor(selector)
      if (!rect) return
      const ratio = rect.width / window.innerWidth
      if (ratio < minRatio) {
        issues.push(selector + ' is too narrow for the viewport: ratio=' + ratio.toFixed(3) + ' expected>=' + minRatio)
      }
    }

    function checkMaxWidthRatio(selector, maxRatio) {
      const rect = rectFor(selector)
      if (!rect) return
      const ratio = rect.width / window.innerWidth
      if (ratio > maxRatio) {
        issues.push(selector + ' is too wide for the viewport: ratio=' + ratio.toFixed(3) + ' expected<=' + maxRatio)
      }
    }

    function checkFillsX(leftSelector, rightSelector, outerSelector) {
      const left = rectFor(leftSelector)
      const right = rectFor(rightSelector)
      const outer = rectFor(outerSelector)
      if (!left || !right || !outer) return
      if (Math.abs(left.left - outer.left) > tolerance
        || Math.abs(left.right - right.left) > tolerance
        || Math.abs(right.right - outer.right) > tolerance) {
        issues.push(leftSelector + ' and ' + rightSelector + ' do not fill ' + outerSelector + ' continuously')
      }
    }

    function checkMinElements(selector, minCount) {
      const count = document.querySelectorAll(selector).length
      if (count < minCount) {
        issues.push(selector + ' has too few elements: count=' + count + ' expected>=' + minCount)
      }
    }

    for (const selector of checkConfig.required || []) rectFor(selector)
    for (const selector of checkConfig.withinViewportX || []) checkWithinViewportX(selector)
    for (const pair of checkConfig.withinX || []) checkWithinX(pair[0], pair[1])
    for (const pair of checkConfig.minWidths || []) checkMinWidth(pair[0], pair[1])
    for (const pair of checkConfig.minWidthRatios || []) checkMinWidthRatio(pair[0], pair[1])
    for (const pair of checkConfig.maxWidthRatios || []) checkMaxWidthRatio(pair[0], pair[1])
    for (const selectors of checkConfig.fillsX || []) checkFillsX(selectors[0], selectors[1], selectors[2])
    for (const pair of checkConfig.minElements || []) checkMinElements(pair[0], pair[1])

    const documentOverflow = document.documentElement.scrollWidth - window.innerWidth
    const bodyOverflow = document.body.scrollWidth - window.innerWidth
    if (documentOverflow > tolerance) issues.push('document horizontal overflow: ' + document.documentElement.scrollWidth + ' > ' + window.innerWidth)
    if (bodyOverflow > tolerance) issues.push('body horizontal overflow: ' + document.body.scrollWidth + ' > ' + window.innerWidth)

    return issues
  }.toString() + ')(' + JSON.stringify(config) + ')'

  const issues = await win.webContents.executeJavaScript(script)
  if (issues.length > 0) {
    throw new Error(name + ' layout issues:\\n' + issues.join('\\n'))
  }
}

async function capture(win, name) {
  console.log('[STEP] capture ' + name)
  await assertNoSensitiveText(win, name)
  await win.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await delay(100)
  await assertResponsiveContainer(win, name)
  await assertLayout(win, name)
  const image = await win.webContents.capturePage()
  const size = image.getSize()
  if (size.width < 1 || size.height < 1) {
    throw new Error(\`\${name} screenshot has invalid size: \${size.width}x\${size.height}\`)
  }
  const png = image.toPNG()
  if (png.length < 20000) {
    throw new Error(\`\${name} screenshot appears empty: \${png.length} bytes\`)
  }
  fs.writeFileSync(path.join(outputDir, name), png)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: requestedWindow.width,
    height: requestedWindow.height,
    useContentSize: true,
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  })

  win.webContents.on('console-message', (details) => {
    console.log('[RENDERER ' + details.level + '] ' + details.message)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[RENDERER GONE] ' + JSON.stringify(details))
  })

  try {
    console.log('[STEP] load harness')
    await win.loadFile(htmlPath)
    await assertNativeViewport(win)
    console.log('[STEP] wait problem sidebar')
    await waitFor(win, "Boolean(document.querySelector('.sidebar') && document.body.innerText.includes('题库'))", 'problem sidebar')
    await capture(win, 'problem-sidebar.png')

    console.log('[STEP] open dashboard')
    await clickSelector(win, 'button[title="统计"]', 'dashboard button')
    await waitFor(win, "Boolean(document.querySelector('.dashboard-page') && document.body.innerText.includes('学习统计'))", 'dashboard page')
    await delay(300)
    await capture(win, 'dashboard.png')

    console.log('[STEP] open settings')
    await clickSelector(win, '.dashboard-close', 'dashboard close')
    await waitFor(win, "!document.querySelector('.dashboard-page')", 'dashboard close')
    await clickSelector(win, 'button[title="设置"]', 'settings button')
    await waitFor(win, "document.querySelector('.settings-title')?.textContent === '设置' && Boolean(document.querySelector('.site-list'))", 'settings page')
    await delay(800)
    await capture(win, 'settings.png')

    console.log('[STEP] focus LLM settings')
    await win.webContents.executeJavaScript("document.querySelector('.llm-config-section')?.scrollIntoView({ block: 'start' })")
    await delay(200)
    await capture(win, 'llm-settings.png')

    console.log('[STEP] open coach metrics')
    await clickSelector(win, '.settings-close', 'settings close')
    await waitFor(win, "!document.querySelector('.settings-page')", 'settings close')
    await clickSelector(win, 'button[title="Coach 干预效果指标"]', 'coach metrics button')
    await waitFor(win, "Boolean(document.querySelector('.coach-metrics-view') && document.querySelector('.coach-metrics-cards'))", 'coach metrics')
    await waitFor(win, "document.querySelectorAll('.coach-metrics-view .recharts-pie-sector path').length > 0", 'coach metrics pie chart', 5000)
    await capture(win, 'coach-metrics.png')

    console.log('[STEP] open note editor')
    await clickSelector(win, '.dashboard-close', 'coach metrics close')
    await waitFor(win, "!document.querySelector('.coach-metrics-view')", 'coach metrics close')
    await clickSelector(win, '.sidebar-item-notes', 'notes button')
    await waitFor(win, "Boolean(document.querySelector('.notes-modal') && document.querySelector('.note-item'))", 'notes modal')
    await clickSelector(win, '.note-item', 'note item')
    await waitFor(win, "Boolean(document.querySelector('.milkdown .ProseMirror') && document.body.innerText.includes('边界条件复盘'))", 'Milkdown note editor', 20000)
    await delay(500)
    await capture(win, 'note-editor.png')

    console.log('[PASS] Renderer UI screenshots')
    app.exit(0)
  } catch (error) {
    console.error('[FAIL] Renderer UI screenshots')
    console.error(error)
    app.exit(1)
  }
})`,
    'utf-8',
  )
}

function runElectronRunner(scenario: { name: string, width: number, height: number }): void {
  const scenarioOutputDir = path.join(outputDir, scenario.name)
  fs.mkdirSync(scenarioOutputDir, { recursive: true })

  const result = spawnSync(electronBin, [runnerPath, harnessHtml, scenarioOutputDir], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ALP_SCREENSHOT_WINDOW_WIDTH: String(scenario.width),
      ALP_SCREENSHOT_WINDOW_HEIGHT: String(scenario.height),
    },
    encoding: 'utf-8',
    timeout: 60000,
  })

  assert.ifError(result.error)
  assert.strictEqual(
    result.status,
    0,
    `Renderer screenshot runner failed with status ${result.status} signal ${result.signal}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
  assert.match(`${result.stdout}\n${result.stderr}`, /\[PASS\] Renderer UI screenshots/)
}

function assertScreenshotsExist(scenario: { name: string }): void {
  for (const fileName of screenshotNames) {
    const filePath = path.join(outputDir, scenario.name, fileName)
    assert.ok(fs.existsSync(filePath), `Missing screenshot ${fileName}`)
    const stat = fs.statSync(filePath)
    assert.ok(stat.size > 20000, `Screenshot ${fileName} is unexpectedly small`)
  }
}

if (fs.existsSync(outputDir)) {
  assert.ok(outputDir.startsWith(tmpRoot), 'Refusing to clean a directory outside tmp')
  fs.rmSync(outputDir, { recursive: true, force: true })
}
fs.mkdirSync(outputDir, { recursive: true })

runViteBuild()
writeRunner()

for (const scenario of viewportScenarios) {
  runElectronRunner(scenario)
  assertScreenshotsExist(scenario)
}

console.log(`[PASS] Renderer screenshot viewports: ${viewportScenarios.map((scenario) => `${scenario.name}=${scenario.width}x${scenario.height}`).join(', ')}`)
