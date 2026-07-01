import type { ProblemIdentity } from '../shared/types'
import { cleanBrowserProblemTitle } from '../parsers/browserTitle'
import type { SiteAdapter, SubmissionDetectionPayload } from './types'

function getPageTitle(raw: SubmissionDetectionPayload): string | undefined {
  const meta = raw.meta
  if (!meta || typeof meta !== 'object') return undefined

  const pageTitle = meta.pageTitle
  return typeof pageTitle === 'string' ? pageTitle : undefined
}

export function resolveProblemIdentityFromBrowserTitle(
  adapter: SiteAdapter,
  raw: SubmissionDetectionPayload,
): ProblemIdentity | null {
  const identity = adapter.parseProblem(raw.pageUrl, {
    url: raw.pageUrl,
    title: getPageTitle(raw),
  })
  if (identity instanceof Promise || !identity) return null

  const title = cleanBrowserProblemTitle(getPageTitle(raw), {
    platform: identity.platform,
    platformProblemId: identity.platformProblemId,
    problemIndex: identity.problemIndex,
  })

  return title ? { ...identity, title } : identity
}
