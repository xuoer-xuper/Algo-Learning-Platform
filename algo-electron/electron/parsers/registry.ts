import type { ProblemIdentity } from '../shared/types'
import {
  getAdapter as getRuntimeAdapter,
  getAdapterForUrl as getRuntimeAdapterForUrl,
} from '../adapters/registry'
import { findMatchingEnabledSite, setEnabledSitesFetcher as setEnabledSitesFetcherImpl } from './enabledSites'
import type { EnabledSiteConfig } from './enabledSites'
import { parseConfigUrl } from './configPattern'
export type { EnabledSiteConfig } from './enabledSites'
export { parseConfigUrl } from './configPattern'

export interface ProblemParserAdapter {
  id: string
  match?: (url: string) => boolean
  parse?: (url: string) => ProblemIdentity | null
}

const customParserAdapters = new Map<string, ProblemParserAdapter>()

export function setEnabledSitesFetcher(fetcher: () => EnabledSiteConfig[]): void {
  setEnabledSitesFetcherImpl(fetcher)
}

export function registerAdapter(adapter: ProblemParserAdapter): void {
  customParserAdapters.set(adapter.id, adapter)
}

export function getAdapter(id: string): ProblemParserAdapter | undefined {
  const customAdapter = customParserAdapters.get(id)
  if (customAdapter) return customAdapter

  const runtimeAdapter = getRuntimeAdapter(id)
  if (!runtimeAdapter) return undefined

  return {
    id: runtimeAdapter.id,
    match: (url) => runtimeAdapter.matchProblem(url),
    parse: (url) => {
      const identity = runtimeAdapter.parseProblem(url, { url })
      return identity instanceof Promise ? null : identity
    },
  }
}

export function getAdapterForUrl(url: string): ProblemParserAdapter | null {
  const site = findMatchingEnabledSite(url)
  if (!site) return null

  const adapterId = site.adapter || site.id
  const customAdapter = customParserAdapters.get(adapterId)
  if (customAdapter && (!customAdapter.match || customAdapter.match(url))) {
    return customAdapter
  }

  const runtimeAdapter = getRuntimeAdapter(adapterId) ?? getRuntimeAdapterForUrl(url)
  if (!runtimeAdapter?.matchProblem(url)) return null

  return {
    id: runtimeAdapter.id,
    match: (candidateUrl) => runtimeAdapter.matchProblem(candidateUrl),
    parse: (candidateUrl) => {
      const identity = runtimeAdapter.parseProblem(candidateUrl, { url: candidateUrl })
      return identity instanceof Promise ? null : identity
    },
  }
}

export function parseUrl(url: string): ProblemIdentity | null {
  const site = findMatchingEnabledSite(url)
  if (!site) return null

  const adapterId = site.adapter || site.id
  const customAdapter = customParserAdapters.get(adapterId)
  if (customAdapter && (!customAdapter.match || customAdapter.match(url)) && customAdapter.parse) {
    const identity = customAdapter.parse(url)
    if (identity) return identity
  }

  const runtimeAdapter = getRuntimeAdapter(adapterId) ?? getRuntimeAdapterForUrl(url)
  if (runtimeAdapter?.matchProblem(url)) {
    const identity = runtimeAdapter.parseProblem(url, { url })
    if (!(identity instanceof Promise) && identity) return identity
  }

  if (site.problemUrlPatterns?.length) {
    return parseConfigUrl(url, site.id, site.domains, site.problemUrlPatterns)
  }

  return null
}
