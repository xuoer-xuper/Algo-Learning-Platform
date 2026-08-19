import type { WebContentsUrlSnapshot } from '../browser/TabManager'
import { detectContestFromUrl } from './ContestGuard'

export interface WebContentsUrlSource {
  addWebContentsUrlListener(listener: (snapshot: WebContentsUrlSnapshot) => void): () => void
}

export interface ContestUrlAggregatorOptions {
  isContestUrl?: (url: string) => boolean
  onAggregateUrlChange: (url: string) => void
}

/**
 * Reduces per-webContents URL snapshots into one stable ContestGuard input.
 * The oldest tracked contest view stays authoritative until it leaves or is
 * destroyed, preventing background contest tabs from clearing global mode.
 */
export class ContestUrlAggregator {
  private readonly urls = new Map<number, string>()
  private readonly isContestUrl: (url: string) => boolean
  private readonly onAggregateUrlChange: (url: string) => void
  private aggregateUrl = ''

  constructor(options: ContestUrlAggregatorOptions) {
    this.isContestUrl = options.isContestUrl ?? ((url) => detectContestFromUrl(url) !== null)
    this.onAggregateUrlChange = options.onAggregateUrlChange
  }

  update(webContentsId: number, url: string): void {
    this.urls.set(webContentsId, url)
    this.syncAggregateUrl()
  }

  remove(webContentsId: number): void {
    if (!this.urls.delete(webContentsId)) return
    this.syncAggregateUrl()
  }

  clear(): void {
    if (this.urls.size === 0 && !this.aggregateUrl) return
    this.urls.clear()
    this.setAggregateUrl('')
  }

  private syncAggregateUrl(): void {
    const contestUrl = Array.from(this.urls.values()).find((url) => this.isContestUrl(url)) ?? ''
    this.setAggregateUrl(contestUrl)
  }

  private setAggregateUrl(url: string): void {
    if (url === this.aggregateUrl) return
    this.aggregateUrl = url
    this.onAggregateUrlChange(url)
  }
}

export function installContestNavigationTracking(
  source: WebContentsUrlSource,
  aggregator: ContestUrlAggregator,
): () => void {
  const trackedWebContentsIds = new Set<number>()
  const unsubscribe = source.addWebContentsUrlListener((snapshot) => {
    if (snapshot.url === null) {
      trackedWebContentsIds.delete(snapshot.webContentsId)
      aggregator.remove(snapshot.webContentsId)
      return
    }
    trackedWebContentsIds.add(snapshot.webContentsId)
    aggregator.update(snapshot.webContentsId, snapshot.url)
  })

  return () => {
    unsubscribe()
    for (const webContentsId of trackedWebContentsIds) {
      aggregator.remove(webContentsId)
    }
    trackedWebContentsIds.clear()
  }
}
