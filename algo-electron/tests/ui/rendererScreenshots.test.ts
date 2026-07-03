import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const tmpRoot = path.join(projectRoot, 'tmp')
const outputDir = path.join(tmpRoot, 'ui-screenshots')
const harnessJs = path.join(outputDir, 'rendererScreenshotHarness.js')
const harnessCss = path.join(outputDir, 'rendererScreenshotHarness.css')
const harnessHtml = path.join(outputDir, 'index.html')
const runnerPath = path.join(outputDir, 'electronScreenshotRunner.mjs')
const esbuildBin = path.join(projectRoot, 'node_modules', 'esbuild', 'bin', 'esbuild')
const electronBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(projectRoot, 'node_modules', '.bin', 'electron')

const expectedScreenshots = [
  'problem-sidebar.png',
  'dashboard.png',
  'settings.png',
]

function runEsbuild(): void {
  const result = spawnSync(process.execPath, [
    esbuildBin,
    'tests/ui/rendererScreenshotHarness.tsx',
    '--bundle',
    '--platform=browser',
    '--format=iife',
    '--loader:.css=css',
    '--loader:.woff=file',
    '--loader:.woff2=file',
    '--loader:.ttf=file',
    `--outfile=${harnessJs}`,
    '--define:process.env.NODE_ENV="test"',
  ], {
    cwd: projectRoot,
    encoding: 'utf-8',
  })

  assert.strictEqual(
    result.status,
    0,
    `Failed to bundle renderer screenshot harness\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  )
}

function writeHarnessHtml(): void {
  const cssLink = fs.existsSync(harnessCss)
    ? '<link rel="stylesheet" href="./rendererScreenshotHarness.css">'
    : ''

  fs.writeFileSync(
    harnessHtml,
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Renderer Screenshot Harness</title>
    ${cssLink}
    <style>
      html, body, #root { width: 100%; height: 100%; margin: 0; }
      body { overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./rendererScreenshotHarness.js"></script>
  </body>
</html>`,
    'utf-8',
  )
}

function writeRunner(): void {
  fs.writeFileSync(
    runnerPath,
    `import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const htmlPath = process.argv[2]
const outputDir = process.argv[3]
const forbiddenText = /cookie|set-cookie|sessionid|csrf|token/i

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

async function assertNoSensitiveText(win, label) {
  const text = await win.webContents.executeJavaScript('document.body.innerText')
  if (forbiddenText.test(text)) {
    throw new Error(\`\${label} contains forbidden sensitive text\`)
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
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false,
    },
  })

  try {
    await win.loadFile(htmlPath)
    await waitFor(win, "Boolean(document.querySelector('.sidebar') && document.body.innerText.includes('题库'))", 'problem sidebar')
    await capture(win, 'problem-sidebar.png')

    await win.webContents.executeJavaScript("document.querySelector('button[title=\\\\'统计\\\\']')?.click()")
    await waitFor(win, "Boolean(document.querySelector('.dashboard-page') && document.body.innerText.includes('学习统计'))", 'dashboard page')
    await delay(300)
    await capture(win, 'dashboard.png')

    await win.webContents.executeJavaScript("document.querySelector('.dashboard-close')?.click()")
    await waitFor(win, "!document.querySelector('.dashboard-page')", 'dashboard close')
    await win.webContents.executeJavaScript("document.querySelector('button[title=\\\\'设置\\\\']')?.click()")
    await waitFor(win, "document.querySelector('.settings-title')?.textContent === '设置' && Boolean(document.querySelector('.site-list'))", 'settings page')
    await delay(800)
    await capture(win, 'settings.png')

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
    timeout: 30000,
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

runEsbuild()
writeHarnessHtml()
writeRunner()
runElectronRunner()
assertScreenshotsExist()

console.log(`[PASS] Renderer screenshot files: ${expectedScreenshots.join(', ')}`)
