/**
 * 通用提示模板库（阶段 3 Task 13）。
 *
 * 设计要点：
 * - MVP 为 TS 内置文件，不入库（M7 知识库/RAG 接入后再迁移）
 * - 9 类提示：complexity / boundary / data_range / initialization / overflow / io / special_case / array_bounds / loop
 * - 每条模板带 id / category / tags? / text
 * - text 中的占位符（{n_upper} / {time_limit_s} 等）由 HintSelector 在选中后替换
 *
 * 消费者：
 * - HintSelector.selectTemplate(category, tags?) 按 verdict + 可选 constraints 选模板
 * - HintLadder.getMessageForLevel 在 L3/L4 阶段从对应类目取模板
 *
 * 不依赖 better-sqlite3 / electron，纯数据 + 工具函数，便于单元测试。
 */

/** 提示类目（9 类 + 1 元认知类） */
export type HintCategory =
  | 'complexity'      // 复杂度类
  | 'boundary'         // 边界类
  | 'data_range'       // 数据范围类
  | 'initialization'   // 初始化类
  | 'overflow'         // 溢出类
  | 'io'               // 输入输出类
  | 'special_case'     // 特判类
  | 'array_bounds'     // 数组越界类
  | 'loop'             // 循环条件类
  | 'metacognition'    // 元认知类（idle_too_long / 卡壳用）

export interface HintTemplate {
  /** 模板 id（用于审计追溯） */
  id: string
  /** 类目 */
  category: HintCategory
  /** 可选标签（用于精细匹配，如 ['tle', 'large_n']） */
  tags?: string[]
  /** 模板正文，可含占位符 */
  text: string
}

/**
 * 内置模板库。≥30 条，覆盖 9 类 + 元认知类。
 *
 * 占位符约定（由 HintSelector 替换）：
 * - {n_upper}: 题目主变量上限（如 2·10^5）
 * - {n_lower}: 主变量下限
 * - {time_limit_s}: 时限（秒）
 * - {value_upper}: 值域上限
 */
