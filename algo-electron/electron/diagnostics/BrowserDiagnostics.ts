import { nowBeijing } from '../shared/time'
import { appLogger, type Logger } from '../shared/logger'

export type BrowserDiagnosticArea = 'tracking' | 'title' | 'userscript'
export type BrowserDiagnosticStatus = 'success' | 'failed' | 'skipped'

export interface BrowserDiagnosticEntry {
  area: BrowserDiagnosticArea
  event: string
  status: BrowserDiagnosticStatus
  url?: string
  detail?: string
  at: string
}

export interface BrowserDiagnosticsSnapshot {
  entries: BrowserDiagnosticEntry[]
}

const MAX_ENTRIES = 100

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Bounded, injectable diagnostics for browser-side silent fallbacks.
 * It deliberately stores no page content, credentials, or script source.
 */
export class BrowserDiagnostics {
  private readonly entries: BrowserDiagnosticEntry[] = []

  constructor(private readonly logger: Logger = appLogger) {}

  record(
    area: BrowserDiagnosticArea,
    event: string,
    status: BrowserDiagnosticStatus,
    options: { url?: string; detail?: unknown } = {},
  ): void {
    const entry: BrowserDiagnosticEntry = {
      area,
      event,
      status,
      url: options.url,
      detail: options.detail === undefined ? undefined : errorMessage(options.detail),
      at: nowBeijing(),
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES)

    const logData = {
      area: entry.area,
      event: entry.event,
      status: entry.status,
      url: entry.url,
      detail: entry.detail,
    }
    if (status === 'failed') this.logger.warn('browser-diagnostics.event', logData)
    else this.logger.debug('browser-diagnostics.event', logData)
  }

  getSnapshot(limit = MAX_ENTRIES): BrowserDiagnosticsSnapshot {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : MAX_ENTRIES
    return { entries: safeLimit === 0 ? [] : this.entries.slice(-safeLimit).map((entry) => ({ ...entry })) }
  }

  clear(): void {
    this.entries.length = 0
  }
}
