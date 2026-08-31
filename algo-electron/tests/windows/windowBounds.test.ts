import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
import { MockBrowserWindow } from '../electron/electronMock'
import {
  installWindowStatePersistence,
  normalizeWindowState,
  WindowStateStore,
  type PersistedWindowState,
  type WindowDisplayArea,
} from '../../electron/windows/windowBounds.ts'

const primaryDisplay: WindowDisplayArea = { x: 0, y: 0, width: 1920, height: 1080 }

test('keeps valid negative coordinates on a left-side secondary display', () => {
  const leftDisplay: WindowDisplayArea = { x: -1920, y: 0, width: 1920, height: 1080 }
  const state: PersistedWindowState = {
    version: 1,
    bounds: { x: -1600, y: 120, width: 1200, height: 800 },
    maximized: false,
  }

  assert.deepStrictEqual(normalizeWindowState(state, [leftDisplay, primaryDisplay], primaryDisplay), state)
})

test('moves a completely offscreen state wholly inside the primary display', () => {
  const normalized = normalizeWindowState({
    version: 1,
    bounds: { x: -2500, y: 1400, width: 1400, height: 900 },
    maximized: true,
  }, [primaryDisplay], primaryDisplay)

  assert.strictEqual(normalized.maximized, true)
  assert.ok(normalized.bounds.x >= primaryDisplay.x)
  assert.ok(normalized.bounds.y >= primaryDisplay.y)
  assert.ok(normalized.bounds.x + normalized.bounds.width <= primaryDisplay.x + primaryDisplay.width)
  assert.ok(normalized.bounds.y + normalized.bounds.height <= primaryDisplay.y + primaryDisplay.height)
})

test('falls back to centered defaults for corrupt, wrong-version, and non-finite state', () => {
  const fallback = {
    version: 1,
    bounds: { x: 320, y: 140, width: 1280, height: 800 },
    maximized: false,
  }
  const invalidStates = [
    null,
    { version: 2, bounds: { x: 1, y: 2, width: 1000, height: 700 }, maximized: true },
    { version: 1, bounds: { x: Number.NaN, y: 2, width: 1000, height: 700 }, maximized: false },
    { version: 1, bounds: { x: 1, y: 2, width: Number.POSITIVE_INFINITY, height: 700 }, maximized: false },
  ]

  for (const state of invalidStates) {
    assert.deepStrictEqual(normalizeWindowState(state, [primaryDisplay], primaryDisplay), fallback)
  }
})

test('WindowStateStore load falls back when the persisted JSON is corrupt', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'algo-window-state-'))
  const filePath = path.join(directory, 'window-state.json')
  try {
    await fs.writeFile(filePath, '{not-json', 'utf8')

    const state = await new WindowStateStore(filePath).load([primaryDisplay], primaryDisplay)

    assert.deepStrictEqual(state, {
      version: 1,
      bounds: { x: 320, y: 140, width: 1280, height: 800 },
      maximized: false,
    })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('WindowStateStore serializes concurrent atomic saves using the shared temporary path', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'algo-window-state-'))
  const filePath = path.join(directory, 'window-state.json')
  const originalRename = fs.rename.bind(fs)
  let activeRenames = 0
  let maximumActiveRenames = 0
  const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
    activeRenames += 1
    maximumActiveRenames = Math.max(maximumActiveRenames, activeRenames)
    try {
      await new Promise((resolve) => setTimeout(resolve, 10))
      await originalRename(source, destination)
    } finally {
      activeRenames -= 1
    }
  })
  try {
    const store = new WindowStateStore(filePath)
    const firstState: PersistedWindowState = {
      version: 1,
      bounds: { x: 100, y: 80, width: 1000, height: 700 },
      maximized: false,
    }
    const secondState: PersistedWindowState = {
      version: 1,
      bounds: { x: 220, y: 140, width: 1200, height: 800 },
      maximized: true,
    }

    await Promise.all([store.save(firstState), store.save(secondState)])

    assert.strictEqual(renameSpy.mock.calls.length, 2)
    assert.strictEqual(maximumActiveRenames, 1)
    assert.deepStrictEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), secondState)
  } finally {
    renameSpy.mockRestore()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('maximized persistence saves normal bounds instead of maximized screen bounds', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'algo-window-state-'))
  const filePath = path.join(directory, 'window-state.json')
  try {
    const browserWindow = new MockBrowserWindow({ x: 120, y: 80, width: 1100, height: 720 })
    browserWindow.maximize()
    browserWindow.setBounds({ x: 0, y: 0, width: 1920, height: 1080 })
    const persistence = installWindowStatePersistence(browserWindow as never, new WindowStateStore(filePath))

    await persistence.flush()

    assert.deepStrictEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), {
      version: 1,
      bounds: { x: 120, y: 80, width: 1100, height: 720 },
      maximized: true,
    })
    await persistence.dispose()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
