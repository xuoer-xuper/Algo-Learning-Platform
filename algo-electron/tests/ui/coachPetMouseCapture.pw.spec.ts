import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDir = path.join(projectRoot, 'tmp', 'coach-pet-ui')

test('transparent pet window captures only visible controls', async () => {
  const build = spawnSync(process.execPath, [
    path.join('tests', 'ui', 'buildRendererScreenshotHarness.mjs'), outputDir, 'coachPetHarness',
  ], { cwd: projectRoot, encoding: 'utf8' })
  expect(build.status, build.stderr).toBe(0)

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
    await expect(page.locator('.pet-body')).toBeVisible()
    let nativeIgnore = true
    await page.exposeFunction('__applyNativeMouseCapture', async (ignore: boolean) => {
      await app.evaluate(({ BrowserWindow }, value) => {
        BrowserWindow.getAllWindows()[0].setIgnoreMouseEvents(value, { forward: true })
      }, ignore)
      nativeIgnore = ignore
    })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setIgnoreMouseEvents(true, { forward: true })
    })

    await page.mouse.move(5, 5)
    await expect.poll(() => page.evaluate(() => window.__coachHarness.ignore)).toBe(true)
    await page.locator('.pet-body').hover()
    await expect.poll(() => nativeIgnore).toBe(false)
    await page.mouse.move(5, 5)
    await expect.poll(() => nativeIgnore).toBe(true)

    await page.evaluate(() => window.__coachHarness.showBubble())
    await expect(page.locator('.coach-bubble')).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.__coachHarness.ignore)).toBe(true)
    await page.locator('.coach-bubble-title').hover()
    await expect.poll(() => nativeIgnore).toBe(false)
    await page.screenshot({ path: path.join(outputDir, 'pet-bubble.png'), omitBackground: true })
    await page.evaluate(() => window.__coachHarness.dismissBubble())
    await expect.poll(() => nativeIgnore).toBe(true)

    await page.locator('.pet-body').click()
    await page.getByRole('button', { name: '自由对话' }).click()
    await expect(page.locator('.coach-chat-panel')).toBeVisible()
    await page.getByRole('textbox').hover()
    await expect.poll(() => nativeIgnore).toBe(false)
    await page.mouse.move(5, 5)
    await expect.poll(() => nativeIgnore).toBe(true)
    await page.screenshot({ path: path.join(outputDir, 'pet-chat.png'), omitBackground: true })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
