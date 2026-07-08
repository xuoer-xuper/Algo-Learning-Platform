import assert from 'node:assert'
import {
  detectContestFromUrl,
  isContestActive,
  ContestGuard,
  type ContestInfo,
} from '../../electron/coach/ContestGuard.ts'

/**
 * ContestGuard 单元测试。
 *
 * 覆盖：
 * 1. URL 规则识别（CF /contest/{id}、/gym/{id}、洛谷 /contest/{id}、非比赛页）
 * 2. 时间窗校验（isContestActive：有窗/无窗/窗外）
 * 3. 比赛进入/离开生命周期（onContestEnter/onContestEnd 回调）
 * 4. 同一比赛不重复触发 enter
 * 5. 切换比赛：先 end 旧比赛再 enter 新比赛
 * 6. isContestMode() hard gate
 * 7. forceEnd 用于应用退出
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// --- 1. URL 规则识别 ---

test('detectContestFromUrl: CF /contest/{id} 识别', () => {
  const result = detectContestFromUrl('https://codeforces.com/contest/1234')
  assert.ok(result)
  assert.strictEqual(result!.platform, 'codeforces')
  assert.strictEqual(result!.contestId, '1234')
  assert.strictEqual(result!.contestUrl, 'https://codeforces.com/contest/1234')
})

test('detectContestFromUrl: CF /contest/{id}/problem/{X} 识别', () => {
  const result = detectContestFromUrl('https://codeforces.com/contest/1234/problem/A')
  assert.ok(result)
  assert.strictEqual(result!.platform, 'codeforces')
  assert.strictEqual(result!.contestId, '1234')
})

test('detectContestFromUrl: CF /contest/{id}/status 识别', () => {
  const result = detectContestFromUrl('https://codeforces.com/contest/1234/status')
  assert.ok(result)
  assert.strictEqual(result!.contestId, '1234')
})

test('detectContestFromUrl: CF /gym/{id} 识别', () => {
  const result = detectContestFromUrl('https://codeforces.com/gym/5678')
  assert.ok(result)
  assert.strictEqual(result!.platform, 'codeforces')
  assert.strictEqual(result!.contestId, '5678')
  assert.strictEqual(result!.contestUrl, 'https://codeforces.com/gym/5678')
})

test('detectContestFromUrl: CF /problemset/problem/{id}/{X} 不是比赛页', () => {
  const result = detectContestFromUrl('https://codeforces.com/problemset/problem/1234/A')
  assert.strictEqual(result, null, 'problemset page should not be detected as contest')
})

test('detectContestFromUrl: CF 首页不是比赛页', () => {
  const result = detectContestFromUrl('https://codeforces.com/')
  assert.strictEqual(result, null)
})

test('detectContestFromUrl: CF www 子域名也识别', () => {
  const result = detectContestFromUrl('https://www.codeforces.com/contest/999')
  assert.ok(result)
  assert.strictEqual(result!.contestId, '999')
})

test('detectContestFromUrl: 洛谷 /contest/{id} 识别', () => {
  const result = detectContestFromUrl('https://www.luogu.com.cn/contest/12345')
  assert.ok(result)
  assert.strictEqual(result!.platform, 'luogu')
  assert.strictEqual(result!.contestId, '12345')
  assert.strictEqual(result!.contestUrl, 'https://www.luogu.com.cn/contest/12345')
})

test('detectContestFromUrl: 洛谷 /contest/{id}/... 识别', () => {
  const result = detectContestFromUrl('https://www.luogu.com.cn/contest/12345/problems')
  assert.ok(result)
  assert.strictEqual(result!.contestId, '12345')
})

test('detectContestFromUrl: 洛谷非 contest 页不识别', () => {
  const result = detectContestFromUrl('https://www.luogu.com.cn/problem/P1001')
  assert.strictEqual(result, null)
})

test('detectContestFromUrl: 空 URL 返回 null', () => {
  assert.strictEqual(detectContestFromUrl(''), null)
  assert.strictEqual(detectContestFromUrl(null as unknown as string), null)
})

test('detectContestFromUrl: 无效 URL 返回 null', () => {
  assert.strictEqual(detectContestFromUrl('not-a-url'), null)
})

test('detectContestFromUrl: 其他平台（非 CF/洛谷）默认不识别', () => {
  assert.strictEqual(detectContestFromUrl('https://vjudge.net/contest/12345'), null)
})

test('detectContestFromUrl: matchSite 注入可扩展其他平台', () => {
  const result = detectContestFromUrl('https://vjudge.net/contest/12345', {
    matchSite: () => 'vjudge',
  })
  assert.ok(result)
  assert.strictEqual(result!.platform, 'vjudge')
  assert.strictEqual(result!.contestId, '12345')
})

test('detectContestFromUrl: matchSite 返回 null 时不识别', () => {
  const result = detectContestFromUrl('https://example.com/contest/12345', {
    matchSite: () => null,
  })
  assert.strictEqual(result, null)
})

// --- 2. 时间窗校验 ---

test('isContestActive: 无时间窗时保守视为进行中', () => {
  assert.strictEqual(isContestActive(1700000000000), true, 'no window → active (conservative)')
  assert.strictEqual(isContestActive(1700000000000, undefined, undefined), true)
})

test('isContestActive: now 在窗内 → 进行中', () => {
  const start = 1700000000000
  const end = 1700003600000 // +1h
  assert.strictEqual(isContestActive(1700001000000, start, end), true)
  assert.strictEqual(isContestActive(start, start, end), true, 'boundary: now=start → active')
  assert.strictEqual(isContestActive(end, start, end), true, 'boundary: now=end → active')
})

test('isContestActive: now 在窗外 → 不进行中', () => {
  const start = 1700000000000
  const end = 1700003600000
  assert.strictEqual(isContestActive(1699999999000, start, end), false, 'before start → not active')
  assert.strictEqual(isContestActive(1700003601000, start, end), false, 'after end → not active')
})

test('isContestActive: 仅 start 无 end → 保守视为进行中', () => {
  assert.strictEqual(isContestActive(1700000000000, 1700000000000, undefined), true)
})

// --- 3. 比赛进入/离开生命周期 ---

test('进入比赛页触发 onContestEnter，isContestMode=true', () => {
  let enterCount = 0
  let endCount = 0
  let enteredInfo: ContestInfo | null = null

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: (info) => {
      enterCount++
      enteredInfo = info
    },
    onContestEnd: () => {
      endCount++
    },
  })

  assert.strictEqual(guard.isContestMode(), false, 'initial: not in contest')

  guard.handleUrlChange('https://codeforces.com/contest/1234')

  assert.strictEqual(enterCount, 1, 'should fire onContestEnter once')
  assert.strictEqual(endCount, 0)
  assert.strictEqual(guard.isContestMode(), true, 'should be in contest mode')
  assert.ok(enteredInfo)
  assert.strictEqual(enteredInfo!.platform, 'codeforces')
  assert.strictEqual(enteredInfo!.contestId, '1234')
  assert.strictEqual(enteredInfo!.contestUrl, 'https://codeforces.com/contest/1234')
  assert.strictEqual(enteredInfo!.enteredAt, 1700000000000)
})

test('离开比赛页触发 onContestEnd，isContestMode=false', () => {
  let endCount = 0
  let endDuration = 0

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnd: (_info, durationSec) => {
      endCount++
      endDuration = durationSec
    },
  })

  guard.handleUrlChange('https://codeforces.com/contest/1234')
  assert.strictEqual(guard.isContestMode(), true)

  // 离开比赛页
  guard.handleUrlChange('https://codeforces.com/problemset/problem/1234/A')
  assert.strictEqual(endCount, 1, 'should fire onContestEnd')
  assert.strictEqual(guard.isContestMode(), false, 'should exit contest mode')
  assert.strictEqual(endDuration, 0, 'duration should be 0 (same timestamp)')
})

test('比赛持续时间内 onContestEnd 报告正确 duration', () => {
  let endDuration = -1
  let currentTime = 1700000000000

  const guard = new ContestGuard({
    now: () => currentTime,
    onContestEnd: (_info, durationSec) => {
      endDuration = durationSec
    },
  })

  guard.handleUrlChange('https://codeforces.com/contest/1234')
  currentTime += 3600 * 1000 // +1h
  guard.handleUrlChange('https://codeforces.com/')

  assert.strictEqual(endDuration, 3600, 'duration should be 3600 seconds')
})

// --- 4. 同一比赛不重复触发 ---

test('同一比赛页 URL 变化不重复触发 enter', () => {
  let enterCount = 0

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: () => { enterCount++ },
    onContestEnd: () => {},
  })

  guard.handleUrlChange('https://codeforces.com/contest/1234')
  assert.strictEqual(enterCount, 1)

  // 同比赛内不同子页（如看题目/提交列表）
  guard.handleUrlChange('https://codeforces.com/contest/1234/problem/A')
  assert.strictEqual(enterCount, 1, 'same contest, different sub-page → no re-enter')

  guard.handleUrlChange('https://codeforces.com/contest/1234/status')
  assert.strictEqual(enterCount, 1)

  guard.handleUrlChange('https://codeforces.com/contest/1234/my')
  assert.strictEqual(enterCount, 1)
})

// --- 5. 切换比赛 ---

test('切换比赛：先 end 旧比赛再 enter 新比赛', () => {
  const events: string[] = []

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: (info) => { events.push(`enter:${info.contestId}`) },
    onContestEnd: (info) => { events.push(`end:${info.contestId}`) },
  })

  guard.handleUrlChange('https://codeforces.com/contest/111')
  guard.handleUrlChange('https://codeforces.com/contest/222')

  assert.deepStrictEqual(events, ['enter:111', 'end:111', 'enter:222'])
  assert.strictEqual(guard.isContestMode(), true)
  assert.strictEqual(guard.getCurrentContest()?.contestId, '222')
})

test('跨平台切换比赛', () => {
  const events: string[] = []

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: (info) => { events.push(`enter:${info.platform}:${info.contestId}`) },
    onContestEnd: (info) => { events.push(`end:${info.platform}:${info.contestId}`) },
  })

  guard.handleUrlChange('https://codeforces.com/contest/111')
  guard.handleUrlChange('https://www.luogu.com.cn/contest/222')

  assert.deepStrictEqual(events, [
    'enter:codeforces:111',
    'end:codeforces:111',
    'enter:luogu:222',
  ])
})

// --- 6. isContestMode hard gate ---

test('isContestMode 是 hard gate：进入前 false，进入后 true，离开后 false', () => {
  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: () => {},
    onContestEnd: () => {},
  })

  assert.strictEqual(guard.isContestMode(), false)
  guard.handleUrlChange('https://codeforces.com/contest/1234')
  assert.strictEqual(guard.isContestMode(), true)
  guard.handleUrlChange('https://codeforces.com/')
  assert.strictEqual(guard.isContestMode(), false)
})

test('isContestMode 无配置开关可绕过', () => {
  // ContestGuard 构造函数没有 enabled/disabled 选项
  // isContestMode() 仅由 current !== null 决定，无 bypass
  const guard = new ContestGuard()
  assert.strictEqual(guard.isContestMode(), false)
  guard.handleUrlChange('https://codeforces.com/contest/1234')
  assert.strictEqual(guard.isContestMode(), true)
})

// --- 7. forceEnd ---

test('forceEnd: 应用退出时强制结束当前比赛', () => {
  let endCount = 0
  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnd: () => { endCount++ },
  })

  guard.handleUrlChange('https://codeforces.com/contest/1234')
  assert.strictEqual(guard.isContestMode(), true)

  guard.forceEnd()
  assert.strictEqual(endCount, 1, 'forceEnd should fire onContestEnd')
  assert.strictEqual(guard.isContestMode(), false)

  // forceEnd 无比赛时不应报错
  guard.forceEnd()
  assert.strictEqual(endCount, 1, 'forceEnd with no contest should be no-op')
})

// --- getCurrentContest ---

test('getCurrentContest: 返回比赛信息副本', () => {
  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: () => {},
    onContestEnd: () => {},
  })

  assert.strictEqual(guard.getCurrentContest(), null)

  guard.handleUrlChange('https://codeforces.com/contest/1234')
  const contest = guard.getCurrentContest()
  assert.ok(contest)
  assert.strictEqual(contest!.contestId, '1234')

  // 副本不可影响内部状态
  contest!.contestId = 'modified'
  assert.strictEqual(guard.getCurrentContest()?.contestId, '1234', 'should be a copy')
})

// --- 非比赛 URL 不触发 ---

test('非比赛 URL 不触发 enter/end', () => {
  let enterCount = 0
  let endCount = 0

  const guard = new ContestGuard({
    now: () => 1700000000000,
    onContestEnter: () => { enterCount++ },
    onContestEnd: () => { endCount++ },
  })

  guard.handleUrlChange('https://codeforces.com/problemset/problem/1234/A')
  guard.handleUrlChange('https://leetcode.cn/problems/two-sum/')
  guard.handleUrlChange('https://www.luogu.com.cn/problem/P1001')
  guard.handleUrlChange('about:blank')

  assert.strictEqual(enterCount, 0)
  assert.strictEqual(endCount, 0)
  assert.strictEqual(guard.isContestMode(), false)
})

// --- 运行 ---

let failedCount = 0
console.log('Running ContestGuard tests...\n')
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

console.log(`\nContestGuard tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
