import type { SiteConfig } from '../types'

export const luogu: SiteConfig = {
  id: 'luogu',
  name: '洛谷',
  domains: ['luogu.com.cn', 'www.luogu.com.cn'],
  homeUrl: 'https://www.luogu.com.cn',
  enabled: true,
  problemUrlPatterns: [], // Uses adapter for parsing
  adapter: 'luogu',
  cookiePolicy: 'vault-readable', // Allow reading cookies for submissions if needed
}
