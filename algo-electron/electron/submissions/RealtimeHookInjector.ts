import type { SiteAdapter } from '../adapters/types'
import type { BrowserPageEvent } from '../browser/TabManager'
import type { SiteConfigData } from '../db/repositories/siteRepository'
import type { RealtimeSubmissionDiagnostics } from './RealtimeSubmissionDiagnostics'

export interface RealtimeHookHost {
  executeScriptAcrossFramesForPage(event: BrowserPageEvent, code: string): Promise<unknown>
}

export interface RealtimeHookInjectorDeps {
  getRealtimeAdapterForUrl(url: string): SiteAdapter | null
  getSiteById(id: string): SiteConfigData | null
  diagnostics: RealtimeSubmissionDiagnostics
  logWarn(message: string, ...args: unknown[]): void
}

export class RealtimeHookInjector {
  constructor(private readonly deps: RealtimeHookInjectorDeps) {}

  inject(host: RealtimeHookHost, event: BrowserPageEvent): void {
    const { url } = event
    const adapter = this.deps.getRealtimeAdapterForUrl(url)
    this.deps.diagnostics.recordPageSeen(url, adapter?.id)
    if (!adapter?.injectHookScript) return

    const site = this.deps.getSiteById(adapter.id)
    if (site && !site.enabled) {
      this.deps.diagnostics.recordHookSkipped(adapter.id, url, 'Site disabled')
      return
    }

    this.executeWithRetry(host, event, adapter.injectHookScript())
      .then(() => {
        this.deps.diagnostics.recordHookSuccess(adapter.id, url)
      })
      .catch((error) => {
        this.deps.diagnostics.recordHookFailure(adapter.id, url, error)
        this.deps.logWarn('[RealtimeSubmission] hook injection failed:', adapter.id, error?.message ?? error)
      })
  }

  private async executeWithRetry(
    host: RealtimeHookHost,
    event: BrowserPageEvent,
    code: string,
  ): Promise<unknown> {
    let lastError: unknown
    // Remote OJ pages often finish SPA navigation before their frames are ready.
    // Retry only the injection step; the injected adapter still owns readiness.
    for (const delayMs of [0, 250, 1000]) {
      if (delayMs > 0) {
        await new Promise(resolve => { setTimeout(resolve, delayMs) })
      }
      try {
        return await host.executeScriptAcrossFramesForPage(event, code)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}
