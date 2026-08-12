import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.join(tmpRoot, 'ui-screenshots')
const harnessHtml = path.join(outputDir, 'rendererScreenshotHarness.html')
const runnerPath = path.join(outputDir, 'electronScreenshotRunner.mjs')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

const expectedScreenshots = [
  'problem-sidebar.png',
  'dashboard.png',
  'settings.png',
  'llm-settings.png',
  'coach-metrics.png',
  'note-editor.png',
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
const targetViewport = { width: 1280, height: 900 }
const requestedWindow = {
  width: Number(process.env.ALP_SCREENSHOT_WINDOW_WIDTH || targetViewport.width),
  height: Number(process.env.ALP_SCREENSHOT_WINDOW_HEIGHT || targetViewport.height),
}

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

async function normalizeViewport(win) {
  const [contentWidth, contentHeight] = win.getContentSize()
  const zoomFactor = Math.min(
    1,
    contentWidth / targetViewport.width,
    contentHeight / targetViewport.height,
  )

  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    throw new Error('Invalid screenshot viewport: ' + contentWidth + 'x' + contentHeight)
  }

  win.webContents.setZoomFactor(zoomFactor)
  await delay(100)

  const viewport = await win.webContents.executeJavaScript('({ width: window.innerWidth, height: window.innerHeight })')
  if (viewport.width < targetViewport.width - 2 || viewport.height < targetViewport.height - 2) {
    throw new Error(
      'Could not normalize screenshot viewport: content=' + contentWidth + 'x' + contentHeight
      + ' zoom=' + zoomFactor.toFixed(3)
      + ' viewport=' + viewport.width + 'x' + viewport.height,
    )
  }

  console.log(
    '[STEP] viewport content=' + contentWidth + 'x' + contentHeight
    + ' zoom=' + zoomFactor.toFixed(3)
    + ' css=' + viewport.width + 'x' + viewport.height,
  )
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

async function assertLayout(win, name) {
  const checksByName = {
    'problem-sidebar.png': {
      required: ['.content-area', '.sidebar', '.main-content', '.home-page'],
      minWidths: [['.main-content', 900]],
      withinViewportX: ['.content-area', '.sidebar', '.main-content', '.home-page'],
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
  await assertLayout(win, name)
  const image = await win.webContents.capturePage()
  const size = image.getSize()
  if (size.width < 900 || size.height < 600) {
    throw new Error(\`\${name} screenshot too small: \${size.width}x\${size.height}\`)
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
    await normalizeViewport(win)
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

function runElectronRunner(): void {
  const result = spawnSync(electronBin, [runnerPath, harnessHtml, outputDir], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
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

function assertScreenshotsExist(): void {
  for (const fileName of expectedScreenshots) {
    const filePath = path.join(outputDir, fileName)
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
runElectronRunner()
assertScreenshotsExist()

console.log(`[PASS] Renderer screenshot files: ${expectedScreenshots.join(', ')}`)
