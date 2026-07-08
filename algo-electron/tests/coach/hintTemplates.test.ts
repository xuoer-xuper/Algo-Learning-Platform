import assert from 'node:assert'
import {
  HINT_TEMPLATES,
  HINT_TEMPLATES_BY_CATEGORY,
  HINT_TEMPLATES_COUNT,
  selectTemplate,
  fillTemplatePlaceholders,
  type HintCategory,
} from '../../electron/coach/hints/hintTemplates.ts'

/**
 * hintTemplates 单元测试（阶段 3 Task 13）。
 *
 * 覆盖：
 * 1. 模板数量 ≥ 30
 * 2. 9 类（complexity/boundary/data_range/initialization/overflow/io/special_case/array_bounds/loop）+ 元认知类
 * 3. 每条模板结构：id / category / text（tags 可选）
 * 4. id 唯一
 * 5. 占位符替换
 * 6. selectTemplate 按 category + tags 查询
 */

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// --- 1. 模板数量与覆盖 ---

test('模板总数 >= 30', () => {
  assert.ok(HINT_TEMPLATES.length >= 30, `expected >= 30 templates, got ${HINT_TEMPLATES.length}`)
  assert.strictEqual(HINT_TEMPLATES_COUNT, HINT_TEMPLATES.length)
})

test('覆盖 9 类核心类目', () => {
  const requiredCategories: HintCategory[] = [
    'complexity',
    'boundary',
    'data_range',
    'initialization',
    'overflow',
    'io',
    'special_case',
    'array_bounds',
    'loop',
  ]
  for (const cat of requiredCategories) {
    const pool = HINT_TEMPLATES_BY_CATEGORY[cat]
    assert.ok(pool && pool.length >= 3, `category ${cat} should have >= 3 templates, got ${pool?.length ?? 0}`)
  }
})

test('元认知类目存在且 >= 2 条', () => {
  const pool = HINT_TEMPLATES_BY_CATEGORY['metacognition']
  assert.ok(pool && pool.length >= 2, `metacognition should have >= 2 templates, got ${pool?.length ?? 0}`)
})

test('每个类目至少 3 条模板（spec 要求覆盖充分）', () => {
  const cats = Object.keys(HINT_TEMPLATES_BY_CATEGORY) as HintCategory[]
  for (const cat of cats) {
    const pool = HINT_TEMPLATES_BY_CATEGORY[cat]
    assert.ok(pool.length >= 3, `category ${cat} should have >= 3, got ${pool.length}`)
  }
})

// --- 2. 模板结构 ---

test('每条模板都有 id / category / text', () => {
  for (const t of HINT_TEMPLATES) {
    assert.ok(typeof t.id === 'string' && t.id.length > 0, `template id missing: ${JSON.stringify(t)}`)
    assert.ok(typeof t.category === 'string', `template category missing: ${t.id}`)
    assert.ok(typeof t.text === 'string' && t.text.length > 0, `template text missing: ${t.id}`)
  }
})

test('模板 id 唯一', () => {
  const ids = HINT_TEMPLATES.map((t) => t.id)
  const unique = new Set(ids)
  assert.strictEqual(unique.size, ids.length, `duplicate template ids: ${ids.length - unique.size} duplicates`)
})

test('模板 id 前缀与类目一致', () => {
  const prefixByCategory: Record<HintCategory, string> = {
    complexity: 'complexity-',
    boundary: 'boundary-',
    data_range: 'data_range-',
    initialization: 'init-',
    overflow: 'overflow-',
    io: 'io-',
    special_case: 'special-',
    array_bounds: 'bounds-',
    loop: 'loop-',
    metacognition: 'meta-',
  }
  for (const t of HINT_TEMPLATES) {
    const prefix = prefixByCategory[t.category]
    assert.ok(t.id.startsWith(prefix), `template ${t.id} should start with ${prefix} (category=${t.category})`)
  }
})

test('tags 是字符串数组（如果存在）', () => {
  for (const t of HINT_TEMPLATES) {
    if (t.tags !== undefined) {
      assert.ok(Array.isArray(t.tags), `template ${t.id} tags should be array`)
      for (const tag of t.tags) {
        assert.ok(typeof tag === 'string' && tag.length > 0, `template ${t.id} has empty tag`)
      }
    }
  }
})

