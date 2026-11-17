import fs from 'node:fs'
import { getEnabledScripts, type UserScript } from '../db/repositories/userScriptRepository'
import { getEnabledSites, type SiteConfigData } from '../db/repositories/siteRepository'
import {
  isUserScriptUrlExcluded,
  matchesUserScriptUrl,
  parseScriptMetadata,
  type UserScriptResourceReference,
} from './userScriptMetadata'
import { logger } from '../shared/logger'

const log = logger.scope('userscript')

interface UserScriptServiceDependencies {
  getEnabledScripts: () => UserScript[]
  getEnabledSites: () => SiteConfigData[]
  fileExists: (filePath: string) => boolean
  readFile: (filePath: string) => string
}

interface PersistedMatchRules {
  matches: string[]
  includes: string[]
  excludes: string[]
  excludeMatches: string[]
}

interface CachedUserScriptDefinition {
  script: UserScript
  rules: PersistedMatchRules
  siteIds: string[]
  requires: UserScriptResourceReference[]
  resources: Array<UserScriptResourceReference & { name: string }>
}

const defaultDependencies: UserScriptServiceDependencies = {
  getEnabledScripts,
  getEnabledSites,
  fileExists: fs.existsSync,
  readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
}

export class UserScriptService {
  private readonly dependencies: UserScriptServiceDependencies
  private cachedDefinitions: CachedUserScriptDefinition[] | null = null
  private cachedEnabledSites: SiteConfigData[] = []

  public constructor(dependencies: Partial<UserScriptServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  public getMatchingScripts(url: string): UserScript[] {
    return this.getMatchingScriptsWithMeta(url).map((entry) => entry.script)
  }

  public refresh(): void {
    this.cachedDefinitions = []
    this.cachedEnabledSites = []

    const enabledScripts = this.dependencies.getEnabledScripts()
    const enabledSites = this.dependencies.getEnabledSites().filter((site) => site.enabled)
    const definitions: CachedUserScriptDefinition[] = []

    for (const persistedScript of enabledScripts) {
      const rules = parsePersistedRules(persistedScript)
      const siteIds = parseStringArray(persistedScript.site_ids_json ?? '[]')
      if (!rules || !siteIds) {
        log.warn('persisted-rules-invalid', { scriptName: persistedScript.name })
        continue
      }

      const code = this.readScriptCode(persistedScript)
      if (!code) {
        log.warn('enabled-without-code', {
          scriptName: persistedScript.name,
          hasFilePath: Boolean(persistedScript.file_path),
        })
        continue
      }

      const metadata = parseScriptMetadata(code)
      definitions.push({
        script: persistedScript.code === code ? persistedScript : { ...persistedScript, code },
        rules,
        siteIds,
        requires: metadata.requires,
        resources: metadata.resources,
      })
    }

    this.cachedDefinitions = definitions
    this.cachedEnabledSites = enabledSites
    log.debug('runtime-cache-refreshed', { count: definitions.length })
  }

  public getEnabledScriptsSnapshot(): UserScript[] {
    return this.getCachedDefinitions().map((definition) => definition.script)
  }

  public getMatchingScriptsWithMeta(url: string): Array<{
    script: UserScript
    requires: UserScriptResourceReference[]
    resources: Array<UserScriptResourceReference & { name: string }>
  }> {
    let domain: string
    try {
      domain = new URL(url).hostname.toLowerCase()
    } catch (error) {
      log.warn('url-invalid', { url, error })
      return []
    }

    const definitions = this.getCachedDefinitions()
    if (definitions.length === 0) return []
    const results: Array<{
      script: UserScript
      requires: UserScriptResourceReference[]
      resources: Array<UserScriptResourceReference & { name: string }>
    }> = []

    for (const definition of definitions) {
      const { script, rules, siteIds, requires, resources } = definition
      if (isUserScriptUrlExcluded(url, rules)) {
        log.debug('excluded', { scriptName: script.name })
        continue
      }

      const matched =
        siteIds.length > 0
          ? matchesExplicitSiteBinding(domain, siteIds, this.cachedEnabledSites)
          : matchesUserScriptUrl(url, rules)
      if (!matched) {
        log.debug('not-matched', { scriptName: script.name })
        continue
      }

      const source = script.file_path ? 'file' : 'database'
      log.debug(`matched-${source}`, {
        scriptName: script.name,
        requires: requires.length,
        resources: resources.length,
      })
      results.push({
        script,
        requires,
        resources,
      })
    }

    return results
  }

  private getCachedDefinitions(): CachedUserScriptDefinition[] {
    if (!this.cachedDefinitions) this.refresh()
    return this.cachedDefinitions ?? []
  }

  private readScriptCode(script: UserScript): string {
    if (script.file_path && this.dependencies.fileExists(script.file_path)) {
      try {
        return this.dependencies.readFile(script.file_path)
      } catch (error) {
        log.warn('file-read-failed', {
          scriptName: script.name,
          filePath: script.file_path,
          error,
        })
      }
    }
    return script.code
  }
}

function parsePersistedRules(script: UserScript): PersistedMatchRules | null {
  const matches = parseStringArray(script.match_urls_json)
  const includes = parseStringArray(script.include_rules_json)
  const excludes = parseStringArray(script.exclude_rules_json)
  const excludeMatches = parseStringArray(script.exclude_match_rules_json)
  if (!matches || !includes || !excludes || !excludeMatches) return null
  return { matches, includes, excludes, excludeMatches }
}

function parseStringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) return null
    return parsed
  } catch {
    return null
  }
}

function matchesExplicitSiteBinding(
  domain: string,
  siteIds: readonly string[],
  enabledSites: readonly SiteConfigData[],
): boolean {
  return siteIds.some((siteId) => {
    const site = enabledSites.find((candidate) => candidate.id === siteId)
    return Boolean(
      site?.domains.some((rawDomain) => {
        const siteDomain = rawDomain.toLowerCase()
        return domain === siteDomain || domain.endsWith(`.${siteDomain}`)
      }),
    )
  })
}
