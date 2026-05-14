import type { SiteConfig } from '../types'

export const nowcoder: SiteConfig = {
  id: 'nowcoder',
  name: '牛客',
  domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'],
  homeUrl: 'https://www.nowcoder.com',
  enabled: true,
  problemUrlPatterns: [
    '/practice/{uuid}',
    '/questionTerminal/{uuid}',
    '/acm/problem/{id}',
  ],
  cookiePolicy: 'session-only',
}
