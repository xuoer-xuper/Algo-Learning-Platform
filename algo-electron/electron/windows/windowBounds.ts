import fs from 'node:fs/promises'
import path from 'node:path'
import type { BrowserWindow, Rectangle } from 'electron'

export const MAIN_WINDOW_BOUNDS = {
  defaultWidth: 1280,
  defaultHeight: 800,
  minWidth: 800,
  minHeight: 600,
} as const

const WINDOW_STATE_VERSION = 1
const MAX_WINDOW_STATE_BYTES = 16 * 1024

export interface WindowDisplayArea extends Rectangle {}

export interface PersistedWindowState {
  version: 1
  bounds: Rectangle
  maximized: boolean
}

interface WindowStateWindow extends Pick<BrowserWindow, 'getNormalBounds' | 'isDestroyed' | 'isMaximized' | 'on' | 'off'> {}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Rectangle>
  return isFiniteInteger(candidate.x)
    && isFiniteInteger(candidate.y)
    && isFiniteInteger(candidate.width)
    && isFiniteInteger(candidate.height)
    && candidate.width > 0
    && candidate.height > 0
}

function intersectionArea(left: Rectangle, right: Rectangle): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function centeredDefaultBounds(primary: WindowDisplayArea): Rectangle {
  const width = Math.min(Math.max(MAIN_WINDOW_BOUNDS.minWidth, MAIN_WINDOW_BOUNDS.defaultWidth), primary.width)
  const height = Math.min(Math.max(MAIN_WINDOW_BOUNDS.minHeight, MAIN_WINDOW_BOUNDS.defaultHeight), primary.height)
  return {
    x: primary.x + Math.max(0, Math.floor((primary.width - width) / 2)),
    y: primary.y + Math.max(0, Math.floor((primary.height - height) / 2)),
    width,
    height,
  }
}

export function normalizeWindowState(
  value: unknown,
  displayAreas: readonly WindowDisplayArea[],
  primaryDisplayArea: WindowDisplayArea,
): PersistedWindowState {
  const fallback: PersistedWindowState = {
    version: WINDOW_STATE_VERSION,
    bounds: centeredDefaultBounds(primaryDisplayArea),
    maximized: false,
  }
  if (!value || typeof value !== 'object') return fallback
  const candidate = value as Partial<PersistedWindowState>
  if (candidate.version !== WINDOW_STATE_VERSION || !isRectangle(candidate.bounds)) return fallback

  const availableDisplays = displayAreas.length > 0 ? displayAreas : [primaryDisplayArea]
  const targetDisplay = availableDisplays.reduce<{ area: WindowDisplayArea; overlap: number }>(
    (best, area) => {
      const overlap = intersectionArea(candidate.bounds!, area)
      return overlap > best.overlap ? { area, overlap } : best
    },
    { area: primaryDisplayArea, overlap: 0 },
  )
  const area = targetDisplay.overlap > 0 ? targetDisplay.area : primaryDisplayArea
  const width = Math.min(Math.max(candidate.bounds.width, MAIN_WINDOW_BOUNDS.minWidth), area.width)
  const height = Math.min(Math.max(candidate.bounds.height, MAIN_WINDOW_BOUNDS.minHeight), area.height)
  const maximumX = area.x + Math.max(0, area.width - width)
  const maximumY = area.y + Math.max(0, area.height - height)

  return {
    version: WINDOW_STATE_VERSION,
    bounds: {
      x: clamp(candidate.bounds.x, area.x, maximumX),
      y: clamp(candidate.bounds.y, area.y, maximumY),
      width,
      height,
    },
    maximized: candidate.maximized === true,
  }
}

export class WindowStateStore {
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(
    displayAreas: readonly WindowDisplayArea[],
    primaryDisplayArea: WindowDisplayArea,
  ): Promise<PersistedWindowState> {
    try {
      const stat = await fs.stat(this.filePath)
      if (!stat.isFile() || stat.size > MAX_WINDOW_STATE_BYTES) {
        return normalizeWindowState(null, displayAreas, primaryDisplayArea)
      }
      const raw = await fs.readFile(this.filePath, 'utf8')
      return normalizeWindowState(JSON.parse(raw), displayAreas, primaryDisplayArea)
    } catch {
      return normalizeWindowState(null, displayAreas, primaryDisplayArea)
    }
  }

  save(state: PersistedWindowState): Promise<void> {
    const save = this.saveQueue
      .catch(() => undefined)
      .then(() => this.writeAtomic(state))
    this.saveQueue = save
    return save
  }

  private async writeAtomic(state: PersistedWindowState): Promise<void> {
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.tmp`
    await fs.mkdir(directory, { recursive: true })
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(state), 'utf8')
      await fs.rename(temporaryPath, this.filePath)
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }
}

export interface WindowStatePersistence {
  flush(): Promise<void>
  dispose(): Promise<void>
}

export function installWindowStatePersistence(
  browserWindow: WindowStateWindow,
  store: WindowStateStore,
  debounceMs = 250,
): WindowStatePersistence {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSave: Promise<void> = Promise.resolve()
  let disposed = false

  const snapshot = (): PersistedWindowState | null => {
    if (browserWindow.isDestroyed()) return null
    return {
      version: WINDOW_STATE_VERSION,
      bounds: browserWindow.getNormalBounds(),
      maximized: browserWindow.isMaximized(),
    }
  }
  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const state = snapshot()
    if (state) pendingSave = pendingSave.catch(() => undefined).then(() => store.save(state))
    await pendingSave
  }
  const schedule = (): void => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush().catch(() => undefined)
    }, debounceMs)
  }

  browserWindow.on('move', schedule)
  browserWindow.on('resize', schedule)
  browserWindow.on('maximize', schedule)
  browserWindow.on('unmaximize', schedule)

  return {
    flush,
    async dispose(): Promise<void> {
      if (disposed) return pendingSave
      disposed = true
      browserWindow.off('move', schedule)
      browserWindow.off('resize', schedule)
      browserWindow.off('maximize', schedule)
      browserWindow.off('unmaximize', schedule)
      await flush()
    },
  }
}
