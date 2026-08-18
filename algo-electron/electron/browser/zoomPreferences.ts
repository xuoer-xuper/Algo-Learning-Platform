export const DEFAULT_ZOOM_FACTOR = 1
export const MIN_ZOOM_FACTOR = 0.25
export const MAX_ZOOM_FACTOR = 5
export const MAX_STORED_ZOOM_ORIGINS = 256

export const CHROME_ZOOM_FACTORS = Object.freeze([
  0.25,
  0.33,
  0.5,
  0.67,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  4,
  5,
] as const)

export type ZoomByOrigin = Record<string, number>
export type ZoomCommand = 'in' | 'out' | 'reset'

export interface ZoomState {
  tabId: string
  factor: number
}

export function isZoomCommand(value: unknown): value is ZoomCommand {
  return value === 'in' || value === 'out' || value === 'reset'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeZoomOrigin(value: string): string | null {
  if (!value || value.length > 2_048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || !url.hostname) return null
    return url.origin
  } catch {
    return null
  }
}

export function normalizeZoomFactor(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value * 100) / 100
  if (rounded < MIN_ZOOM_FACTOR || rounded > MAX_ZOOM_FACTOR) return null
  return rounded
}

export function normalizeZoomByOrigin(value: unknown): ZoomByOrigin {
  if (!isRecord(value)) return {}
  const normalized: ZoomByOrigin = {}
  for (const [rawOrigin, rawFactor] of Object.entries(value)) {
    if (Object.keys(normalized).length >= MAX_STORED_ZOOM_ORIGINS) break
    const origin = normalizeZoomOrigin(rawOrigin)
    const factor = normalizeZoomFactor(rawFactor)
    if (!origin || factor === null || factor === DEFAULT_ZOOM_FACTOR) continue
    normalized[origin] = factor
  }
  return normalized
}

export function isStoredZoomByOrigin(value: unknown, normalized: ZoomByOrigin): boolean {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  const normalizedEntries = Object.entries(normalized)
  return entries.length === normalizedEntries.length
    && entries.every(([origin, factor]) => normalized[origin] === factor)
}

export function getZoomFactorForUrl(preferences: ZoomByOrigin, url: string): number {
  const origin = normalizeZoomOrigin(url)
  return origin ? preferences[origin] ?? DEFAULT_ZOOM_FACTOR : DEFAULT_ZOOM_FACTOR
}

export function withZoomFactorForUrl(
  preferences: ZoomByOrigin,
  url: string,
  value: unknown,
): ZoomByOrigin | null {
  const origin = normalizeZoomOrigin(url)
  const factor = normalizeZoomFactor(value)
  if (!origin || factor === null) return null

  const next = normalizeZoomByOrigin(preferences)
  delete next[origin]
  if (factor === DEFAULT_ZOOM_FACTOR) return next

  while (Object.keys(next).length >= MAX_STORED_ZOOM_ORIGINS) {
    const oldestOrigin = Object.keys(next)[0]
    if (!oldestOrigin) break
    delete next[oldestOrigin]
  }
  next[origin] = factor
  return next
}

export function getAdjacentZoomFactor(
  current: number,
  direction: 'in' | 'out',
): number {
  const normalizedCurrent = normalizeZoomFactor(current) ?? DEFAULT_ZOOM_FACTOR
  if (direction === 'in') {
    return CHROME_ZOOM_FACTORS.find((factor) => factor > normalizedCurrent)
      ?? MAX_ZOOM_FACTOR
  }
  for (let index = CHROME_ZOOM_FACTORS.length - 1; index >= 0; index -= 1) {
    const factor = CHROME_ZOOM_FACTORS[index]
    if (factor < normalizedCurrent) return factor
  }
  return MIN_ZOOM_FACTOR
}
