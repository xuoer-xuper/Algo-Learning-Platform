import { _electron as electron, expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProblemRecord } from '../../src/shared/types/problem'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDir = path.join(projectRoot, 'tmp', 'recent-problem-actions-ui')
const reason = '题目 ID 无效，无法打开笔记或详情；仍可访问原网站。'
const rows: ProblemRecord[] = [null, null, '', 'invalid id', 'problem-cf-1'].map((id, index) => ({
  id,
  platform: 'codeforces',
  platform_problem_id: `recent-${index}`,
  canonical_url: `https://example.test/problem/${index}`,
  title: `Recent problem ${index}`,
  status: 'visited',
  last_visited_at: null,
  submission_count: index + 1,
}))

test.beforeAll(() => {
  const build = spawnSync(
    process.execPath,
    ['tests/ui/buildRendererScreenshotHarness.mjs', outputDir],
    { cwd: projectRoot, encoding: 'utf-8' },
  )
  expect(build.error).toBeUndefined()
  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)
})

for (const { name, width, height } of [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'medium', width: 1024, height: 720 },
  { name: 'narrow', width: 800, height: 600 },
]) {
  test(`recent invalid IDs keep accessible site navigation at ${name} size`, async () => {
    const app = await electron.launch({
      args: [path.join(projectRoot, 'tests', 'ui', 'electronScreenshotApp.mjs')],
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ALP_SCREENSHOT_HARNESS_HTML: path.join(outputDir, 'rendererScreenshotHarness.html'),
        ALP_SCREENSHOT_WINDOW_WIDTH: String(width),
        ALP_SCREENSHOT_WINDOW_HEIGHT: String(height),
      },
    })
    try {
      const page = await app.firstWindow()
      await expect(page.locator('.sidebar-item')).toHaveCount(3)
      await page.evaluate((fixtures) => {
        window.api.problem.listRecent = async () => fixtures
        const navigate = window.api.browser.navigate
        window.api.browser.navigate = (url) => {
          document.body.dataset.recentNavigation = url
          navigate(url)
        }
      }, rows)
      await page.locator('.sidebar-filters select').nth(1).selectOption('visited')
      await expect(page.locator('.sidebar-title')).toHaveText('题库 (5)')
      const invalid = page.locator('.sidebar-item-unaddressable')
      await expect(invalid).toHaveCount(4)
      await expect(page.locator('.sidebar-item-reason')).toHaveCount(4)
      for (let index = 0; index < 4; index += 1) {
        const item = invalid.nth(index)
        await expect(item.getByText(reason)).toBeVisible()
        await expect(item.locator('.sidebar-item-main')).toHaveAccessibleName(
          `打开 Recent problem ${index}；${reason}`,
        )
        await expect(item.getByRole('button', { name: '本地笔记' })).toBeDisabled()
        await expect(item.getByRole('button', { name: '查看详情' })).toBeDisabled()
        await item.locator('button').evaluateAll((buttons) => {
          for (const button of buttons) if (button instanceof HTMLButtonElement) button.click()
        })
      }
      await expect(page.getByRole('tab')).toHaveCount(1)
      const firstMain = invalid.first().locator('.sidebar-item-main')
      await firstMain.focus()
      await page.keyboard.press('Tab')
      await expect(invalid.nth(1).locator('.sidebar-item-main')).toBeFocused()
      const layout = await invalid.evaluateAll((items) =>
        items.map((item) => {
          const notice = item.querySelector('.sidebar-item-reason')
          const main = item.querySelector('.sidebar-item-main')
          if (!(notice instanceof HTMLElement) || !(main instanceof HTMLElement)) {
            throw new Error('Missing recent-row content')
          }
          const outer = item.getBoundingClientRect()
          const explanation = notice.getBoundingClientRect()
          const button = main.getBoundingClientRect()
          return {
            withinRow: explanation.left >= outer.left && explanation.right <= outer.right + 1,
            belowActions: explanation.top >= button.bottom,
            fullyWrapped: notice.scrollWidth <= notice.clientWidth + 1,
            visible: getComputedStyle(notice).visibility === 'visible',
          }
        }),
      )
      expect(layout).toEqual(
        Array.from({ length: 4 }, () => ({
          withinRow: true,
          belowActions: true,
          fullyWrapped: true,
          visible: true,
        })),
      )
      await page.screenshot({ path: path.join(outputDir, `invalid-ids-${name}.png`) })
      const valid = page.locator('.sidebar-item').last()
      await expect(valid.getByRole('button', { name: '本地笔记' })).toBeEnabled()
      await expect(valid.getByRole('button', { name: '查看详情' })).toBeEnabled()
      await firstMain.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('body')).toHaveAttribute(
        'data-recent-navigation',
        'https://example.test/problem/0',
      )
      await expect(page.locator('.sidebar-title')).toHaveText('题库 (5)')
    } finally {
      await app.close()
    }
  })
}
