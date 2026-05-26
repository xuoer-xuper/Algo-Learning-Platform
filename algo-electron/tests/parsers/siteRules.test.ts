import assert from 'node:assert'
import { parseUrl, registerAdapter, parseConfigUrl, setEnabledSitesFetcher } from '../../electron/parsers/registry'
import type { SiteAdapter } from '../../electron/parsers/types'

// Simple test runner helper
const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 1. Built-in parsers tests
test('Codeforces URL parsing', () => {
  const validUrls = [
    'https://codeforces.com/problemset/problem/123/A',
    'https://codeforces.com/contest/456/problem/B',
    'https://codeforces.com/gym/789/problem/C',
    'http://codeforces.com/problemset/problem/123/A', // http protocol
    'https://www.codeforces.com/problemset/problem/123/A', // www subdomain
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'codeforces')
    assert.strictEqual(identity!.confidence, 'url')
  }

  const invalidUrls = [
    'https://codeforces.com',
    'https://codeforces.com/contest/456',
    'https://codeforces.com/problemset',
    'https://google.com',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('AcWing URL parsing', () => {
  const validUrls = [
    'https://www.acwing.com/problem/content/123/',
    'https://www.acwing.com/problem/content/description/123/',
    'http://acwing.com/problem/content/123/',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'acwing')
    assert.strictEqual(identity!.platformProblemId, '123')
  }

  const invalidUrls = [
    'https://www.acwing.com/problem/content/',
    'https://www.acwing.com/about/',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('Nowcoder URL parsing', () => {
  const validUrls = [
    'https://www.nowcoder.com/practice/a1b2c3d4e5f67890',
    'https://ac.nowcoder.com/acm/problem/1000',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'nowcoder')
  }

  const invalidUrls = [
    'https://www.nowcoder.com',
    'https://ac.nowcoder.com',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('VJudge URL parsing', () => {
  const validUrls = [
    'https://vjudge.net/problem/POJ-1000',
    'http://www.vjudge.net/problem/Codeforces-123A',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'vjudge')
  }

  const invalidUrls = [
    'https://vjudge.net',
    'https://vjudge.net/contest',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('PTA URL parsing', () => {
  const validUrls = [
    'https://pintia.cn/problem-sets/123/problems/456',
    'https://pintia.cn/problem-sets/123/exam/problems/456',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'pta')
  }

  const invalidUrls = [
    'https://pintia.cn',
    'https://pintia.cn/problem-sets/123',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

// 2. Custom adapter registration tests
test('Custom adapter registration', () => {
  const hduAdapter: SiteAdapter = {
    id: 'hdu',
    match: (url) => url.includes('acm.hdu.edu.cn/showproblem.php'),
    parse: (url) => {
      try {
        const u = new URL(url)
        const pid = u.searchParams.get('pid')
        if (pid) {
          return {
            platform: 'hdu',
            platformProblemId: pid,
            canonicalUrl: `https://acm.hdu.edu.cn/showproblem.php?pid=${pid}`,
            confidence: 'url',
          }
        }
      } catch {}
      return null
    }
  }

  registerAdapter(hduAdapter)

  // Mock enabled sites fetcher to include HDU configuration
  setEnabledSitesFetcher(() => [
    { id: 'hdu', domains: ['acm.hdu.edu.cn'], enabled: true, adapter: 'hdu', problemUrlPatterns: [] }
  ])

  const testUrl = 'https://acm.hdu.edu.cn/showproblem.php?pid=1000'
  const identity = parseUrl(testUrl)
  assert.ok(identity, 'Should parse custom HDU URL via registered adapter')
  assert.strictEqual(identity!.platform, 'hdu')
  assert.strictEqual(identity!.platformProblemId, '1000')

  // Reset fetcher to default
  setEnabledSitesFetcher(() => [])
})

// 3. Fallback pattern-based parsing tests
test('Dynamic configuration pattern parsing fallback', () => {
  // Test case 1: LeetCode config
  const leetcodeIdentity = parseConfigUrl(
    'https://leetcode.com/problems/two-sum',
    'leetcode',
    ['leetcode.com'],
    ['/problems/{id}']
  )
  assert.ok(leetcodeIdentity, 'Should match pattern /problems/{id}')
  assert.strictEqual(leetcodeIdentity!.platform, 'leetcode')
  assert.strictEqual(leetcodeIdentity!.platformProblemId, 'two-sum')
  assert.strictEqual(leetcodeIdentity!.canonicalUrl, 'https://leetcode.com/problems/two-sum')

  // Test case 2: Pattern with multiple variables
  const contestIdentity = parseConfigUrl(
    'https://example.com/contest/123/problem/A',
    'example',
    ['example.com'],
    ['/contest/{contestId}/problem/{index}']
  )
  assert.ok(contestIdentity, 'Should match multi-variable pattern')
  assert.strictEqual(contestIdentity!.platform, 'example')
  assert.strictEqual(contestIdentity!.platformProblemId, '123-A')
  assert.strictEqual(contestIdentity!.contestId, '123')
  assert.strictEqual(contestIdentity!.problemIndex, 'A')
})

// Run all tests
let failedCount = 0
console.log('Running parser and adapter site rules tests...\n')
for (const t of tests) {
  try {
    t.fn()
    console.log(`[PASS] ${t.name}`)
  } catch (err: any) {
    console.error(`[FAIL] ${t.name}`)
    console.error(err.stack || err)
    failedCount++
  }
}

console.log(`\nTests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exit(1)
}