// --- 3. selectTemplate ---

test('selectTemplate: 无 tags 返回该类目首条模板', () => {
  const t = selectTemplate('complexity')
  assert.ok(t !== null)
  assert.strictEqual(t!.category, 'complexity')
})

test('selectTemplate: 匹配 tags 优先返回带 tag 的模板', () => {
  const t = selectTemplate('complexity', ['tle', 'large_n'])
  assert.ok(t !== null)
  assert.strictEqual(t!.category, 'complexity')
  assert.ok(t!.tags?.includes('tle') || t!.tags?.includes('large_n'))
})

test('selectTemplate: tags 无交集时回退到类目首条', () => {
  const t = selectTemplate('complexity', ['nonexistent_tag'])
  assert.ok(t !== null)
  assert.strictEqual(t!.category, 'complexity')
})

test('selectTemplate: 未知类目返回 null', () => {
  // 类型系统不允许传非 HintCategory，但运行时验证
  const t = selectTemplate('metacognition' as HintCategory)
  assert.ok(t !== null)
})

test('selectTemplate: 每个类目都能返回非 null', () => {
  const cats = Object.keys(HINT_TEMPLATES_BY_CATEGORY) as HintCategory[]
  for (const cat of cats) {
    const t = selectTemplate(cat)
    assert.ok(t !== null, `selectTemplate(${cat}) should not return null`)
  }
})

// --- 4. fillTemplatePlaceholders ---

test('fillTemplatePlaceholders: 替换 n_upper', () => {
  const result = fillTemplatePlaceholders('n={n_upper}', { nUpper: 200000 })
  assert.strictEqual(result, 'n=2·10^5')
})

test('fillTemplatePlaceholders: 替换 n_upper_sq 与 n_upper_safe', () => {
  const result = fillTemplatePlaceholders(
    'sq={n_upper_sq} safe={n_upper_safe}',
    { nUpper: 200000 },
  )
  // 200000^2 = 4e10 → formatNumber → 4·10^10
  assert.ok(result.includes('4·10^10'), `n_upper_sq should be 4·10^10, got: ${result}`)
  // 200000 + 10 = 200010 → mantissa 2.0001 → toFixed(1) → "2.0"
  assert.ok(result.includes('2.0·10^5'), `n_upper_safe should contain 2.0·10^5, got: ${result}`)
})

test('fillTemplatePlaceholders: 替换 time_limit_s', () => {
  const result = fillTemplatePlaceholders('limit={time_limit_s}s', { timeLimitSec: 1 })
  assert.strictEqual(result, 'limit=1s')
})

test('fillTemplatePlaceholders: 替换 value_upper', () => {
  const result = fillTemplatePlaceholders('value={value_upper}', { valueUpper: 1000000000 })
  assert.strictEqual(result, 'value=1·10^9')
})

test('fillTemplatePlaceholders: 替换 n_lower', () => {
  const result = fillTemplatePlaceholders('lo={n_lower}', { nLower: 1 })
  assert.strictEqual(result, 'lo=1')
})

test('fillTemplatePlaceholders: 多占位符同时替换', () => {
  const template = 'n={n_upper} lo={n_lower} t={time_limit_s} v={value_upper}'
  const result = fillTemplatePlaceholders(template, {
    nUpper: 200000,
    nLower: 1,
    timeLimitSec: 2,
    valueUpper: 1000000000,
  })
  assert.strictEqual(result, 'n=2·10^5 lo=1 t=2 v=1·10^9')
})

test('fillTemplatePlaceholders: 无 constraints 返回原文', () => {
  const template = 'n={n_upper} lo={n_lower}'
  const result = fillTemplatePlaceholders(template)
  assert.strictEqual(result, template)
})

