import type { SiteConfig } from '../types'

export const codeforces: SiteConfig = {
  id: 'codeforces',
  name: 'Codeforces',
  domains: ['codeforces.com', 'www.codeforces.com'],
  homeUrl: 'https://codeforces.com',
  enabled: true,
  problemUrlPatterns: [
    '/problemset/problem/{contestId}/{index}',
    '/contest/{contestId}/problem/{index}',
    '/gym/{contestId}/problem/{index}',
    '/problemset/problem/{contestId}',
  ],
  cookiePolicy: 'session-only',
}
