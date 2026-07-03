import {
  getEnabledScripts,
} from '../db/repositories/userScriptRepository'
import type { UserScript } from '../db/repositories/userScriptRepository'
import { getEnabledSites } from '../db/repositories/siteRepository'
import fs from 'node:fs'
import { matchRuleToRegExp, parseScriptMetadata } from './userScriptMetadata'

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
    console.log('[UserScript Match] enabledScripts count:', enabledScripts.length)
    if (enabledScripts.length === 0) return []

    const u = new URL(url)
    const domain = u.hostname
    console.log('[UserScript Match] domain:', domain)
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
      } catch (e) {
        // ignore
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
        } catch {
          // ignore
        }
      }

      if (matched && script.file_path && fs.existsSync(script.file_path)) {
        script.code = fs.readFileSync(script.file_path, 'utf-8')
        const meta = parseScriptMetadata(script.code)
        console.log('[UserScript Match] MATCHED:', script.name, 'requires:', meta.requires.length, 'resources:', meta.resources.length)
        results.push({ script, requires: meta.requires, resources: meta.resources })
      } else if (matched && script.code) {
        const meta = parseScriptMetadata(script.code)
        console.log('[UserScript Match] MATCHED (DB):', script.name)
        results.push({ script, requires: meta.requires, resources: meta.resources })
      } else if (matched) {
        // 匹配成功但无可用代码（file_path 不存在且 code 为空）
        console.log('[UserScript Match] MATCHED BUT NO CODE:', script.name, 'file_path=', script.file_path)
      } else {
        console.log('[UserScript Match] NOT MATCHED:', script.name)
      }
    }


    return results
  }
}