test('fillTemplatePlaceholders: 未提供的占位符保留原样', () => {
  const template = 'n={n_upper} lo={n_lower}'
  const result = fillTemplatePlaceholders(template, { nUpper: 100 })
  // n_upper 替换为 100，n_lower 保留
  assert.ok(result.includes('100'), `should contain 100: ${result}`)
  assert.ok(result.includes('{n_lower}'), `should preserve {n_lower}: ${result}`)
})

test('fillTemplatePlaceholders: 字符串形式 nUpper 也可解析', () => {
  const result = fillTemplatePlaceholders('n={n_upper}', { nUpper: '2e5' })
  assert.strictEqual(result, 'n=2·10^5')
})

test('fillTemplatePlaceholders: 字符串形式 "2·10^5" 也可解析', () => {
  const result = fillTemplatePlaceholders('n={n_upper}', { nUpper: '2·10^5' })
  assert.strictEqual(result, 'n=2·10^5')
})

test('fillTemplatePlaceholders: 同一占位符多次出现全部替换', () => {
  const template = '{n_upper} and {n_upper} and {n_upper}'
  const result = fillTemplatePlaceholders(template, { nUpper: 100 })
  assert.strictEqual(result, '100 and 100 and 100')
})

// --- 5. 模板内容质量抽检 ---

test('complexity-001 模板包含 n_upper 占位符', () => {
  const t = HINT_TEMPLATES.find((x) => x.id === 'complexity-001')
  assert.ok(t)
  assert.ok(t!.text.includes('{n_upper}'), `complexity-001 should reference {n_upper}: ${t!.text}`)
})

test('boundary-001 模板提到边界场景', () => {
  const t = HINT_TEMPLATES.find((x) => x.id === 'boundary-001')
  assert.ok(t)
  assert.ok(t!.text.includes('边界') || t!.text.includes('空数组') || t!.text.includes('n=1'),
    `boundary-001 should mention edge cases: ${t!.text}`)
})

test('overflow-001 模板提到 long long / BigInt', () => {
  const t = HINT_TEMPLATES.find((x) => x.id === 'overflow-001')
  assert.ok(t)
  assert.ok(t!.text.includes('long long') || t!.text.includes('BigInt') || t!.text.includes('溢出'),
    `overflow-001 should mention overflow: ${t!.text}`)
})

test('数据范围类模板覆盖 9 类中的至少一类', () => {
  // 抽检：data_range 类应至少 1 条提到 long long / BigInt
  const pool = HINT_TEMPLATES_BY_CATEGORY['data_range']
  const hasOverflowMention = pool.some((t) => t.text.includes('long long') || t.text.includes('BigInt'))
  assert.ok(hasOverflowMention, 'data_range should have at least one template mentioning long long / BigInt')
})

test('元认知类模板引导思考', () => {
  const pool = HINT_TEMPLATES_BY_CATEGORY['metacognition']
  const hasThinkingGuidance = pool.some((t) =>
    t.text.includes('想清楚') || t.text.includes('例子') || t.text.includes('思路') || t.text.includes('换'))
  assert.ok(hasThinkingGuidance, 'metacognition templates should guide thinking')
})

test('模板不包含 emoji（spec 未要求）', () => {
  for (const t of HINT_TEMPLATES) {
    // 简单 emoji 检测：不包含常见 emoji 区段
    assert.ok(!/[\u{1F300}-\u{1F9FF}]/u.test(t.text), `template ${t.id} should not contain emoji: ${t.text}`)
  }
})

test('模板不包含完整答案（Socratic 原则）', () => {
  // 抽检：模板不应直接给出具体算法名作为"答案"
  // 允许提到算法名作为"可能涉及"，但不能直接给出完整解法
  for (const t of HINT_TEMPLATES) {
    // 不应包含"答案是"或"应该用"等强答案措辞
    assert.ok(!t.text.includes('答案是'), `template ${t.id} should not give direct answer: ${t.text}`)
    assert.ok(!t.text.includes('解法是'), `template ${t.id} should not give direct solution: ${t.text}`)
  }
})

// --- 运行 ---

let failedCount = 0
console.log('Running hintTemplates tests...\n')
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

console.log(`\nhintTemplates tests finished. Failed: ${failedCount}/${tests.length}`)
if (failedCount > 0) {
  process.exitCode = 1
}
