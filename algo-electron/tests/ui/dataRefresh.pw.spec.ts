import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DataChangedPayload } from '../../src/shared/types/data'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tmpRoot = path.join(projectRoot, 'tmp')
const buildDir = path.join(tmpRoot, 'ui-data-refresh')

function removeUserData(userData: string): void {
  const resolved = path.resolve(userData)
  if (!resolved.startsWith(`${path.resolve(tmpRoot)}${path.sep}data-refresh-user-data-`)) {
    throw new Error('Refusing to remove data outside this test userData directory')
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 })
}

test.beforeAll(() => {
  const result = spawnSync(process.execPath, ['tests/ui/dataRefreshBuild.mjs', buildDir], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  expect(result.error).toBeUndefined()
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
})

test('background Codeforces sync refreshes Dashboard and ProblemDetail within two seconds', async () => {
  fs.mkdirSync(tmpRoot, { recursive: true })
  const userData = fs.mkdtempSync(path.join(tmpRoot, 'data-refresh-user-data-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  let app: ElectronApplication | undefined
  const errors: string[] = []
  try {
    app = await electron.launch({
      args: [path.join(buildDir, 'dataRefreshMain.mjs')],
      cwd: projectRoot,
      env: {
        ...env,
        ALP_DATA_REFRESH_USER_DATA: userData,
        ALP_DATA_REFRESH_RENDERER_DIST: path.join(buildDir, 'renderer'),
        ALP_DATA_REFRESH_PRELOAD: path.join(buildDir, 'dataRefreshPreload.cjs'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })
    const page = await app.firstWindow()
    page.on('pageerror', (error) => errors.push(error.message))
    const dashboard = page.getByTestId('data-refresh-dashboard')
    const detail = page.getByTestId('data-refresh-detail')
    await expect(dashboard.locator('.dashboard-card-value').first()).toHaveText('1')
    await expect(detail.locator('.detail-title')).toHaveText('Refresh acceptance problem')
    await expect(detail.locator('.detail-info')).toContainText('0 次（AC 0 次）')
    const initialDashboard = await dashboard.locator('.dashboard-page').elementHandle()
    const initialDetail = await detail.locator('.detail-page').elementHandle()
    if (!initialDashboard || !initialDetail) throw new Error('Fixture readers did not mount')

    const { result, completedAt } = await page.evaluate(async () => {
      const result = await window.api.submissions.syncCodeforces('fixture-handle')
      return { result, completedAt: performance.now() }
    })
    expect(result).toEqual({ platform: 'codeforces', fetched: 2, inserted: 2 })
    await Promise.all([
      expect(dashboard.locator('.dashboard-card-value').first()).toHaveText('2', { timeout: 2000 }),
      expect(detail.locator('.detail-info')).toContainText('1 次（AC 1 次）', { timeout: 2000 }),
      expect(detail.locator('.submission-verdict')).toHaveText('AC', { timeout: 2000 }),
    ])
    expect(await page.evaluate((start) => performance.now() - start, completedAt)).toBeLessThan(
      2000,
    )
    expect(
      await page.evaluate(
        ([dashboardBefore, detailBefore]) =>
          dashboardBefore === document.querySelector('.dashboard-page') &&
          detailBefore === document.querySelector('.detail-page'),
        [initialDashboard, initialDetail],
      ),
    ).toBe(true)

    const state = await app.evaluate(() => {
      const readSnapshot = Reflect.get(globalThis, 'dataRefreshSnapshot') as () => {
        networkRequests: string[]
        broadcasts: DataChangedPayload[]
        totalProblems: number
        detail: { submission_count: number; ac_count: number } | null
      }
      return readSnapshot()
    })
    expect(state.networkRequests).toEqual(['/api/user.status'])
    expect(state.totalProblems).toBe(2)
    expect(state.detail?.submission_count).toBe(1)
    expect(state.detail?.ac_count).toBe(1)
    expect(state.broadcasts).toHaveLength(1)
    expect(state.broadcasts[0]?.tables.slice().sort()).toEqual(['problems', 'stats', 'submissions'])
    expect(errors).toEqual([])
  } finally {
    try {
      await app?.close()
    } finally {
      removeUserData(userData)
    }
  }
})
