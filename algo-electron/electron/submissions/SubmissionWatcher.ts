import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { getAdapter, getAdapterForUrl } from '../adapters/registry'
import { getSiteById } from '../db/repositories/siteRepository'
import { SubmissionWatcherCore, type SubmissionWatcherOptions, type SubmissionWatcherResult } from './SubmissionWatcherCore'
import { createDefaultSubmissionBatchWriter } from './createDefaultSubmissionBatchWriter'

/**
 * 提交事件名。主进程订阅者通过 `watcher.on('detected', cb)` 监听。
 * payload 类型同 SubmissionNotification。
 */
export const SUBMISSION_WATCHER_DETECTED_EVENT = 'detected'

/**
 * SubmissionWatcher：在 SubmissionWatcherCore 之上薄封装，提供：
 * 1. site/adapter 注入
 * 2. batchWriter 注入
 * 3. renderer 通知（webContents.send('submissions:detected')）
 *
 * 阶段 2 扩展：继承 EventEmitter，在 notifyUpdated 中同步 emit('detected', notification)，
 * 让主进程订阅者（CoachEventBridge）无需侵入 core 即可拿到提交结果。
 *
 * 抓取与解析逻辑完全不动，仅在通知出口追加一个 emit。
 */
export class SubmissionWatcher extends EventEmitter {
  private readonly core: SubmissionWatcherCore

  constructor(getWindow: () => BrowserWindow | null) {
    super()
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
        // 阶段 2：同步通知主进程订阅者（CoachEventBridge）
        // 只在 inserted=true 时 core 才会调用 notifyUpdated，所以这里无脑 emit 即可。
        this.emit(SUBMISSION_WATCHER_DETECTED_EVENT, notification)
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
