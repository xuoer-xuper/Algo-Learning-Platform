import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'

interface BuiltinSiteSeed {
  id: string
  name: string
  domains: string[]
  homeUrl: string
}

const BUILTIN_SITE_SEEDS: BuiltinSiteSeed[] = [
  { id: 'codeforces', name: 'Codeforces', domains: ['codeforces.com', 'www.codeforces.com'], homeUrl: 'https://codeforces.com' },
  { id: 'acwing', name: 'AcWing', domains: ['acwing.com', 'www.acwing.com'], homeUrl: 'https://www.acwing.com' },
  { id: 'nowcoder', name: '牛客', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], homeUrl: 'https://ac.nowcoder.com' },
  { id: 'vjudge', name: 'VJudge', domains: ['vjudge.net', 'www.vjudge.net'], homeUrl: 'https://vjudge.net' },
  { id: 'pta', name: 'PTA', domains: ['pintia.cn'], homeUrl: 'https://pintia.cn' },
  { id: 'luogu', name: '洛谷', domains: ['luogu.com.cn', 'www.luogu.com.cn'], homeUrl: 'https://www.luogu.com.cn' },
  { id: 'leetcode-cn', name: 'LeetCode.cn', domains: ['leetcode.cn', 'www.leetcode.cn'], homeUrl: 'https://leetcode.cn/problemset/' },
]

export function seedBuiltinSites(): void {
  const db = getDb()
  const now = nowBeijing()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO site_configs (id, name, domains_json, home_url, enabled, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?)
  `)

  for (const site of BUILTIN_SITE_SEEDS) {
    insert.run(site.id, site.name, JSON.stringify(site.domains), site.homeUrl, now, now)
  }
}