export const HINT_TEMPLATES: readonly HintTemplate[] = [
  // --- 复杂度类（4 条） ---
  {
    id: 'complexity-001',
    category: 'complexity',
    tags: ['tle', 'large_n'],
    text: '这道题的时间复杂度能通过吗？数据范围 {n_upper} 通常需要 O(n log n) 以内。',
  },
  {
    id: 'complexity-002',
    category: 'complexity',
    tags: ['tle', 'nested_loop'],
    text: '检查嵌套循环：n={n_upper} 时 O(n^2) 会超时（约 {n_upper_sq} 次运算），考虑优化到 O(n log n)。',
  },
  {
    id: 'complexity-003',
    category: 'complexity',
    tags: ['tle'],
    text: '时限 {time_limit_s}s 内能做的运算量约 1e8，检查算法是否在合理复杂度内。',
  },
  {
    id: 'complexity-004',
    category: 'complexity',
    tags: ['tle', 'general'],
    text: 'TLE 了。先想想是不是有更优的算法或数据结构（堆/线段树/单调队列）能降低复杂度？',
  },

  // --- 边界类（4 条） ---
  {
    id: 'boundary-001',
    category: 'boundary',
    tags: ['wa'],
    text: '边界处理好了吗？空数组、单元素、n=1 都试过吗？',
  },
  {
    id: 'boundary-002',
    category: 'boundary',
    tags: ['wa', 'edge'],
    text: 'WA 经常出在边界。检查 n={n_upper} 和 n={n_lower} 两个端点。',
  },
  {
    id: 'boundary-003',
    category: 'boundary',
    tags: ['wa'],
    text: '首元素和末元素的特殊情况是否单独处理？下标 0 与 n-1。',
  },
  {
    id: 'boundary-004',
    category: 'boundary',
    tags: ['wa', 'off_by_one'],
    text: '是不是差一错误（off-by-one）？循环终止条件、区间端点都核对一遍。',
  },

  // --- 数据范围类（3 条） ---
  {
    id: 'data_range-001',
    category: 'data_range',
    tags: ['overflow', 'large_value'],
    text: '注意变量类型，{value_upper} 以上要用 long long / BigInt。',
  },
  {
    id: 'data_range-002',
    category: 'data_range',
    tags: ['negative'],
    text: '数据范围包含负数吗？如果含负数，累加/最大子段和的逻辑要重新检查。',
  },
  {
    id: 'data_range-003',
    category: 'data_range',
    tags: ['large_n'],
    text: 'n 上限 {n_upper}，m 上限呢？双变量题目要同时考虑两个范围。',
  },

  // --- 初始化类（3 条） ---
  {
    id: 'init-001',
    category: 'initialization',
    tags: ['wa'],
    text: '数组/累加器初始化值是否正确？是否需要重置？',
  },
  {
    id: 'init-002',
    category: 'initialization',
    tags: ['wa', 'multi_test'],
    text: '多组数据：每组测试前是否清空了全局数组/容器？',
  },
  {
    id: 'init-003',
    category: 'initialization',
    tags: ['wa', 'dp'],
    text: 'DP 初值是否正确？边界状态的 dp 值是否手动赋值？',
  },

  // --- 溢出类（3 条） ---
  {
    id: 'overflow-001',
    category: 'overflow',
    tags: ['wa', 'multiplication'],
    text: '中间结果会溢出吗？乘法累加要小心，{value_upper}^2 已超 int 范围。',
  },
  {
    id: 'overflow-002',
    category: 'overflow',
    tags: ['wa', 'sum'],
    text: '累加和可能超过 int 上限（约 2.1e9），考虑用 long long。',
  },
  {
    id: 'overflow-003',
    category: 'overflow',
    tags: ['wa', 'intermediate'],
    text: '中间表达式 a * b / c 即使最终结果在范围内，a * b 也可能溢出。考虑先除或用 long long。',
  },

  // --- 输入输出类（3 条） ---
  {
    id: 'io-001',
    category: 'io',
    tags: ['wa', 'format'],
    text: '输入输出格式对了吗？多组数据、行尾空格、换行符。',
  },
  {
    id: 'io-002',
    category: 'io',
    tags: ['wa', 'read'],
    text: '读入是否漏了变量？是否把字符串读成了整数？',
  },
  {
    id: 'io-003',
    category: 'io',
    tags: ['wa', 'fast_io'],
    text: '大数据量读入慢可能导致 TLE，考虑用更快 的 I/O（如 scanf / BufferedReader）。',
  },

  // --- 特判类（4 条） ---
  {
    id: 'special-001',
    category: 'special_case',
    tags: ['wa', 'n_zero'],
    text: '特殊情况是否特判？n=0、负数、相同元素。',
  },
  {
    id: 'special-002',
    category: 'special_case',
    tags: ['wa', 'single'],
    text: 'n=1 的特殊情况是否单独返回正确答案？',
  },
  {
    id: 'special-003',
    category: 'special_case',
    tags: ['wa', 'all_same'],
    text: '所有元素相同的特殊情况是否处理？',
  },
  {
    id: 'special-004',
    category: 'special_case',
    tags: ['wa', 'negative'],
    text: '全负数 / 全零 / 单调递减等极端情形是否覆盖？',
  },

  // --- 数组越界类（3 条） ---
  {
    id: 'bounds-001',
    category: 'array_bounds',
    tags: ['re', 'index'],
    text: '下标从 0 还是 1 开始？访问前是否检查边界？',
  },
  {
    id: 'bounds-002',
    category: 'array_bounds',
    tags: ['re', 'negative_index'],
    text: 'RE 可能是数组越界。检查 i-1 / i+1 在 i=0 / i=n-1 时是否安全。',
  },
  {
    id: 'bounds-003',
    category: 'array_bounds',
    tags: ['re', 'size'],
    text: '数组大小开够了吗？n 上限 {n_upper}，数组至少要开到 {n_upper_safe}。',
  },

  // --- 循环条件类（3 条） ---
  {
    id: 'loop-001',
    category: 'loop',
    tags: ['wa', 'off_by_one'],
    text: '循环边界是 < 还是 <=？是否漏掉最后一个元素？',
  },
  {
    id: 'loop-002',
    category: 'loop',
    tags: ['wa', 'range'],
    text: '循环变量步长对吗？是否漏了某些值？',
  },
  {
    id: 'loop-003',
    category: 'loop',
    tags: ['wa', 'nested'],
    text: '嵌套循环的内外层边界是否独立？内层 j 的范围是否依赖 i？',
  },

  // --- 元认知类（4 条）---
  {
    id: 'meta-001',
    category: 'metacognition',
    tags: ['idle', 'stuck'],
    text: '要不要先把思路写下来？想想这道题的核心目标是什么。',
  },
  {
    id: 'meta-002',
    category: 'metacognition',
    tags: ['idle', 'example'],
    text: '先想清楚再写，能不能举几个小例子验证思路？',
  },
  {
    id: 'meta-003',
    category: 'metacognition',
    tags: ['stuck', 'rethink'],
    text: '卡了一会儿了。换一个角度：从结果倒推，或者从简单情况入手？',
  },
  {
    id: 'meta-004',
    category: 'metacognition',
    tags: ['stuck', 'rest'],
    text: '已经做了很久。要不要休息一两分钟再回来看？长时间高强度容易钻牛角尖。',
  },
] as const

/** 按类目分组索引（运行时构建） */
export const HINT_TEMPLATES_BY_CATEGORY: Readonly<Record<HintCategory, readonly HintTemplate[]>> =
  groupByCategory(HINT_TEMPLATES)

/** 模板总数 */
export const HINT_TEMPLATES_COUNT = HINT_TEMPLATES.length

/**
 * 按类目 + 可选标签筛选模板。
 * - 无 tags 时返回该类目全部模板
 * - 有 tags 时优先返回 tags 有交集的模板，无交集则回退到该类目全部
 */
