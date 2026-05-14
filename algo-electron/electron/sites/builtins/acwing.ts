import type { SiteConfig } from '../types'

export const acwing: SiteConfig = {
  id: 'acwing',
  name: 'AcWing',
  domains: ['acwing.com', 'www.acwing.com'],
  homeUrl: 'https://www.acwing.com',
  enabled: true,
  problemUrlPatterns: [
    '/problem/content/{id}/',
    '/problem/content/description/{id}/',
  ],
  cookiePolicy: 'session-only',
}
