import type { SiteConfig } from '../types'

export const vjudge: SiteConfig = {
  id: 'vjudge',
  name: 'VJudge',
  domains: ['vjudge.net', 'www.vjudge.net'],
  homeUrl: 'https://vjudge.net',
  enabled: true,
  problemUrlPatterns: [
    '/problem/{sourceOJ}-{problemId}',
  ],
  submitUrlPatterns: [
    '/submit',
  ],
  cookiePolicy: 'session-only',
}
