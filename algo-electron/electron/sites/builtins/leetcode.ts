import type { SiteConfig } from '../types'

export const leetcode: SiteConfig = {
  id: 'leetcode-cn',
  name: 'LeetCode.cn',
  domains: ['leetcode.cn', 'www.leetcode.cn'],
  homeUrl: 'https://leetcode.cn/problemset/',
  enabled: true,
  problemUrlPatterns: [],
  adapter: 'leetcode-cn',
  cookiePolicy: 'vault-readable',
}
