export interface UserScriptMetadata {
  name?: string
  description?: string
  version?: string
  matches: string[]
  requires: string[]
  resources: { name: string; url: string }[]
  runAt?: string
}

export function parseScriptMetadata(code: string): UserScriptMetadata {
  const meta: UserScriptMetadata = { matches: [], requires: [], resources: [] }
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
        else if (key === 'require') meta.requires.push(val.split('#')[0])
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

export function matchRuleToRegExp(rule: string): RegExp {
  let pattern = rule.replace(/\*:\/\/\*\./g, '*://__SUBDOMAIN_WILDCARD__')
  pattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  pattern = pattern.replace(/\*/g, '.*')
  pattern = pattern.replace(/__SUBDOMAIN_WILDCARD__/g, '(?:.*\\.)?')

  return new RegExp('^' + pattern + '$')
}
