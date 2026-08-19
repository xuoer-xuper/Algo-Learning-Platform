import type Database from 'better-sqlite3'

const BUILTIN_LOGIN_CONFIGS = [
  {
    id: 'codeforces',
    loginUrlPatterns: ['/enter'],
    usernameSelectors: ['input[name="handleOrEmail"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[name="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'codeforces',
    cookiePolicy: 'session-only',
  },
  {
    id: 'acwing',
    loginUrlPatterns: ['/user/login*', '/login*'],
    usernameSelectors: ['input[name="username"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[name="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'acwing',
    cookiePolicy: 'session-only',
  },
  {
    id: 'nowcoder',
    loginUrlPatterns: ['/user/login*', '/login*'],
    usernameSelectors: ['input[name="username"]', 'input[name="phone"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'nowcoder',
    cookiePolicy: 'session-only',
  },
  {
    id: 'vjudge',
    loginUrlPatterns: ['/login*', '/user/login*'],
    usernameSelectors: ['input[name="username"]', 'input[name="userName"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'vjudge',
    cookiePolicy: 'session-only',
  },
  {
    id: 'pta',
    loginUrlPatterns: ['/auth/login*', '/login*'],
    usernameSelectors: ['input[name="username"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'pta',
    cookiePolicy: 'session-only',
  },
  {
    id: 'luogu',
    loginUrlPatterns: ['/auth/login*', '/login*'],
    usernameSelectors: ['input[name="username"]', 'input[name="email"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'luogu',
    cookiePolicy: 'vault-readable',
  },
  {
    id: 'leetcode-cn',
    loginUrlPatterns: ['/accounts/login*', '/login*'],
    usernameSelectors: ['input[name="login"]', 'input[name="username"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[type="password"]', 'input[autocomplete="current-password"]'],
    adapter: 'leetcode-cn',
    cookiePolicy: 'vault-readable',
  },
] as const

export const migration028 = {
  version: 28,
  name: 'site_login_autofill_config',
  up: (db: Database.Database) => {
    db.exec(`
      ALTER TABLE site_configs ADD COLUMN login_url_patterns_json TEXT;
      ALTER TABLE site_configs ADD COLUMN login_username_selectors_json TEXT;
      ALTER TABLE site_configs ADD COLUMN login_password_selectors_json TEXT;
    `)

    const update = db.prepare(`
      UPDATE site_configs
      SET
        cookie_policy = COALESCE(cookie_policy, @cookiePolicy),
        adapter = COALESCE(adapter, @adapter),
        login_url_patterns_json = COALESCE(login_url_patterns_json, @loginUrlPatterns),
        login_username_selectors_json = COALESCE(login_username_selectors_json, @usernameSelectors),
        login_password_selectors_json = COALESCE(login_password_selectors_json, @passwordSelectors)
      WHERE id = @id AND is_builtin = 1
    `)

    for (const config of BUILTIN_LOGIN_CONFIGS) {
      update.run({
        id: config.id,
        cookiePolicy: config.cookiePolicy,
        adapter: config.adapter,
        loginUrlPatterns: JSON.stringify(config.loginUrlPatterns),
        usernameSelectors: JSON.stringify(config.usernameSelectors),
        passwordSelectors: JSON.stringify(config.passwordSelectors),
      })
    }
  },
}
