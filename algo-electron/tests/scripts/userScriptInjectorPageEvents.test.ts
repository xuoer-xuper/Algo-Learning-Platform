import { describe, expect, it, vi } from 'vitest'
import type { BrowserPageEvent } from '../../electron/browser/TabManager'
import { BrowserDiagnostics } from '../../electron/diagnostics/BrowserDiagnostics'
import { installUserScriptInjection } from '../../electron/scripts/userScriptInjector'

function pageEvent(webContentsId: number, reason: BrowserPageEvent['reason'] = 'did-finish-load'): BrowserPageEvent {
  return {
    windowId: 'window-1',
    tabId: `tab-${webContentsId}`,
    webContentsId,
    url: 'https://leetcode.cn/problems/two-sum/',
    isMainFrame: true,
    reason,
  }
}

function createLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createScriptService() {
  return {
    getMatchingScriptsWithMeta: vi.fn(() => [{
      script: { name: 'Page marker', version: '1.0', code: 'window.pageMarker = true;' },
      requires: [],
      resources: [],
    }]),
  }
}

describe('userscript page event injection', () => {
  it('injects into background and active tabs with the same URL by exact page identity', async () => {
    const listeners: Array<(event: BrowserPageEvent) => void> = []
    const executions: Array<{ event: BrowserPageEvent; code: string }> = []
    const service = createScriptService()
    const tabManager = {
      addPageEventListener(callback: (event: BrowserPageEvent) => void) {
        listeners.push(callback)
        return () => undefined
      },
      executeScriptForPage(event: BrowserPageEvent, code: string) {
        executions.push({ event, code })
        return Promise.resolve()
      },
    }

    installUserScriptInjection({
      tabManager: tabManager as never,
      getUserScriptService: () => service as never,
      logger: createLogger() as never,
    })

    listeners.forEach((listener) => listener(pageEvent(101)))
    listeners.forEach((listener) => listener(pageEvent(202)))

    await vi.waitFor(() => {
      expect(executions.filter(({ code }) => code.includes('window.pageMarker = true;'))).toHaveLength(2)
    })
    expect(service.getMatchingScriptsWithMeta).toHaveBeenCalledTimes(2)
    expect(executions.filter(({ code }) => code.includes('window.pageMarker = true;')).map(({ event }) => (
      event.webContentsId
    )).sort()).toEqual([101, 202])
  })

  it('ignores iframe and non-load lifecycle events', async () => {
    const listeners: Array<(event: BrowserPageEvent) => void> = []
    const service = createScriptService()
    const executeScriptForPage = vi.fn(() => Promise.resolve())
    const tabManager = {
      addPageEventListener(callback: (event: BrowserPageEvent) => void) {
        listeners.push(callback)
        return () => undefined
      },
      executeScriptForPage,
    }

    installUserScriptInjection({
      tabManager: tabManager as never,
      getUserScriptService: () => service as never,
      logger: createLogger() as never,
    })

    listeners.forEach((listener) => listener({ ...pageEvent(101), isMainFrame: false }))
    listeners.forEach((listener) => listener(pageEvent(101, 'dom-ready')))
    await Promise.resolve()

    expect(service.getMatchingScriptsWithMeta).not.toHaveBeenCalled()
    expect(executeScriptForPage).not.toHaveBeenCalled()
  })

  it('fails closed when navigation makes the page event stale during injection', async () => {
    const listeners: Array<(event: BrowserPageEvent) => void> = []
    const diagnostics = new BrowserDiagnostics()
    const logger = createLogger()
    const service = createScriptService()
    const currentUrls = new Map([[101, pageEvent(101).url]])
    let releaseFirstExecution: (() => void) | null = null
    let executionCount = 0
    const tabManager = {
      addPageEventListener(callback: (event: BrowserPageEvent) => void) {
        listeners.push(callback)
        return () => undefined
      },
      executeScriptForPage(event: BrowserPageEvent) {
        executionCount += 1
        if (currentUrls.get(event.webContentsId) !== event.url) {
          return Promise.reject(new Error('Page navigation is stale'))
        }
        if (executionCount === 1) {
          return new Promise<void>((resolve) => {
            releaseFirstExecution = resolve
          })
        }
        return Promise.resolve()
      },
    }

    installUserScriptInjection({
      tabManager: tabManager as never,
      getUserScriptService: () => service as never,
      diagnostics,
      logger: logger as never,
    })

    listeners.forEach((listener) => listener(pageEvent(101)))
    currentUrls.set(101, 'https://leetcode.cn/problems/three-sum/')
    const release = releaseFirstExecution as (() => void) | null
    if (!release) throw new Error('first injection did not start')
    release()

    await vi.waitFor(() => {
      expect(diagnostics.getSnapshot().entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          area: 'userscript',
          event: 'inject',
          status: 'failed',
          detail: 'Page marker: Page navigation is stale',
        }),
      ]))
    })
    expect(logger.error).toHaveBeenCalledWith(
      'userscript.inject-failed',
      expect.objectContaining({ error: 'Page navigation is stale' }),
    )
    expect(diagnostics.getSnapshot().entries.some((entry) => entry.status === 'success')).toBe(false)
  })
})
