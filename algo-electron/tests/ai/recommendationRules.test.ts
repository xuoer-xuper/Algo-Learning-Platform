import assert from 'node:assert'
import { test } from 'vitest'
import {
  buildReviewReason,
  buildWeaknessEvidence,
  determineReviewPriority,
  estimateReviewMinutes,
  normalizePlanDays,
  scoreReviewCandidate,
  scoreTagWeakness,
} from '../../electron/ai/recommendations/rules.ts'
import { parseTagsJson } from '../../electron/ai/recommendations/tagParsing.ts'
import type { TagAggregate, TagWeakness } from '../../electron/ai/recommendations/types.ts'

test('parses and normalizes tag json safely', () => {
  assert.deepStrictEqual(parseTagsJson('["dp", " graph ", 3, ""]'), ['dp', 'graph'])
  assert.deepStrictEqual(parseTagsJson('{"tag":"dp"}'), [])
  assert.deepStrictEqual(parseTagsJson('not-json'), [])
  assert.deepStrictEqual(parseTagsJson(null), [])
})

test('scores review candidates with capped local factors', () => {
  assert.strictEqual(scoreReviewCandidate(1, 0, 0), 8)
  assert.strictEqual(scoreReviewCandidate(10, 100, 10), 80)
  assert.strictEqual(buildReviewReason(3, 8, 2), '已错误 3 次，8 天未复习，访问 2 次仍未通过，建议复习')
})

test('scores weakness and formats evidence', () => {
  const stats: TagAggregate = {
    total: 4,
    solved: 1,
    attempted: 2,
    wrong_submissions: 10,
    total_duration_seconds: 600,
  }
  assert.strictEqual(scoreTagWeakness(25, 10, 600), 49)
  assert.strictEqual(buildWeaknessEvidence(stats, 25), '4 题，AC 1 题（25%），错误提交 10 次，累计停留 10 分钟')
})

test('normalizes review plan priority and duration', () => {
  const weaknessTags: TagWeakness[] = [{
    tag: 'dp',
    total: 3,
    solved: 0,
    attempted: 2,
    ac_rate: 0,
    wrong_submissions: 6,
    total_duration_seconds: 900,
    weakness_score: 70,
    evidence: 'test',
  }]

  assert.strictEqual(determineReviewPriority(10, weaknessTags, ['dp']), 1)
  assert.strictEqual(determineReviewPriority(40, [], []), 2)
  assert.strictEqual(determineReviewPriority(10, [], []), 3)
  assert.strictEqual(estimateReviewMinutes(2, 5), 45)
  assert.strictEqual(normalizePlanDays(-1), 7)
  assert.strictEqual(normalizePlanDays(14), 14)
})

/*
 * 归一函数的前置条件得自己守，不能指望渠道 schema。
 *
 * 渠道那侧（`ai:getReviewPlan`）已经是 `int({ min: 1, max: 3650 })`，但
 * `getReviewPlan` 还有默认参数这条非渠道入口，将来也可能被主进程内部调用。
 * 原实现只判 `Number.isFinite(x) && x >= 1`，于是 1.5 原样穿过去，变成
 * `slice(0, 4.5)`、标题 "1.5 天复习计划"，以及写进 INTEGER 列的一个小数。
 */
test('normalizePlanDays 拒非整数与无界值', () => {
  assert.strictEqual(normalizePlanDays(1.5), 7, '小数不是"稍微不对"，是无意义')
  assert.strictEqual(normalizePlanDays(0), 7)
  assert.strictEqual(normalizePlanDays(Number.NaN), 7)
  assert.strictEqual(normalizePlanDays(Number.POSITIVE_INFINITY), 7)
  // 上限对齐渠道的 3650：maxItems = planDays * 3，无界天数就是无界 slice。
  assert.strictEqual(normalizePlanDays(3650), 3650)
  assert.strictEqual(normalizePlanDays(1e9), 3650)
  assert.strictEqual(normalizePlanDays(1), 1, '下界本身是合法输入')
})
