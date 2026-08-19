import crypto from 'node:crypto'
import { parseUrl } from '../parsers/registry'
import { getSiteById } from '../db/repositories/siteRepository'
import { recomputeDailyStats } from '../db/repositories/statsRepository'
import type { ProblemIdentity } from '../shared/types'
import { nowBeijing } from '../shared/time'
import { appLogger, type Logger } from '../shared/logger'
import type { BrowserPageEvent } from '../browser/TabManager'
import { finishProblemVisit, startProblemVisit } from './trackingRepository'

type TrackingPageIdentity = Pick<BrowserPageEvent, 'windowId' | 'tabId' | 'webContentsId'>

interface CurrentVisit {
  visitId: string
  enteredAt: number
  localDay: string
  problemKey: string
  webContentsId: number | null
}

export interface TrackingServiceOptions {
  logger?: Logger
  clock?: () => number
  now?: () => string
}

export class TrackingService {
  private readonly currentVisits = new Map<string, CurrentVisit>()
  private readonly problemDetectedListeners = new Set<(
    identity: ProblemIdentity,
    source: TrackingPageIdentity | null,
  ) => void>()
  private readonly logger: Logger
  private readonly clock: () => number
  private readonly now: () => string

  constructor(options: TrackingServiceOptions | Logger = {}) {
    const normalized = 'debug' in options ? { logger: options } : options
    this.logger = normalized.logger ?? appLogger
    this.clock = normalized.clock ?? Date.now
    this.now = normalized.now ?? nowBeijing
  }

  setProblemDetectedCallback(callback: (identity: ProblemIdentity) => void) {
    this.problemDetectedListeners.clear()
    this.problemDetectedListeners.add((identity) => callback(identity))
  }

  addProblemDetectedListener(
    callback: (identity: ProblemIdentity, source: TrackingPageIdentity | null) => void,
  ): () => void {
    this.problemDetectedListeners.add(callback)
    return () => this.problemDetectedListeners.delete(callback)
  }

  handleNavigation(event: BrowserPageEvent): ProblemIdentity | null
  handleNavigation(url: string): ProblemIdentity | null
  handleNavigation(input: BrowserPageEvent | string): ProblemIdentity | null {
    const url = typeof input === 'string' ? input : input.url
    const source = typeof input === 'string' ? null : input
    const windowId = source?.windowId ?? 'legacy'
    return this.handleWindowNavigation(windowId, url, source)
  }

  handleWindowNavigation(
    windowId: string,
    url: string,
    source: TrackingPageIdentity | null = null,
  ): ProblemIdentity | null {
    const identity = parseUrl(url)
    if (!identity) {
      this.endVisitForWindow(windowId)
      return null
    }

    const site = getSiteById(identity.platform)
    if (!site || !site.enabled) {
      this.endVisitForWindow(windowId)
      return null
    }

    for (const listener of this.problemDetectedListeners) listener(identity, source)
    const problemKey = `${identity.platform}:${identity.platformProblemId}`
    const currentVisit = this.currentVisits.get(windowId)
    if (currentVisit?.problemKey === problemKey) {
      currentVisit.webContentsId = source?.webContentsId ?? currentVisit.webContentsId
      return identity
    }

    this.endVisitForWindow(windowId)

    const now = this.now()
    const today = now.slice(0, 10)
    const visitId = crypto.randomUUID()
    const started = startProblemVisit({
      identity,
      visitId,
      activityId: crypto.randomUUID(),
      now,
      localDay: today,
    })
    if (!started) return identity

    this.currentVisits.set(windowId, {
      visitId,
      enteredAt: this.clock(),
      localDay: today,
      problemKey,
      webContentsId: source?.webContentsId ?? null,
    })
    try {
      recomputeDailyStats(today)
    } catch (error) {
      this.logger.warn('tracking.stats-recompute-failed', { phase: 'visit-start', day: today, error })
    }
    this.logger.debug('tracking.visit-started', {
      windowId,
      visitId,
      platform: identity.platform,
      platformProblemId: identity.platformProblemId,
      url: identity.canonicalUrl,
    })

    return identity
  }

  endVisitForPage(source: TrackingPageIdentity): void {
    const currentVisit = this.currentVisits.get(source.windowId)
    if (!currentVisit || currentVisit.webContentsId !== source.webContentsId) return
    this.endVisitForWindow(source.windowId)
  }

  endVisitForWindow(windowId: string): void {
    this.endVisit(windowId)
  }

  endCurrentVisit(): void {
    for (const sourceKey of [...this.currentVisits.keys()]) this.endVisit(sourceKey)
  }

  private endVisit(windowId: string): void {
    const currentVisit = this.currentVisits.get(windowId)
    if (!currentVisit) return
    this.currentVisits.delete(windowId)
    const duration = Math.max(0, Math.floor((this.clock() - currentVisit.enteredAt) / 1000))
    finishProblemVisit({
      visitId: currentVisit.visitId,
      leftAt: this.now(),
      durationSeconds: duration,
    })
    try {
      recomputeDailyStats(currentVisit.localDay)
    } catch (error) {
      this.logger.warn('tracking.stats-recompute-failed', {
        phase: 'visit-end',
        day: currentVisit.localDay,
        error,
      })
    }
    this.logger.debug('tracking.visit-ended', {
      windowId,
      visitId: currentVisit.visitId,
      durationSeconds: duration,
    })
  }
}
