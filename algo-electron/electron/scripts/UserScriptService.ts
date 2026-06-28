import { ipcMain } from 'electron'
import {
  getAllScripts,
  getEnabledScripts,
  createScript,
  updateScript,
  deleteScript,
  toggleScript,
  UserScript
} from '../db/repositories/userScriptRepository'
import { getEnabledSites } from '../db/repositories/siteRepository'
import { app, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export class UserScriptService {
  constructor() {
    this.registerIpc()
  }

  private registerIpc() {
    ipcMain.handle('scripts:getAll', () => {
      return getAllScripts()
    })

    ipcMain.handle('scripts:save', (_event, id: string | null, data: Partial<UserScript>) => {
      if (id) {
        updateScript(id, data)
        return id
      } else {
        return createScript(data as any)
      }
    })

    ipcMain.handle('scripts:importFile', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择用户脚本',
        filters: [{ name: 'JavaScript', extensions: ['js', 'user.js'] }],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return null

      const srcPath = filePaths[0]
      const code = fs.readFileSync(srcPath, 'utf-8')
      const meta = this.parseScriptMetadata(code)
      
      const userData = app.getPath('userData')
      const scriptsDir = path.join(userData, 'userscripts')
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true })
      }
      
      const newFilename = `${crypto.randomUUID()}.js`
      const destPath = path.join(scriptsDir, newFilename)
      fs.copyFileSync(srcPath, destPath)

      const data = {
        name: meta.name || path.basename(srcPath),
        description: meta.description || '',
        version: meta.version || '1.0',
        match_urls_json: JSON.stringify(meta.matches),
        code: '', // we don't store full code anymore
        file_path: destPath,
        site_ids_json: '[]',
        enabled: true
      }
      
      const id = createScript(data)
      return id
    })

    ipcMain.handle('scripts:openFolder', () => {
      const scriptsDir = path.join(app.getPath('userData'), 'userscripts')
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true })
      }
      shell.openPath(scriptsDir)
    })

    ipcMain.handle('scripts:toggle', (_event, id: string, enabled: boolean) => {
      return toggleScript(id, enabled)
    })

    ipcMain.handle('scripts:delete', (_event, id: string) => {
      return deleteScript(id)
    })
  }

  private parseScriptMetadata(code: string) {
    const meta: {
      name?: string; description?: string; version?: string;
      matches: string[]; requires: string[]; resources: { name: string; url: string }[];
      runAt?: string
    } = { matches: [], requires: [], resources: [] }
    const lines = code.split('\n')
    let inMeta = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '// ==UserScript==') {
        inMeta = true
        continue
      }
      if (trimmed === '// ==/UserScript==') {
        break
      }
      if (inMeta && trimmed.startsWith('// @')) {
        const match = trimmed.match(/^\/\/\s*@([a-zA-Z0-9_-]+)\s+(.+)$/)
        if (match) {
          const key = match[1]
          const val = match[2].trim()
          if (key === 'name') meta.name = val
          else if (key === 'description') meta.description = val
          else if (key === 'version') meta.version = val
          else if (key === 'match' || key === 'include') meta.matches.push(val)
          else if (key === 'require') meta.requires.push(val.split('#')[0]) // strip SRI hash
          else if (key === 'resource') {
            const parts = val.split(/\s+/)
            if (parts.length >= 2) {
              meta.resources.push({ name: parts[0], url: parts[1].split('#')[0] })
            }
          }
          else if (key === 'run-at') meta.runAt = val
        }
      }
    }
    return meta
  }

  /**
   * Simple glob to regex converter for match rules
   */
  private matchRuleToRegExp(rule: string): RegExp {
    // Handle Tampermonkey @match pattern: *://*.domain.com/*
    // The "*." prefix before a domain means "the domain itself AND all subdomains"
    // e.g. *://*.codeforces.com/* should match both codeforces.com and www.codeforces.com

    // First, handle the special "*." subdomain wildcard before escaping
    // Replace *://. with a placeholder
    let pattern = rule.replace(/\*:\/\/\*\./g, '*://__SUBDOMAIN_WILDCARD__')

    // Escape special regex characters except *
    pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Replace * with .*
    pattern = pattern.replace(/\*/g, '.*')
    // Replace placeholder with pattern that matches bare domain OR subdomain.domain
    pattern = pattern.replace(/__SUBDOMAIN_WILDCARD__/g, '(?:.*\\.)?')

    return new RegExp('^' + pattern + '$')
  }

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
            const regex = this.matchRuleToRegExp(rule)
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
        const meta = this.parseScriptMetadata(script.code)
        console.log('[UserScript Match] MATCHED:', script.name, 'requires:', meta.requires.length, 'resources:', meta.resources.length)
        results.push({ script, requires: meta.requires, resources: meta.resources })
      } else if (matched && script.code) {
        const meta = this.parseScriptMetadata(script.code)
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
