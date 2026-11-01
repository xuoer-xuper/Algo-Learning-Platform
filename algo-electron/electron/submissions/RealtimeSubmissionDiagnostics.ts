import { nowBeijing } from '../shared/time'
import { errorMessage } from '../shared/errors'
import type { RealtimeSubmissionStatus } from '../../src/shared/types/submission'

export class RealtimeSubmissionDiagnostics {
  private ipcRegistered = false
  private supportedAdapterIds: string[] = []
  private lastPage: RealtimeSubmissionStatus['lastPage']
  private lastHook: RealtimeSubmissionStatus['lastHook']
  private lastDetection: RealtimeSubmissionStatus['lastDetection']

  setIpcRegistered(registered: boolean): void {
    this.ipcRegistered = registered
  }

  setSupportedAdapterIds(adapterIds: string[]): void {
    this.supportedAdapterIds = [...adapterIds]
  }

  recordPageSeen(url: string, realtimeAdapterId?: string): void {
    this.lastPage = {
      url,
      realtimeAdapterId,
      realtimeSupported: Boolean(realtimeAdapterId),
      at: nowBeijing(),
    }
  }

  recordHookSuccess(adapterId: string, url: string): void {
    this.lastHook = {
      adapterId,
      url,
      status: 'success',
      at: nowBeijing(),
    }
  }

  recordHookSkipped(adapterId: string, url: string, reason: string): void {
    this.lastHook = {
      adapterId,
      url,
      status: 'skipped',
      reason,
      at: nowBeijing(),
    }
  }

  recordHookFailure(adapterId: string, url: string, error: unknown): void {
    this.lastHook = {
      adapterId,
      url,
      status: 'failed',
      error: errorMessage(error),
      at: nowBeijing(),
    }
  }

  recordDetection(
    senderUrl: string | undefined,
    result: {
      inserted: boolean
      error?: string
      notification?: {
        platform: string
        verdict: string
        problemId?: string
      }
    },
  ): void {
    this.lastDetection = {
      senderUrl,
      inserted: result.inserted,
      error: result.error,
      platform: result.notification?.platform,
      verdict: result.notification?.verdict,
      problemId: result.notification?.problemId,
      at: nowBeijing(),
    }
  }

  getStatus(): RealtimeSubmissionStatus {
    return {
      ipcRegistered: this.ipcRegistered,
      supportedAdapterIds: [...this.supportedAdapterIds],
      lastPage: this.lastPage ? { ...this.lastPage } : undefined,
      lastHook: this.lastHook ? { ...this.lastHook } : undefined,
      lastDetection: this.lastDetection ? { ...this.lastDetection } : undefined,
    }
  }
}
