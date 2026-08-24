import path from 'node:path'
import {
  getAllScripts,
  getScriptById,
  type UserScript,
} from '../db/repositories/userScriptRepository'
import {
  getUserScriptUpdateState,
} from '../db/repositories/userScriptRuntimeRepository'
import { appLogger, type Logger } from '../shared/logger'
import { toChinaStandardTime } from '../shared/time'
import {
  compareUserScriptVersions,
  resolveUserScriptImportDecision,
  type ExistingUserScriptIdentity,
} from './userScriptImport'
import { prepareUserScriptResources } from './UserScriptResourceCache'
import {
  markUserScriptUpdateAvailable,
  markUserScriptUpdateChecking,
  markUserScriptUpdateCurrent,
  markUserScriptUpdateError,
  persistUserScriptInstall,
} from './UserScriptInstaller'
import {
  fetchUserScriptDocument,
  type UserScriptDocumentResponse,
  type UserScriptRemoteFetch,
} from './UserScriptRemoteFetch'
import { resolveUserScriptRequestTarget } from './userScriptConnectPolicy'
import { parseScriptMetadata, type UserScriptMetadata } from './userScriptMetadata'

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1_000

export type UserScriptUpdateResultStatus = 'updated' | 'current' | 'skipped' | 'error'

export interface UserScriptUpdateResult {
  scriptId: string
  name: string
  status: UserScriptUpdateResultStatus
  previousVersion: string | null
  version: string | null
  error?: string
}

export interface UserScriptUpdateSummary {
  checked: number
  updated: number
  current: number
  skipped: number
  failed: number
  results: UserScriptUpdateResult[]
}

interface UserScriptUpdateDependencies {
  getAllScripts: typeof getAllScripts
  getScriptById: typeof getScriptById
  getUpdateState: typeof getUserScriptUpdateState
  prepareResources: typeof prepareUserScriptResources
  persistInstall: typeof persistUserScriptInstall
  markChecking: typeof markUserScriptUpdateChecking
  markAvailable: typeof markUserScriptUpdateAvailable
  markCurrent: typeof markUserScriptUpdateCurrent
  markError: typeof markUserScriptUpdateError
  logger: Logger
}

export interface UserScriptUpdateServiceOptions {
  fetch: UserScriptRemoteFetch
  scriptsDirectory: string
  allowInsecureLocalhost?: boolean
  clock?: () => Date
  schedulerIntervalMs?: number
  onUpdated?: () => void
  dependencies?: Partial<UserScriptUpdateDependencies>
}

export class UserScriptUpdateService {
  private readonly fetch: UserScriptRemoteFetch
  private readonly scriptsDirectory: string
  private readonly allowInsecureLocalhost: boolean
  private readonly clock: () => Date
  private readonly schedulerIntervalMs: number
  private readonly onUpdated?: () => void
  private readonly dependencies: UserScriptUpdateDependencies
  private readonly checking = new Map<string, Promise<UserScriptUpdateResult>>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(options: UserScriptUpdateServiceOptions) {
    this.fetch = options.fetch
    this.scriptsDirectory = path.resolve(options.scriptsDirectory)
    this.allowInsecureLocalhost = options.allowInsecureLocalhost ?? false
    this.clock = options.clock ?? (() => new Date())
    this.schedulerIntervalMs = options.schedulerIntervalMs ?? SCHEDULER_INTERVAL_MS
    this.onUpdated = options.onUpdated
    if (!Number.isFinite(this.schedulerIntervalMs) || this.schedulerIntervalMs <= 0) {
      throw new RangeError('schedulerIntervalMs must be positive')
    }
    this.dependencies = {
      getAllScripts,
      getScriptById,
      getUpdateState: getUserScriptUpdateState,
      prepareResources: prepareUserScriptResources,
      persistInstall: persistUserScriptInstall,
      markChecking: markUserScriptUpdateChecking,
      markAvailable: markUserScriptUpdateAvailable,
      markCurrent: markUserScriptUpdateCurrent,
      markError: markUserScriptUpdateError,
      logger: appLogger,
      ...options.dependencies,
    }
  }

