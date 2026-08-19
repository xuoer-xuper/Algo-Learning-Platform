import fs from 'node:fs'
import {
  getEnabledScripts,
  type UserScript,
} from '../db/repositories/userScriptRepository'
import { getEnabledSites, type SiteConfigData } from '../db/repositories/siteRepository'
import {
  isUserScriptUrlExcluded,
  matchesUserScriptUrl,
  parseScriptMetadata,
} from './userScriptMetadata'
import { appLogger } from '../shared/logger'

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

const defaultDependencies: UserScriptServiceDependencies = {
  getEnabledScripts,
  getEnabledSites,
  fileExists: fs.existsSync,
  readFile: filePath => fs.readFileSync(filePath, 'utf8'),
}

export class UserScriptService {
  private readonly dependencies: UserScriptServiceDependencies

  public constructor(dependencies: Partial<UserScriptServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  public getMatchingScripts(url: string): UserScript[] {
    return this.getMatchingScriptsWithMeta(url).map(entry => entry.script)
  }

  public getMatchingScriptsWithMeta(url: string): Array<{
    script: UserScript
    requires: string[]
    resources: { name: string; url: string }[]
  }> {
    let domain: string
    try {
      domain = new URL(url).hostname.toLowerCase()
    } catch (error) {
      appLogger.warn('userscript.url-invalid', { url, error })
      return []
    }

    const enabledScripts = this.dependencies.getEnabledScripts()
    appLogger.debug('userscript.enabled-loaded', { count: enabledScripts.length })
    if (enabledScripts.length === 0) return []

    const enabledSites = this.dependencies.getEnabledSites().filter(site => site.enabled)
    const results: Array<{
      script: UserScript
      requires: string[]
      resources: { name: string; url: string }[]
    }> = []

    for (const script of enabledScripts) {
      const rules = parsePersistedRules(script)
      const siteIds = parseStringArray(script.site_ids_json ?? '[]')
      if (!rules || !siteIds) {
        appLogger.warn('userscript.persisted-rules-invalid', { scriptName: script.name })
        continue
      }

      if (isUserScriptUrlExcluded(url, rules)) {
        appLogger.debug('userscript.excluded', { scriptName: script.name })
        continue
      }

      const matched = siteIds.length > 0
        ? matchesExplicitSiteBinding(domain, siteIds, enabledSites)
        : matchesUserScriptUrl(url, rules)
      if (!matched) {
        appLogger.debug('userscript.not-matched', { scriptName: script.name })
        continue
      }

      const code = this.readScriptCode(script)
      if (!code) {
        appLogger.warn('userscript.matched-without-code', {
          scriptName: script.name,
          hasFilePath: Boolean(script.file_path),
        })
        continue
      }

      const metadata = parseScriptMetadata(code)
      const source = script.code === code ? 'database' : 'file'
      appLogger.debug(`userscript.matched-${source}`, {
        scriptName: script.name,
        requires: metadata.requires.length,
        resources: metadata.resources.length,
      })
      results.push({
        script: script.code === code ? script : { ...script, code },
        requires: metadata.requires,
        resources: metadata.resources,
      })
    }

    return results
  }

  private readScriptCode(script: UserScript): string {
    if (script.file_path && this.dependencies.fileExists(script.file_path)) {
      try {
        return this.dependencies.readFile(script.file_path)
      } catch (error) {
        appLogger.warn('userscript.file-read-failed', {
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
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) return null
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
  return siteIds.some(siteId => {
    const site = enabledSites.find(candidate => candidate.id === siteId)
    return Boolean(site?.domains.some(rawDomain => {
      const siteDomain = rawDomain.toLowerCase()
      return domain === siteDomain || domain.endsWith(`.${siteDomain}`)
    }))
  })
}
