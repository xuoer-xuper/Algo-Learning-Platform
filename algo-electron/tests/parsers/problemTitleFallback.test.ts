import assert from 'node:assert'
import { createProblemTitleFallbackScript } from '../../electron/parsers/problemTitleFallback.ts'

const codeforcesScript = createProblemTitleFallbackScript('https://codeforces.com/contest/1/problem/A')
assert.ok(codeforcesScript, 'Codeforces problem pages should get a DOM title fallback')
assert.ok(codeforcesScript.includes('.problem-statement .title'), 'Codeforces fallback should read the statement title')
assert.ok(codeforcesScript.includes('.problemindexholder .title'), 'Codeforces fallback should use the old stable problem holder title')
assert.ok(codeforcesScript.includes('div.title'), 'Codeforces fallback should keep the old generic title selector')

const acwingScript = createProblemTitleFallbackScript('https://www.acwing.com/problem/content/1001/')
assert.ok(acwingScript, 'AcWing problem pages should get a DOM title fallback')
assert.ok(acwingScript.includes('.problem-content-title'), 'AcWing fallback should read the content title')

assert.strictEqual(
  createProblemTitleFallbackScript('https://leetcode.cn/problems/two-sum/'),
  null,
  'Sites with reliable browser tab titles should not use DOM fallback',
)