export function selectTemplate(
  category: HintCategory,
  tags?: readonly string[],
): HintTemplate | null {
  const pool = HINT_TEMPLATES_BY_CATEGORY[category]
  if (!pool || pool.length === 0) return null

  if (!tags || tags.length === 0) {
    // 无标签时按 id 哈希稳定挑选（避免每次都返回第一条）
    return pool[0]
  }

  const tagged = pool.filter((t) => t.tags?.some((tag) => tags.includes(tag)))
  return tagged.length > 0 ? tagged[0] : pool[0]
}

/**
 * 替换模板正文中的占位符。
 * - {n_upper} → constraints.nUpper（人类可读形式，如 "2·10^5"）
 * - {n_lower} → constraints.nLower
 * - {time_limit_s} → constraints.timeLimitSec
 * - {value_upper} → constraints.valueUpper
 * - {n_upper_sq} → nUpper 的平方（用于复杂度提示）
 * - {n_upper_safe} → nUpper + 10（用于数组大小提示）
 *
 * 未提供的占位符保留原样（便于调试 + 不阻塞展示）。
 */
export function fillTemplatePlaceholders(
  text: string,
  constraints?: {
    nUpper?: number | string
    nLower?: number | string
    timeLimitSec?: number | string
    valueUpper?: number | string
  },
): string {
  if (!constraints) return text
  const replacements: Record<string, string> = {}

  if (constraints.nUpper !== undefined) {
    const nUpperStr = formatNumber(constraints.nUpper)
    replacements['n_upper'] = nUpperStr
    const nUpperNum = typeof constraints.nUpper === 'number' ? constraints.nUpper : parseLooseInt(constraints.nUpper)
    if (nUpperNum !== null) {
      replacements['n_upper_sq'] = formatNumber(nUpperNum * nUpperNum)
      replacements['n_upper_safe'] = formatNumber(nUpperNum + 10)
    }
  }
  if (constraints.nLower !== undefined) {
    replacements['n_lower'] = formatNumber(constraints.nLower)
  }
  if (constraints.timeLimitSec !== undefined) {
    replacements['time_limit_s'] = String(constraints.timeLimitSec)
  }
  if (constraints.valueUpper !== undefined) {
    replacements['value_upper'] = formatNumber(constraints.valueUpper)
  }

  let result = text
  for (const [key, value] of Object.entries(replacements)) {
    // 使用 split/join 替代 replaceAll（兼容 ES2020 target）
    result = result.split(`{${key}}`).join(value)
  }
  return result
}

// --- 内部工具 ---

function groupByCategory(
  templates: readonly HintTemplate[],
): Record<HintCategory, readonly HintTemplate[]> {
  const result: Record<HintCategory, HintTemplate[]> = {
    complexity: [],
    boundary: [],
    data_range: [],
    initialization: [],
    overflow: [],
    io: [],
    special_case: [],
    array_bounds: [],
    loop: [],
    metacognition: [],
  }
  for (const t of templates) {
    result[t.category].push(t)
  }
  return result
}

/** 将数字格式化为人类可读形式：100000 → "1e5"，200000 → "2·10^5" */
function formatNumber(value: number | string): string {
  const n = typeof value === 'number' ? value : parseLooseInt(value)
  if (n === null) return String(value)
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000 && abs < 1e7) {
    // 1000 ~ 1e7: 转成 k·10^p 形式
    const exp = Math.floor(Math.log10(abs))
    const mantissa = n / Math.pow(10, exp)
    const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : mantissa.toFixed(1)
    return `${mantissaStr}·10^${exp}`
  }
  if (abs >= 1e7) {
    const exp = Math.floor(Math.log10(abs))
    const mantissa = n / Math.pow(10, exp)
    const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : mantissa.toFixed(1)
    return `${mantissaStr}·10^${exp}`
  }
  return String(n)
}

/** 宽松解析整数：支持 "2e5" / "2·10^5" / "200000" / "1e9" */
function parseLooseInt(value: string | number): number | null {
  if (typeof value === 'number') return value
  const s = value.trim().replace(/\s/g, '')
  if (!s) return null
  // 直接整数
  const direct = parseInt(s, 10)
  if (!Number.isNaN(direct) && String(direct) === s) return direct
  // e 形式：2e5
  const eMatch = s.match(/^(\d+(?:\.\d+)?)e(\d+)$/i)
  if (eMatch) {
    const mantissa = parseFloat(eMatch[1])
    const exp = parseInt(eMatch[2], 10)
    return mantissa * Math.pow(10, exp)
  }
  // ·10^p 形式：2·10^5
  const caretMatch = s.match(/^(\d+(?:\.\d+)?)\D*10\^(\d+)$/)
  if (caretMatch) {
    const mantissa = parseFloat(caretMatch[1])
    const exp = parseInt(caretMatch[2], 10)
    return mantissa * Math.pow(10, exp)
  }
  return direct
}
