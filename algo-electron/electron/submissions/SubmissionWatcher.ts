import type { BrowserWindow } from 'electron'
import { getAdapter, getAdapterForUrl } from '../adapters/registry'
import { getSiteById } from '../db/repositories/siteRepository'
import { SubmissionWatcherCore, type SubmissionWatcherOptions, type SubmissionWatcherResult } from './SubmissionWatcherCore'
import { createDefaultSubmissionBatchWriter } from './createDefaultSubmissionBatchWriter'

export class SubmissionWatcher {
  private readonly core: SubmissionWatcherCore

  constructor(getWindow: () => BrowserWindow | null) {
    const batchWriter = createDefaultSubmissionBatchWriter()
    this.core = new SubmissionWatcherCore({
      getAdapter,
      getAdapterForUrl,
      isSiteEnabled: (id) => {
        const site = getSiteById(id)
        return !site || site.enabled
      },
      writeSubmission: (submission, identity, raw) => {
        const result = batchWriter.write({
          platform: submission.platform,
          submissions: [submission],
          pageProblemId: identity?.platformProblemId,
          pageProblemIdentity: identity,
          currentUrl: raw.pageUrl,
        })
        return result.inserted > 0
      },
      notifyUpdated: (notification) => {
        const win = getWindow()
        win?.webContents.send('problems:updated')
        win?.webContents.send('submissions:detected', notification)
      },
      logError: (message, error) => {
        console.error(message, error)
      },
    })
  }

  handleDetected(raw: unknown, options: SubmissionWatcherOptions = {}): SubmissionWatcherResult {
    return this.core.handleDetected(raw, options)
  }
}
