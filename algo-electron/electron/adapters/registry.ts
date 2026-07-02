import type { SiteAdapter } from './types'
import { acwingAdapter } from './sites/acwing'
import { codeforcesAdapter } from './sites/codeforces'
import { leetcodeAdapter } from './sites/leetcode'
import { luoguAdapter } from './sites/luogu'
import { nowcoderAdapter } from './sites/nowcoder'
import { ptaAdapter } from './sites/pta'
import { vjudgeAdapter } from './sites/vjudge'

const adapters = new Map<string, SiteAdapter>()

export function registerAdapter(adapter: SiteAdapter): void {
  adapters.set(adapter.id, adapter)
}

export function getAdapter(id: string): SiteAdapter | undefined {
  return adapters.get(id)
}

export function getAdapterForUrl(url: string): SiteAdapter | null {
  try {
    const parsed = new URL(url)
    for (const adapter of adapters.values()) {
      if (adapter.domains.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))) {
        return adapter
      }
    }
  } catch {
    return null
  }
  return null
}

export function getRealtimeAdapterForUrl(url: string): SiteAdapter | null {
  const adapter = getAdapterForUrl(url)
  if (!adapter?.injectHookScript) return null
  const matchesProblem = adapter.matchProblem(url)
  const matchesSubmissionResult = adapter.matchSubmissionResult?.(url) ?? false
  if (!matchesProblem && !matchesSubmissionResult) return null
  if (matchesProblem && !matchesSubmissionResult && adapter.injectOnProblemPage === false) return null
  return adapter
}

export function getRealtimeAdapterIds(): string[] {
  return Array.from(adapters.values())
    .filter(adapter => typeof adapter.injectHookScript === 'function' && typeof adapter.parseSubmissionResult === 'function')
    .map(adapter => adapter.id)
}

registerAdapter(codeforcesAdapter)
registerAdapter(acwingAdapter)
registerAdapter(nowcoderAdapter)
registerAdapter(vjudgeAdapter)
registerAdapter(ptaAdapter)
registerAdapter(luoguAdapter)
registerAdapter(leetcodeAdapter)