  start(): void {
    if (this.timer) return
    void this.checkAll(false)
    this.timer = setInterval(() => { void this.checkAll(false) }, this.schedulerIntervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async checkAll(force = true): Promise<UserScriptUpdateSummary> {
    const scripts = this.dependencies.getAllScripts()
    const results: UserScriptUpdateResult[] = []
    for (const script of scripts) {
      if (!this.shouldCheck(script, force)) {
        results.push(toResult(script, 'skipped'))
        continue
      }
      results.push(await this.checkScript(script.id))
    }
    return {
      checked: results.filter(result => result.status !== 'skipped').length,
      updated: results.filter(result => result.status === 'updated').length,
      current: results.filter(result => result.status === 'current').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      failed: results.filter(result => result.status === 'error').length,
      results,
    }
  }

  checkScript(scriptId: string): Promise<UserScriptUpdateResult> {
    const current = this.checking.get(scriptId)
    if (current) return current
    const promise = this.checkScriptOnce(scriptId)
    this.checking.set(scriptId, promise)
    return promise.finally(() => {
      if (this.checking.get(scriptId) === promise) this.checking.delete(scriptId)
    })
  }

  private shouldCheck(script: UserScript, force: boolean): boolean {
    if (!script.auto_update_enabled || getUpdateUrls(script, this.allowInsecureLocalhost).length === 0) return false
    if (force) return true
    const state = this.dependencies.getUpdateState(script.id)
    return !state?.next_check_at || state.next_check_at <= toChinaStandardTime(this.clock())
  }

  private async checkScriptOnce(scriptId: string): Promise<UserScriptUpdateResult> {
    const script = this.dependencies.getScriptById(scriptId)
    if (!script || !script.auto_update_enabled) {
      return script ? toResult(script, 'skipped') : {
        scriptId,
        name: '',
        status: 'skipped',
        previousVersion: null,
        version: null,
      }
    }
    const urls = getUpdateUrls(script, this.allowInsecureLocalhost)
    if (urls.length === 0) return toResult(script, 'skipped')
    const state = this.dependencies.getUpdateState(script.id)
    this.dependencies.markChecking(script.id)
    try {
      const { checkUrl, checked, metadata: checkedMetadata } = await this.fetchUpdateMetadata(urls, state)
      if (checked.status === 'not-modified') {
        this.markCurrent(script, checkUrl, checked)
        return toResult(script, 'current')
      }

      if (!checkedMetadata) throw new Error('Userscript update metadata is unavailable')
      const relation = compareUserScriptVersions(checkedMetadata.version, script.version)
      if (relation !== 'newer') {
        this.markCurrent(script, checkUrl, checked)
        return toResult(script, 'current')
      }
      this.dependencies.markAvailable(script.id, checkedMetadata.version ?? null)

      const existing: ExistingUserScriptIdentity = {
        id: script.id,
        namespace: script.namespace,
        identityName: script.identity_name,
        version: script.version,
        filePath: script.file_path,
      }
      const prepared = await this.prepareDownload(
        script,
        existing,
        checkUrl,
        checked,
        checkedMetadata.downloadURL,
      )
      const { resolved, resources, downloadUrl } = prepared
      const nextCheckUrl = firstSafeUrl([
        resolved.decision.metadata.updateURL,
        resolved.decision.metadata.downloadURL,
        script.last_install_url,
      ], this.allowInsecureLocalhost)
      const validatorsApply = nextCheckUrl !== null
        && sameRequestUrl(nextCheckUrl, checkUrl, checked.finalUrl)
        && new URL(checkUrl).origin === new URL(checked.finalUrl).origin
      await this.dependencies.persistInstall({
        decision: resolved.decision,
        resources,
        scriptsDirectory: this.scriptsDirectory,
        claimLegacy: resolved.claimLegacy,
        sourceUrl: script.last_install_url ?? downloadUrl,
        etag: validatorsApply ? checked.etag : null,
        lastModified: validatorsApply ? checked.lastModified : null,
        now: this.clock(),
      })
      this.onUpdated?.()
      return {
        ...toResult(script, 'updated'),
        version: resolved.decision.metadata.version ?? null,
      }
    }
    catch (error) {
      this.dependencies.markError(script.id, error, this.clock())
      this.dependencies.logger.warn('userscript.update-failed', {
        scriptId: script.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return {
        ...toResult(script, 'error'),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private markCurrent(script: UserScript, checkUrl: string, response: UserScriptDocumentResponse): void {
    const nextCheckUrl = getUpdateUrls(script, this.allowInsecureLocalhost)[0]
    const validatorsApply = sameRequestUrl(nextCheckUrl, checkUrl, response.finalUrl)
      && new URL(checkUrl).origin === new URL(response.finalUrl).origin
    this.dependencies.markCurrent(script.id, {
      etag: validatorsApply ? response.etag : null,
      lastModified: validatorsApply ? response.lastModified : null,
      now: this.clock(),
    })
  }

  private async fetchUpdateMetadata(
    urls: readonly string[],
    state: ReturnType<typeof getUserScriptUpdateState>,
  ): Promise<{
      checkUrl: string
      checked: UserScriptDocumentResponse
      metadata: UserScriptMetadata | null
    }> {
    let lastError: unknown = new Error('No userscript update source is available')
    for (let index = 0; index < urls.length; index += 1) {
      const checkUrl = urls[index]
      try {
        const checked = await fetchUserScriptDocument(checkUrl, {
          fetch: this.fetch,
          allowInsecureLocalhost: this.allowInsecureLocalhost,
          etag: index === 0 ? state?.etag : null,
          lastModified: index === 0 ? state?.last_modified : null,
        })
        if (checked.status === 'not-modified') return { checkUrl, checked, metadata: null }
        return { checkUrl, checked, metadata: parseUpdateMetadata(checked.code) }
      }
      catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  private async prepareDownload(
    script: UserScript,
    existing: ExistingUserScriptIdentity,
    checkUrl: string,
    checked: Extract<UserScriptDocumentResponse, { status: 'ok' }>,
    advertisedDownloadUrl: string | undefined,
  ): Promise<{
      resolved: ReturnType<typeof resolveUserScriptImportDecision>
      resources: Awaited<ReturnType<typeof prepareUserScriptResources>>
      downloadUrl: string
    }> {
    const candidates = getDownloadUrls(
      script,
      checkUrl,
      advertisedDownloadUrl,
      this.allowInsecureLocalhost,
    )
    let lastError: unknown = new Error('No userscript download source is available')
    for (const downloadUrl of candidates) {
      try {
        const downloaded = sameRequestUrl(downloadUrl, checkUrl, checked.finalUrl)
          ? checked
          : await fetchUserScriptDocument(downloadUrl, {
              fetch: this.fetch,
              allowInsecureLocalhost: this.allowInsecureLocalhost,
            })
        if (downloaded.status !== 'ok' || !hasExecutableBody(downloaded.code)) {
          throw new Error('Userscript update source returned no executable content')
        }
        const resolved = resolveUserScriptImportDecision({
          code: downloaded.code,
          sourceFileName: fileNameFromUrl(downloadUrl),
          existingScripts: [existing],
        })
        if (resolved.decision.action !== 'update' || resolved.decision.existing?.id !== script.id) {
          throw new Error('Userscript update identity does not match the installed script')
        }
        if (resolved.decision.versionComparison !== 'newer') {
          throw new Error('Userscript download version does not match the advertised update')
        }
        const resources = await this.dependencies.prepareResources(resolved.decision.metadata, {
          fetch: this.fetch,
          allowInsecureLocalhost: this.allowInsecureLocalhost,
        })
        return { resolved, resources, downloadUrl }
      }
      catch (error) {
        lastError = error
      }
    }
    throw lastError
  }
}

function getUpdateUrls(script: UserScript, allowInsecureLocalhost: boolean): string[] {
  const urls = [script.update_url, script.download_url, script.last_install_url]
  const safe = urls.flatMap((value) => {
    if (!value || value.toLowerCase() === 'none') return []
    const target = resolveUserScriptRequestTarget(value, allowInsecureLocalhost)
    return target ? [target.url] : []
  })
  return [...new Set(safe)]
}

function firstSafeUrl(
  urls: Array<string | null | undefined>,
  allowInsecureLocalhost: boolean,
): string | null {
  for (const value of urls) {
    if (!value || value.toLowerCase() === 'none') continue
    const target = resolveUserScriptRequestTarget(value, allowInsecureLocalhost)
    if (target) return target.url
  }
  return null
}

function getDownloadUrls(
  script: UserScript,
  checkUrl: string,
  advertisedDownloadUrl: string | undefined,
  allowInsecureLocalhost: boolean,
): string[] {
  const values = [
    advertisedDownloadUrl,
    script.download_url,
    isUserScriptUrl(checkUrl) ? checkUrl : null,
    script.last_install_url,
  ]
  const safe = values.flatMap((value) => {
    if (!value || value.toLowerCase() === 'none') return []
    const target = resolveUserScriptRequestTarget(value, allowInsecureLocalhost)
    return target ? [target.url] : []
  })
  return [...new Set(safe)]
}

function parseUpdateMetadata(code: string): UserScriptMetadata {
  const start = code.indexOf('// ==UserScript==')
  const end = code.indexOf('// ==/UserScript==')
  if (start < 0 || end <= start) throw new Error('Userscript update metadata block is missing')
  return parseScriptMetadata(code)
}

function hasExecutableBody(code: string): boolean {
  const endMarker = '// ==/UserScript=='
  const end = code.indexOf(endMarker)
  return end >= 0 && code.slice(end + endMarker.length).trim().length > 0
}

function isUserScriptUrl(value: string): boolean {
  try { return decodeURIComponent(new URL(value).pathname).toLowerCase().endsWith('.user.js') }
  catch { return false }
}

function sameRequestUrl(candidate: string, requested: string, finalUrl: string): boolean {
  return candidate === requested || candidate === finalUrl
}

function fileNameFromUrl(value: string): string {
  try { return decodeURIComponent(new URL(value).pathname.split('/').at(-1) || 'script.user.js') }
  catch { return 'script.user.js' }
}

function toResult(script: UserScript, status: UserScriptUpdateResultStatus): UserScriptUpdateResult {
  return {
    scriptId: script.id,
    name: script.name,
    status,
    previousVersion: script.version,
    version: script.version,
  }
}
