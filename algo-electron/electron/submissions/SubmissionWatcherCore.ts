import type { ProblemIdentity, SubmissionData } from '../shared/types'
import type { SiteAdapter, SubmissionDetectionPayload } from '../adapters/types'

function isPayload(value: unknown): value is SubmissionDetectionPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as SubmissionDetectionPayload
  return typeof payload.pageUrl === 'string' && payload.pageUrl.length > 0
}

export interface SubmissionWatcherOptions {
  senderUrl?: string
}

export interface SubmissionNotification {
  platform: string
  verdict: string
  problemId?: string
}

export interface SubmissionWatcherCoreDeps {
  getAdapter(id: string): SiteAdapter | undefined
  getAdapterForUrl(url: string): SiteAdapter | null
  isSiteEnabled(id: string): boolean
  writeSubmission(submission: SubmissionData, identity: ProblemIdentity | null, raw: SubmissionDetectionPayload): boolean
  notifyUpdated(notification: SubmissionNotification): void
  logError(message: string, error: unknown): void
}

export interface SubmissionWatcherResult {
  inserted: boolean
  error?: string
  notification?: SubmissionNotification
}

export class SubmissionWatcherCore {
  private seen = new Set<string>()

  constructor(private readonly deps: SubmissionWatcherCoreDeps) {}

  handleDetected(raw: unknown, options: SubmissionWatcherOptions = {}): SubmissionWatcherResult {
    if (!isPayload(raw)) return { inserted: false, error: 'Invalid payload' }

    try {
      const adapter = raw.adapterId ? this.deps.getAdapter(raw.adapterId) : this.deps.getAdapterForUrl(raw.pageUrl)
      if (!adapter?.parseSubmissionResult) return { inserted: false, error: 'No adapter for payload' }

      const pageAdapter = this.deps.getAdapterForUrl(raw.pageUrl)
      if (!pageAdapter || pageAdapter.id !== adapter.id) {
        return { inserted: false, error: 'Payload adapter does not match page URL' }
      }

      if (options.senderUrl) {
        const senderAdapter = this.deps.getAdapterForUrl(options.senderUrl)
        if (!senderAdapter || senderAdapter.id !== adapter.id) {
          return { inserted: false, error: 'Payload sender does not match adapter' }
        }
      }

      if (!this.deps.isSiteEnabled(adapter.id)) return { inserted: false, error: 'Site disabled' }

      const parsedSubmission = adapter.parseSubmissionResult(raw)
      if (!parsedSubmission) return { inserted: false, error: 'No final submission parsed' }
      // Core stays fail-closed: adapters may see queue/running states, but only
      // final verdicts are allowed to reach persistence.
      if (parsedSubmission.verdict === 'TESTING' || parsedSubmission.verdict === 'UNKNOWN') {
        return { inserted: false, error: 'No final submission parsed' }
      }

      const key = `${parsedSubmission.platform}:${parsedSubmission.platformSubmissionId}`
      if (this.seen.has(key)) return { inserted: false }

      const submission = { ...parsedSubmission }
      const identity = adapter.resolveProblemIdentity?.(submission, raw)
      const inserted = this.deps.writeSubmission(submission, identity ?? null, raw)
      this.rememberSeen(key)
      if (inserted) {
        const notification = {
          platform: submission.platform,
          verdict: submission.verdict,
          problemId: submission.problemId,
        }
        this.deps.notifyUpdated(notification)
        return { inserted, notification }
      }

      return { inserted }
    } catch (error) {
      this.deps.logError('[SubmissionWatcher] failed to handle detected submission:', error)
      return { inserted: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private rememberSeen(key: string): void {
    this.seen.add(key)
    if (this.seen.size > 500) {
      const first = this.seen.values().next().value
      if (first) this.seen.delete(first)
    }
  }
}
