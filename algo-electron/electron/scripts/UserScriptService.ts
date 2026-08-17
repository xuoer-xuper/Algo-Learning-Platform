import {
  getEnabledScripts,
} from '../db/repositories/userScriptRepository'
import type { UserScript } from '../db/repositories/userScriptRepository'
import { getEnabledSites } from '../db/repositories/siteRepository'
import fs from 'node:fs'
import { matchRuleToRegExp, parseScriptMetadata } from './userScriptMetadata'
import { appLogger } from '../shared/logger'

export class UserScriptService {
  public getMatchingScripts(url: string): UserScript[] {
    return this.getMatchingScriptsWithMeta(url).map(s => s.script)
  }

  public getMatchingScriptsWithMeta(url: string): Array<{
    script: UserScript;
    requires: string[];
    resources: { name: string; url: string }[];
  }> {
    const enabledScripts = getEnabledScripts()
    appLogger.debug('userscript.enabled-loaded', { count: enabledScripts.length })
    if (enabledScripts.length === 0) return []

    const u = new URL(url)
    const domain = u.hostname
    appLogger.debug('userscript.match-domain', { url, domain })
    const enabledSites = getEnabledSites()

    const results: Array<{ script: UserScript; requires: string[]; resources: { name: string; url: string }[] }> = []

    for (const script of enabledScripts) {
      let matched = false

      // 1. Check site_ids_json
      try {
        const siteIds = JSON.parse(script.site_ids_json || '[]')
        for (const siteId of siteIds) {
          const site = enabledSites.find((s: any) => s.id === siteId)
          if (site && site.domains) {
            const isDomainMatch = site.domains.some(
              (d: string) => domain === d || domain.endsWith('.' + d)
            )
            if (isDomainMatch) {
              matched = true
              break
            }
          }
        }
      } catch (error) {
        appLogger.warn('userscript.site-ids-invalid', { scriptName: script.name, error })
      }

      // 2. Check match_urls_json fallback
      if (!matched) {
        try {
          const matches = JSON.parse(script.match_urls_json)
          for (const rule of matches) {
            const regex = matchRuleToRegExp(rule)
            if (regex.test(url)) {
              matched = true
              break
            }
          }
        } catch (error) {
          appLogger.warn('userscript.match-rules-invalid', { scriptName: script.name, error })
        }
      }

      if (matched && script.file_path && fs.existsSync(script.file_path)) {
        script.code = fs.readFileSync(script.file_path, 'utf-8')
        const meta = parseScriptMetadata(script.code)
        appLogger.debug('userscript.matched-file', {
          scriptName: script.name,
          requires: meta.requires.length,
          resources: meta.resources.length,
        })
        results.push({ script, requires: meta.requires, resources: meta.resources })
      } else if (matched && script.code) {
        const meta = parseScriptMetadata(script.code)
        appLogger.debug('userscript.matched-database', { scriptName: script.name })
        results.push({ script, requires: meta.requires, resources: meta.resources })
      } else if (matched) {
        // 匹配成功但无可用代码（file_path 不存在且 code 为空）
        appLogger.warn('userscript.matched-without-code', {
          scriptName: script.name,
          hasFilePath: Boolean(script.file_path),
        })
      } else {
        appLogger.debug('userscript.not-matched', { scriptName: script.name })
      }
    }


    return results
  }
}
