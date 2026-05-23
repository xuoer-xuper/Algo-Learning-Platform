import type { SiteConfig } from '../types'

export const pta: SiteConfig = {
  id: 'pta',
  name: 'PTA',
  domains: ['pintia.cn'],
  homeUrl: 'https://pintia.cn',
  enabled: true,
  problemUrlPatterns: [
    '/problem-sets/{setId}/problems/{problemId}',
    '/problem-sets/{setId}/exam-problems/{problemId}',
  ],
  cookiePolicy: 'session-only',
}
