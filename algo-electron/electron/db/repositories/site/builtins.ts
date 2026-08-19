import { getDb } from '../../connection'
import { nowBeijing } from '../../../shared/time'

interface BuiltinSiteSeed {
  id: string
  name: string
  domains: string[]
  homeUrl: string
  problemUrlPatterns: string[]
  submitUrlPatterns: string[]
  loginUrlPatterns: string[]
  loginUsernameSelectors: string[]
  loginPasswordSelectors: string[]
  cookiePolicy: string
  adapter?: string
}

const BUILTIN_SITE_SEEDS: BuiltinSiteSeed[] = [
  { id: 'codeforces', name: 'Codeforces', domains: ['codeforces.com', 'www.codeforces.com'], homeUrl: 'https://codeforces.com', problemUrlPatterns: ['/problemset/problem/{contestId}/{index}', '/contest/{contestId}/problem/{index}', '/gym/{contestId}/problem/{index}', '/problemset/problem/{contestId}'], submitUrlPatterns: [], loginUrlPatterns: ['/enter'], loginUsernameSelectors: ['input[name="handleOrEmail"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[name="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'session-only', adapter: 'codeforces' },
  { id: 'acwing', name: 'AcWing', domains: ['acwing.com', 'www.acwing.com'], homeUrl: 'https://www.acwing.com', problemUrlPatterns: ['/problem/content/{id}/', '/problem/content/description/{id}/'], submitUrlPatterns: [], loginUrlPatterns: ['/user/login*', '/login*'], loginUsernameSelectors: ['input[name="username"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[name="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'session-only', adapter: 'acwing' },
  { id: 'nowcoder', name: '牛客', domains: ['nowcoder.com', 'www.nowcoder.com', 'ac.nowcoder.com'], homeUrl: 'https://ac.nowcoder.com', problemUrlPatterns: ['/practice/{uuid}', '/questionTerminal/{uuid}', '/acm/problem/{id}'], submitUrlPatterns: [], loginUrlPatterns: ['/user/login*', '/login*'], loginUsernameSelectors: ['input[name="username"]', 'input[name="phone"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'session-only', adapter: 'nowcoder' },
  { id: 'vjudge', name: 'VJudge', domains: ['vjudge.net', 'www.vjudge.net'], homeUrl: 'https://vjudge.net', problemUrlPatterns: ['/problem/{sourceOJ}-{problemId}'], submitUrlPatterns: ['/submit'], loginUrlPatterns: ['/login*', '/user/login*'], loginUsernameSelectors: ['input[name="username"]', 'input[name="userName"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'session-only', adapter: 'vjudge' },
  { id: 'pta', name: 'PTA', domains: ['pintia.cn'], homeUrl: 'https://pintia.cn', problemUrlPatterns: ['/problem-sets/{setId}/problems/{problemId}', '/problem-sets/{setId}/exam-problems/{problemId}'], submitUrlPatterns: [], loginUrlPatterns: ['/auth/login*', '/login*'], loginUsernameSelectors: ['input[name="username"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'session-only', adapter: 'pta' },
  { id: 'luogu', name: '洛谷', domains: ['luogu.com.cn', 'www.luogu.com.cn'], homeUrl: 'https://www.luogu.com.cn', problemUrlPatterns: [], submitUrlPatterns: [], loginUrlPatterns: ['/auth/login*', '/login*'], loginUsernameSelectors: ['input[name="username"]', 'input[name="email"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'vault-readable', adapter: 'luogu' },
  { id: 'leetcode-cn', name: 'LeetCode.cn', domains: ['leetcode.cn', 'www.leetcode.cn'], homeUrl: 'https://leetcode.cn/problemset/', problemUrlPatterns: [], submitUrlPatterns: [], loginUrlPatterns: ['/accounts/login*', '/login*'], loginUsernameSelectors: ['input[name="login"]', 'input[name="username"]', 'input[autocomplete="username"]'], loginPasswordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'], cookiePolicy: 'vault-readable', adapter: 'leetcode-cn' },
]

export function seedBuiltinSites(): void {
  const db = getDb()
  const now = nowBeijing()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO site_configs (id, name, domains_json, home_url, enabled, problem_url_patterns_json, submit_url_patterns_json, login_url_patterns_json, login_username_selectors_json, login_password_selectors_json, cookie_policy, adapter, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `)

  const update = db.prepare(`
    UPDATE site_configs SET
      problem_url_patterns_json = COALESCE(problem_url_patterns_json, @problemUrlPatterns),
      submit_url_patterns_json = COALESCE(submit_url_patterns_json, @submitUrlPatterns),
      login_url_patterns_json = COALESCE(login_url_patterns_json, @loginUrlPatterns),
      login_username_selectors_json = COALESCE(login_username_selectors_json, @usernameSelectors),
      login_password_selectors_json = COALESCE(login_password_selectors_json, @passwordSelectors),
      cookie_policy = COALESCE(cookie_policy, @cookiePolicy),
      adapter = COALESCE(adapter, @adapter)
    WHERE id = @id AND is_builtin = 1
  `)

  for (const site of BUILTIN_SITE_SEEDS) {
    insert.run(
      site.id,
      site.name,
      JSON.stringify(site.domains),
      site.homeUrl,
      JSON.stringify(site.problemUrlPatterns),
      JSON.stringify(site.submitUrlPatterns),
      JSON.stringify(site.loginUrlPatterns),
      JSON.stringify(site.loginUsernameSelectors),
      JSON.stringify(site.loginPasswordSelectors),
      site.cookiePolicy,
      site.adapter ?? null,
      now,
      now,
    )
    update.run({
      id: site.id,
      problemUrlPatterns: JSON.stringify(site.problemUrlPatterns),
      submitUrlPatterns: JSON.stringify(site.submitUrlPatterns),
      loginUrlPatterns: JSON.stringify(site.loginUrlPatterns),
      usernameSelectors: JSON.stringify(site.loginUsernameSelectors),
      passwordSelectors: JSON.stringify(site.loginPasswordSelectors),
      cookiePolicy: site.cookiePolicy,
      adapter: site.adapter ?? null,
    })
  }
}
