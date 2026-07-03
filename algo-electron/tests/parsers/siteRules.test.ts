import assert from 'node:assert'
import { parseUrl, registerAdapter, parseConfigUrl, setEnabledSitesFetcher, type ProblemParserAdapter } from '../../electron/parsers/registry'
import type { ProblemIdentity } from '../../electron/shared/types'

// Simple test runner helper
const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

type ExpectedIdentity = Pick<ProblemIdentity, 'platform' | 'platformProblemId'> & Partial<ProblemIdentity>

function assertProblemIdentity(url: string, expected: ExpectedIdentity): ProblemIdentity {
  const identity = parseUrl(url)
  assert.ok(identity, `Should parse problem URL: ${url}`)
  assert.strictEqual(identity.platform, expected.platform, `${url} platform`)
  assert.strictEqual(identity.platformProblemId, expected.platformProblemId, `${url} platformProblemId`)
  if (expected.canonicalUrl !== undefined) assert.strictEqual(identity.canonicalUrl, expected.canonicalUrl, `${url} canonicalUrl`)
  if (expected.contestId !== undefined) assert.strictEqual(identity.contestId, expected.contestId, `${url} contestId`)
  if (expected.problemIndex !== undefined) assert.strictEqual(identity.problemIndex, expected.problemIndex, `${url} problemIndex`)
  if (expected.sourcePlatform !== undefined) assert.strictEqual(identity.sourcePlatform, expected.sourcePlatform, `${url} sourcePlatform`)
  if (expected.sourceProblemId !== undefined) assert.strictEqual(identity.sourceProblemId, expected.sourceProblemId, `${url} sourceProblemId`)
  if (expected.confidence !== undefined) assert.strictEqual(identity.confidence, expected.confidence, `${url} confidence`)
  return identity
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

  assertProblemIdentity('https://codeforces.com/contest/456/problem/B', {
    platform: 'codeforces',
    platformProblemId: '456B',
    canonicalUrl: 'https://codeforces.com/contest/456/problem/B',
    contestId: '456',
    problemIndex: 'B',
    confidence: 'url',
  })

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

  assertProblemIdentity('https://www.acwing.com/problem/content/description/123/', {
    platform: 'acwing',
    platformProblemId: '123',
    canonicalUrl: 'https://www.acwing.com/problem/content/123/',
    confidence: 'url',
  })

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
    'https://ac.nowcoder.com/acm/contest/132048/A',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'nowcoder')
  }

  assertProblemIdentity('https://ac.nowcoder.com/acm/contest/132048/A', {
    platform: 'nowcoder',
    platformProblemId: 'contest-132048-A',
    canonicalUrl: 'https://ac.nowcoder.com/acm/contest/132048/A',
    contestId: '132048',
    problemIndex: 'A',
    confidence: 'url',
  })

  const invalidUrls = [
    'https://www.nowcoder.com',
    'https://ac.nowcoder.com',
    'https://ac.nowcoder.com/acm/contest/132048/status',
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
    'https://vjudge.net/contest/132048#problem/A',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'vjudge')
  }

  assertProblemIdentity('https://vjudge.net/problem/POJ-1000', {
    platform: 'vjudge',
    platformProblemId: 'POJ-1000',
    canonicalUrl: 'https://vjudge.net/problem/POJ-1000',
    sourcePlatform: 'POJ',
    sourceProblemId: '1000',
    confidence: 'url',
  })

  assertProblemIdentity('https://vjudge.net/contest/132048#problem/A', {
    platform: 'vjudge',
    platformProblemId: 'contest-132048-A',
    canonicalUrl: 'https://vjudge.net/contest/132048#problem/A',
    contestId: '132048',
    problemIndex: 'A',
    confidence: 'url',
  })

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
    'https://pintia.cn/problem-sets/123/exam-problems/456',
    'https://pintia.cn/problem-sets/123/problems/type/7?problemId=456',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'pta')
  }

  assertProblemIdentity('https://pintia.cn/problem-sets/123/problems/type/7?problemId=456', {
    platform: 'pta',
    platformProblemId: '123-456',
    canonicalUrl: 'https://pintia.cn/problem-sets/123/exam/problems/type/7?problemSetProblemId=456',
    contestId: '123',
    problemIndex: '456',
    confidence: 'url',
  })

  const invalidUrls = [
    'https://pintia.cn',
    'https://pintia.cn/problem-sets/123',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('Luogu URL parsing', () => {
  const validUrls = [
    'https://www.luogu.com.cn/problem/P1001',
    'https://www.luogu.com.cn/problem/B2005',
    'https://www.luogu.com.cn/problem/CF1A',
    'https://luogu.com.cn/problem/AT_abc214_a?contestId=123',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'luogu')
  }

  assertProblemIdentity('https://www.luogu.com.cn/problem/CF1A', {
    platform: 'luogu',
    platformProblemId: 'CF1A',
    canonicalUrl: 'https://www.luogu.com.cn/problem/CF1A',
    confidence: 'url',
  })

  const invalidUrls = [
    'https://www.luogu.com.cn',
    'https://www.luogu.com.cn/record/list',
    'https://www.luogu.com.cn/problem/list',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

test('LeetCode CN URL parsing', () => {
  const validUrls = [
    'https://leetcode.cn/problems/two-sum/',
    'https://www.leetcode.cn/problems/add-two-numbers',
  ]

  for (const url of validUrls) {
    const identity = parseUrl(url)
    assert.ok(identity, `Should parse valid URL: ${url}`)
    assert.strictEqual(identity!.platform, 'leetcode-cn')
  }

  assertProblemIdentity('https://leetcode.cn/problems/two-sum/', {
    platform: 'leetcode-cn',
    platformProblemId: 'two-sum',
    canonicalUrl: 'https://leetcode.cn/problems/two-sum/',
    confidence: 'url',
  })

  const invalidUrls = [
    'https://leetcode.cn',
    'https://leetcode.cn/problems',
    'https://leetcode.cn/problems/two-sum/submissions/',
    'https://leetcode.com/problems/two-sum/',
  ]

  for (const url of invalidUrls) {
    const identity = parseUrl(url)
    assert.strictEqual(identity, null, `Should not parse invalid URL: ${url}`)
  }
})

// 2. Custom adapter registration tests
test('Custom adapter registration', () => {
  const hduAdapter: ProblemParserAdapter = {
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
      } catch { /* ignore invalid HDU URLs in this test adapter */ }
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
})

test('Custom site config matching via parseUrl', () => {
  // 1. Mock the fetcher to return a custom site (e.g. hdu)
  setEnabledSitesFetcher(() => [
    {
      id: 'hdu',
      name: 'HDU OJ',
      domains: ['acm.hdu.edu.cn'],
      homeUrl: 'https://acm.hdu.edu.cn',
      enabled: true,
      problemUrlPatterns: ['/showproblem.php?pid={id}'],
    }
  ])

  // 2. Parse a valid URL
  const validUrl = 'https://acm.hdu.edu.cn/showproblem.php?pid=1000'
  const identity = parseUrl(validUrl)
  assert.ok(identity, 'Should parse matching URL via site config patterns')
  assert.strictEqual(identity!.platform, 'hdu')
  assert.strictEqual(identity!.platformProblemId, '1000')

  // 3. Disable the site and verify it is not matched anymore
  setEnabledSitesFetcher(() => [
    {
      id: 'hdu',
      name: 'HDU OJ',
      domains: ['acm.hdu.edu.cn'],
      homeUrl: 'https://acm.hdu.edu.cn',
      enabled: false,
      problemUrlPatterns: ['/showproblem.php?pid={id}'],
    }
  ])

  const disabledIdentity = parseUrl(validUrl)
  assert.strictEqual(disabledIdentity, null, 'Disabled custom site should not match')

  // Reset fetcher
  setEnabledSitesFetcher(() => [])
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
