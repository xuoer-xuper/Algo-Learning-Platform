import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TrendPoint } from '../../src/shared/types/stats'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outputDir = path.join(projectRoot, 'tmp', 'daily-trends-ui')
const missingDay = '\u65e5\u671f\u7f3a\u5931'

function fixtures(today: string, previous: string) {
  return {
    visited: [
      { local_day: null, count: 11 },
      { local_day: null, count: 22 },
      { local_day: previous, count: 33 },
      { local_day: today, count: 44 },
    ],
    ac: [
      { local_day: null, count: 7 },
      { local_day: null, count: 5 },
      { local_day: previous, count: 3 },
      { local_day: today, count: 1 },
    ],
  } satisfies { visited: TrendPoint[]; ac: TrendPoint[] }
}

test.beforeAll(() => {
  const build = spawnSync(
    process.execPath,
    ['tests/ui/buildRendererScreenshotHarness.mjs', outputDir],
    {
      cwd: projectRoot,
      encoding: 'utf-8',
    },
  )
  expect(build.error).toBeUndefined()
  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)
})

async function installRows(page: Page, rows: { visited: TrendPoint[]; ac: TrendPoint[] }) {
  await page.evaluate((data) => {
    window.api.stats.getVisitedTrend = async () => data.visited
    window.api.stats.getAcTrend = async () => data.ac
  }, rows)
}

async function assertChartRows(page: Page, chart: Locator, rows: TrendPoint[]) {
  const dots = chart.locator('.recharts-line-dot')
  await expect(dots).toHaveCount(rows.length)
  const coordinates = await dots.evaluateAll((points) =>
    points.map((point) => ({
      x: Number(point.getAttribute('cx')),
      y: Number(point.getAttribute('cy')),
    })),
  )
  expect(coordinates.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
  expect(new Set(coordinates.map(({ x }) => x)).size).toBe(rows.length)
  for (let index = 1; index < coordinates.length; index += 1) {
    expect(coordinates[index].x).toBeGreaterThan(coordinates[index - 1].x)
  }
  await chart.scrollIntoViewIfNeeded()
  for (const [index, point] of rows.entries()) {
    // Move across actual browser coordinates, not a synthetic Recharts state selector.
    const dot = dots.nth(index)
    const box = await dot.boundingBox()
    const chartBox = await chart.boundingBox()
    if (!box || !chartBox) throw new Error('Missing daily trend point bounds')
    const centerX = box.x + box.width / 2
    const centerY = box.y + box.height / 2
    // Chromium truncates fractional MouseEvent coordinates. Round toward the chart
    // interior so a boundary dot still lands inside Recharts' inclusive plot range.
    const x = centerX < chartBox.x + chartBox.width / 2 ? Math.ceil(centerX) : Math.floor(centerX)
    const y = centerY < chartBox.y + chartBox.height / 2 ? Math.ceil(centerY) : Math.floor(centerY)
    expect(x).toBeGreaterThanOrEqual(box.x)
    expect(x).toBeLessThanOrEqual(box.x + box.width)
    expect(y).toBeGreaterThanOrEqual(box.y)
    expect(y).toBeLessThanOrEqual(box.y + box.height)
    await page.mouse.move(x, y)
    await expect(chart.locator('.recharts-tooltip-wrapper')).toHaveCSS('visibility', 'visible')
    await expect(chart.locator('.recharts-tooltip-label')).toHaveText(point.local_day ?? missingDay)
    await expect(chart.locator('.recharts-tooltip-item-value')).toHaveText(String(point.count))
  }
}

for (const { name, width, height } of [
  { name: 'wide', width: 1280, height: 800 },
  { name: 'narrow', width: 800, height: 600 },
]) {
  test(`daily trend NULL slots and range transitions at ${name} size`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium')
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
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.waitForFunction(() => 'api' in window)
      const dates = await page.evaluate(() => {
        const now = new Date()
        function key(date: Date) {
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const previous = new Date(now)
        previous.setDate(previous.getDate() - 1)
        return { today: key(now), previous: key(previous) }
      })
      const mixed = fixtures(dates.today, dates.previous)
      await installRows(page, mixed)
      await page.evaluate(async () => {
        await window.api.tab.openInternal({ type: 'dashboard' })
      })
      const panel = page
        .locator('.dashboard-chart-section')
        .filter({ has: page.locator('.dashboard-range-btns') })
      const chart = (index: number) => panel.locator('.recharts-wrapper').nth(index)
      await panel.getByRole('button', { name: '\u5168\u90e8', exact: true }).click()
      await expect(panel.locator('.recharts-wrapper')).toHaveCount(2)
      await assertChartRows(page, chart(0), mixed.visited)
      await assertChartRows(page, chart(1), mixed.ac)
      for (const index of [0, 1]) {
        await expect(chart(index).locator('.recharts-xAxis-tick-labels')).toContainText(missingDay)
        await expect(chart(index).locator('.recharts-xAxis-tick-labels')).toContainText(
          dates.today.slice(5),
        )
        const bounds = await chart(index).evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, viewport: window.innerWidth }
        })
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1)
        const curve = chart(index).locator('.recharts-line-curve')
        await expect(curve).toHaveCount(1)
        // Recharts removes its draw-animation dasharray only after the line settles.
        await expect(curve).not.toHaveAttribute('stroke-dasharray')
        const screenshot = testInfo.outputPath(`daily-${name}-${index}.png`)
        await chart(index).screenshot({ path: screenshot })
        await testInfo.attach(`daily-${name}-${index}`, {
          path: screenshot,
          contentType: 'image/png',
        })
      }
      for (const days of [7, 30]) {
        await panel.getByRole('button', { name: `${days}\u5929`, exact: true }).click()
        for (const index of [0, 1])
          await expect(chart(index).locator('.recharts-line-dot')).toHaveCount(days)
        await expect(chart(0).locator('.recharts-xAxis-tick-labels')).not.toContainText(missingDay)
        await panel.getByRole('button', { name: '\u5168\u90e8', exact: true }).click()
        await assertChartRows(page, chart(0), mixed.visited)
        await assertChartRows(page, chart(1), mixed.ac)
      }
      const cases: Array<{ visited: TrendPoint[]; ac: TrendPoint[] }> = [
        {
          visited: [
            { local_day: null, count: 8 },
            { local_day: null, count: 9 },
          ],
          ac: [{ local_day: null, count: 0 }],
        },
        {
          visited: [
            { local_day: '', count: 1 },
            { local_day: 'bad', count: 2 },
            { local_day: missingDay, count: 3 },
          ],
          ac: [
            { local_day: 'not-a-calendar-day', count: 4 },
            { local_day: null, count: 5 },
          ],
        },
        { visited: [...mixed.visited].reverse(), ac: [...mixed.ac].reverse() },
        { visited: [], ac: [] },
      ]
      for (const rows of cases) {
        await installRows(page, rows)
        await panel.getByRole('button', { name: '7\u5929', exact: true }).click()
        await expect(chart(0).locator('.recharts-line-dot')).toHaveCount(7)
        await panel.getByRole('button', { name: '\u5168\u90e8', exact: true }).click()
        if (rows.visited.length === 0) {
          await expect(panel.locator('.recharts-wrapper')).toHaveCount(0)
        } else {
          await assertChartRows(page, chart(0), rows.visited)
          await assertChartRows(page, chart(1), rows.ac)
        }
      }
      expect(errors).toEqual([])
    } finally {
      await app.close()
    }
  })
}
