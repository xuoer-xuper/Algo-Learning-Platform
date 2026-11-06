import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDir = path.join(projectRoot, 'tmp', 'coach-pet-ui')

async function applyNativeCapture(app: ElectronApplication, ignore: boolean): Promise<void> {
  await app.evaluate(({ BrowserWindow }, value) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('Coach test window is missing')
    window.setIgnoreMouseEvents(value, { forward: true })
    const state = Reflect.get(globalThis, '__ALP_SCREENSHOT_MOUSE_CAPTURE__') as {
      ignore: boolean
      updates: number
    }
    state.ignore = value
    state.updates += 1
  }, ignore)
}

async function readNativeCapture(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => {
    const state = Reflect.get(globalThis, '__ALP_SCREENSHOT_MOUSE_CAPTURE__') as {
      ignore: boolean
    }
    return state.ignore
  })
}

test.beforeAll(() => {
  const build = spawnSync(
    process.execPath,
    [path.join('tests', 'ui', 'buildRendererScreenshotHarness.mjs'), outputDir, 'coachPetHarness'],
    { cwd: projectRoot, encoding: 'utf8' },
  )
  expect(build.status, build.stderr).toBe(0)
})

test('transparent pet window captures only visible controls', async () => {
  const testInfo = test.info()
  const app = await electron.launch({
    args: [path.join(projectRoot, 'tests', 'ui', 'electronScreenshotApp.mjs')],
    cwd: projectRoot,
    env: {
      ...process.env,
      ALP_SCREENSHOT_HARNESS_HTML: path.join(outputDir, 'coachPetHarness.html'),
      ALP_SCREENSHOT_WINDOW_WIDTH: '400',
      ALP_SCREENSHOT_WINDOW_HEIGHT: '640',
      ALP_SCREENSHOT_TRANSPARENT: 'true',
    },
  })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.evaluate(() => {
      const events: unknown[] = []
      Reflect.set(window, '__captureEvents', events)
      for (const type of ['mousemove', 'mouseleave', 'blur', 'focus']) {
        window.addEventListener(
          type,
          (event) => {
            const mouse = event instanceof MouseEvent ? event : null
            events.push({ type, at: performance.now(), x: mouse?.clientX, y: mouse?.clientY })
            if (events.length > 100) events.shift()
          },
          true,
        )
      }
    })
    await expect(page.locator('.pet-body')).toBeVisible()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0]
          return Boolean(window?.isVisible() && window.isFocused())
        }),
      )
      .toBe(true)
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
    await page.exposeFunction('__applyNativeMouseCapture', async (ignore: boolean) => {
      await applyNativeCapture(app, ignore)
    })
    await applyNativeCapture(app, true)
    const nativeIgnore = () => readNativeCapture(app)

    await page.mouse.move(5, 5)
    await expect.poll(() => page.evaluate(() => window.__coachHarness.ignore)).toBe(true)
    await page.locator('.pet-body').hover()
    await expect.poll(nativeIgnore).toBe(false)
    await page.mouse.move(5, 5)
    await expect.poll(nativeIgnore).toBe(true)

    await page.evaluate(() => window.__coachHarness.showBubble())
    await expect(page.locator('.coach-bubble')).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.__coachHarness.ignore)).toBe(true)
    await page.locator('.coach-bubble-title').hover()
    await expect.poll(nativeIgnore).toBe(false)
    await page.screenshot({ path: path.join(outputDir, 'pet-bubble.png'), omitBackground: true })
    await page.evaluate(() => window.__coachHarness.dismissBubble())
    await expect.poll(nativeIgnore).toBe(true)

    await page.locator('.pet-body').click()
    await page.getByRole('button', { name: '自由对话' }).click()
    await expect(page.locator('.coach-chat-panel')).toBeVisible()
    await page.getByRole('textbox').hover()
    await expect.poll(nativeIgnore).toBe(false)
    await page.mouse.move(5, 5)
    await expect.poll(nativeIgnore).toBe(true)
    await page.screenshot({ path: path.join(outputDir, 'pet-chat.png'), omitBackground: true })
    expect(errors).toEqual([])
  } catch (error) {
    const page = await app.firstWindow()
    const renderer = await page.evaluate(() => ({
      events: Reflect.get(window, '__captureEvents'),
      ignore: window.__coachHarness.ignore,
      focused: document.hasFocus(),
      regions: [...document.querySelectorAll('[data-coach-interactive]')].map((element) => ({
        name: element.className,
        rect: element.getBoundingClientRect().toJSON(),
      })),
    }))
    const native = await app.evaluate(({ BrowserWindow, screen }) => ({
      state: Reflect.get(globalThis, '__ALP_SCREENSHOT_MOUSE_CAPTURE__'),
      cursor: screen.getCursorScreenPoint(),
      bounds: BrowserWindow.getAllWindows()[0]?.getContentBounds(),
    }))
    await testInfo.attach('capture-state', {
      body: JSON.stringify({ renderer, native }, null, 2),
      contentType: 'application/json',
    })
    throw error
  } finally {
    await app.close()
  }
})

test('native capture observation ignores an older delayed binding acknowledgement', async () => {
  const app = await electron.launch({
    args: [path.join(projectRoot, 'tests', 'ui', 'electronScreenshotApp.mjs')],
    cwd: projectRoot,
    env: {
      ...process.env,
      ALP_SCREENSHOT_HARNESS_HTML: path.join(outputDir, 'coachPetHarness.html'),
      ALP_SCREENSHOT_WINDOW_WIDTH: '400',
      ALP_SCREENSHOT_WINDOW_HEIGHT: '640',
      ALP_SCREENSHOT_TRANSPARENT: 'true',
    },
  })
  let releaseAcknowledgement: () => void = () => {}
  const acknowledgement = new Promise<void>((resolve) => {
    releaseAcknowledgement = resolve
  })
  let markApplied: () => void = () => {}
  const applied = new Promise<void>((resolve) => {
    markApplied = resolve
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.pet-body')).toBeVisible()
    await page.exposeFunction('__applyNativeMouseCapture', async (ignore: boolean) => {
      await applyNativeCapture(app, ignore)
      if (!ignore) {
        markApplied()
        await acknowledgement
      }
    })
    // The old Node-side mirror assigned after this acknowledgement and overwrote
    // a newer true value with false, although native hit testing was already true.
    const older = page.evaluate(() => window.api.coach.toggleIgnoreMouseEvents(false))
    await applied
    await page.evaluate(() => window.api.coach.toggleIgnoreMouseEvents(true))
    releaseAcknowledgement()
    await older
    expect(await readNativeCapture(app)).toBe(true)
    expect(await page.evaluate(() => window.__coachHarness.ignore)).toBe(true)
  } finally {
    releaseAcknowledgement()
    await app.close()
  }
})
