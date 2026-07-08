/**
 * ConstraintParser：本地题面约束解析（阶段 3 Task 17）。
 *
 * 设计目标：
 * - 零 LLM：纯正则 + DOM 文本抽取，无外部依赖
 * - 失败静默：解析失败时返回 null，调用方退化到通用提示
 * - 缓存：以 platform:problemKey 为键，内存缓存（避免重复注入）
 * - 站点扩展：复用现有 parsers/enabledSites 的站点识别
 *
 * 解析能力（按支持优先级）：
 * 1. 数据范围：`1 ≤ n ≤ 2·10^5` / `1 ≤ n ≤ 2e5` / `1 <= n <= 200000`
 * 2. 时间限制：`时间限制 1.00s` / `Time limit: 1 second` / `2 seconds`
 * 3. 多变量范围：`1 ≤ n, m ≤ 1e5`（取主变量 n）
 * 4. 值域：`1 ≤ a_i ≤ 1e9`
 *
 * 与 verdict 联动：
 * - TLE + nUpper>=1e5 → 强烈建议 O(n log n) 以内
 * - WA + valueUpper>=1e9 → 溢出嫌疑
 *
 * 不存储 Cookie / 源码 / 完整 HTML，只解析约束文本。
 */

/** 解析结果：题目约束（成功时部分字段非空） */
export interface ProblemConstraints {
  /** 平台标识（codeforces / luogu / ...） */
  platform: string
  /** 主变量名（通常是 n） */
  primaryVarName: string | null
  /** 主变量下限 */
  nLower: number | null
  /** 主变量上限 */
  nUpper: number | null
  /** 值域下限（如 a_i 下限） */
  valueLower: number | null
  /** 值域上限（如 a_i 上限） */
  valueUpper: number | null
  /** 时间限制（秒） */
  timeLimitSec: number | null
  /** 内存限制（MB） */
  memoryLimitMb: number | null
  /** 测试组数（多组数据提示） */
  testGroupCount: number | null
  /** 解析时间戳（ms） */
  parsedAt: number
  /** 解析来源（用于审计追溯） */
  source: 'regex' | 'fallback' | 'cache'
}

/** 解析失败时返回的标志 */
export const NO_CONSTRAINTS: null = null

export interface ConstraintParserOptions {
  /** 注入式 Date.now（测试用） */
  now?: () => number
  /** 是否启用缓存（默认 true） */
  enableCache?: boolean
}

/**
 * ConstraintParser 主类。
 *
 * 使用方式：
 * 1. parseConstraints(text, platform) - 解析纯文本（同步，纯函数）
 * 2. extractFromHtml(html, platform) - 从 HTML 抽取约束文本后解析
 * 3. getInjectionScript(platform) - 返回注入脚本字符串（供主进程 executeJavaScript 调用）
 * 4. parseFromInjectionResult(result, platform) - 处理注入脚本返回的文本
 */
export class ConstraintParser {
  private readonly now: () => number
  private readonly enableCache: boolean
  /** 内存缓存：key = `${platform}:${problemKey}` */
  private readonly cache = new Map<string, ProblemConstraints>()

  constructor(options: ConstraintParserOptions = {}) {
    this.now = options.now ?? Date.now
    this.enableCache = options.enableCache ?? true
  }

  /**
   * 解析约束文本（纯函数 + 静态方法版）。
   * 输入：从题面抽取的纯文本（可包含 HTML 残留）
   * 输出：解析结果或 null
   */
  parse(text: string, platform: string): ProblemConstraints | null {
    return parseConstraintsStatic(text, platform, this.now())
  }

  /**
   * 从 HTML 抽取约束并解析。
   * 1. 先按平台规则提取约束文本段
   * 2. 再用正则解析数值
   */
  extractFromHtml(html: string, platform: string): ProblemConstraints | null {
    const text = extractConstraintText(html, platform)
    if (!text) return null
    return this.parse(text, platform)
  }

  /**
   * 返回注入脚本字符串。
   * 主进程通过 `tabManager.executeScriptOnUrl(url, script)` 调用，
   * 脚本返回约束文本字符串（或 null）。
   *
   * 不同平台使用不同的 DOM 选择器：
   * - codeforces: .problem-statement 内的 .input-specification / .time-limit / .memory-limit
   * - luogu: .problem-content / .lg-content
   * - 默认：返回 body.innerText
   */
  getInjectionScript(platform: string): string {
    return getInjectionScriptForPlatform(platform)
  }

  /**
   * 处理注入脚本的返回结果。
   * 注入脚本返回字符串（约束文本）或 null。
   */
  parseFromInjectionResult(result: unknown, platform: string): ProblemConstraints | null {
    if (typeof result !== 'string' || !result) return null
    return this.parse(result, platform)
  }

  /**
   * 缓存接口：写入。
   * key = `${platform}:${problemKey}`
   */
  cacheSet(problemKey: string, constraints: ProblemConstraints): void {
    if (!this.enableCache) return
    const key = `${constraints.platform}:${problemKey}`
    this.cache.set(key, constraints)
  }

  /**
   * 缓存接口：读取。
   * 返回缓存或 null（未缓存或缓存禁用）。
   */
  cacheGet(platform: string, problemKey: string): ProblemConstraints | null {
    if (!this.enableCache) return null
    return this.cache.get(`${platform}:${problemKey}`) ?? null
  }

  /** 缓存接口：清空（测试用） */
  cacheClear(): void {
    this.cache.clear()
  }

  /**
   * 便捷方法：注入 + 解析 + 缓存（异步）。
   * 由 CoachOrchestrator 调用：传入执行器（tabManager.executeScriptOnUrl）。
   * 失败静默返回 null，不抛异常（不阻塞主流程）。
   */
  async fetchAndParse(input: {
    platform: string
    problemKey: string
    url: string
    executeScript: (url: string, code: string) => Promise<unknown>
  }): Promise<ProblemConstraints | null> {
    // 1. 查缓存
    const cached = this.cacheGet(input.platform, input.problemKey)
    if (cached) return { ...cached, source: 'cache' }

    // 2. 注入脚本
    let raw: unknown
    try {
      raw = await input.executeScript(input.url, this.getInjectionScript(input.platform))
    } catch {
      return null
    }
    if (raw == null) return null

    // 3. 解析
    const parsed = this.parseFromInjectionResult(raw, input.platform)
    if (!parsed) return null

    // 4. 缓存
    this.cacheSet(input.problemKey, parsed)
    return parsed
  }
}

// ===========================================================================
// 静态解析函数（不依赖实例，便于单元测试）
// ===========================================================================

/**
 * 静态解析：从纯文本中抽取约束。
 * 输入文本可包含换行/HTML 残留，函数会先归一化。
 *
 * 解析顺序（按优先级）：
 * 1. 时间限制（先于数据范围，因为时间限制格式更稳定）
 * 2. 内存限制
 * 3. 数据范围（主变量 n）
 * 4. 值域（a_i 等）
 */
export function parseConstraintsStatic(
  text: string,
  platform: string,
  now: number,
): ProblemConstraints | null {
  if (!text || typeof text !== 'string') return null

  // 归一化：转中文逗号、全角空格、NBSP
  const normalized = text
    .replace(/，/g, ',')
    .replace(/[\u00A0\u3000]/g, ' ')
    .replace(/·/g, '·') // 保留中点
    .trim()

  const result: ProblemConstraints = {
    platform,
    primaryVarName: null,
    nLower: null,
    nUpper: null,
    valueLower: null,
    valueUpper: null,
    timeLimitSec: null,
    memoryLimitMb: null,
    testGroupCount: null,
    parsedAt: now,
    source: 'regex',
  }

  // 1. 时间限制
  result.timeLimitSec = parseTimeLimit(normalized, platform)

  // 2. 内存限制
  result.memoryLimitMb = parseMemoryLimit(normalized, platform)

  // 3. 测试组数
  result.testGroupCount = parseTestGroupCount(normalized)

  // 4. 主变量数据范围
  const range = parsePrimaryRange(normalized)
  if (range) {
    result.primaryVarName = range.varName
    result.nLower = range.lower
    result.nUpper = range.upper
  }

  // 5. 值域
  const valueRange = parseValueRange(normalized)
  if (valueRange) {
    result.valueLower = valueRange.lower
    result.valueUpper = valueRange.upper
  }

  // 至少有一个字段解析成功才算成功
  const hasAny =
    result.timeLimitSec !== null ||
    result.memoryLimitMb !== null ||
    result.nUpper !== null ||
    result.valueUpper !== null
  return hasAny ? result : null
}

/**
 * 从 HTML 中抽取约束文本段。
 * 不同平台使用不同选择器：
 * - codeforces: .problem-statement 内的所有文本（包含 input specification / time limit / memory limit）
 * - luogu: .problem-content / .lg-content-card
 * - leetcode-cn: .question-content / .notranslate
 * - 默认: body.innerText
 */
export function extractConstraintText(html: string, platform: string): string | null {
  if (!html) return null

  // 简单 HTML → 文本（不引入 cheerio 等依赖）
  // 1. 移除 script/style
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  // 2. 块级标签 → 换行
  cleaned = cleaned.replace(/<\/(div|p|section|article|li|h\d|tr|td|th|br|ul|ol|table|pre|code)>/gi, '\n')
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')
  // 3. 移除所有剩余标签
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')
  // 4. 解码 HTML 实体
  cleaned = decodeHtmlEntities(cleaned)
  // 5. 归一化空白
  cleaned = cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  // 平台特定的段落筛选（保留约束相关段）
  const relevant = filterRelevantParagraphs(cleaned, platform)
  return relevant || null
}

/**
 * 返回注入脚本（字符串形式，主进程通过 executeJavaScript 调用）。
 * 脚本应在页面上下文中执行，返回约束文本字符串（或 null）。
 *
 * 设计要点：
 * - 优先使用平台特定的 DOM 选择器
 * - 退化到 body.innerText
 * - 异常捕获：失败返回 null，不抛错
 */
export function getInjectionScriptForPlatform(platform: string): string {
  // 注入脚本使用 IIFE 包装，避免污染全局
  const selectors = getPlatformSelectors(platform)
  return `(function() {
  try {
    var selectors = ${JSON.stringify(selectors)};
    var collected = '';
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        var text = (el.innerText || el.textContent || '').trim();
        if (text) {
          collected += text + '\\n';
        }
      }
    }
    // 补充：抓取 time-limit / memory-limit 标记（CF 特有 class）
    var limitEls = document.querySelectorAll('.time-limit, .memory-limit, .property-title');
    for (var k = 0; k < limitEls.length; k++) {
      collected += (limitEls[k].innerText || '') + '\\n';
    }
    if (!collected) {
      // 退化到 body 文本（截断到 8000 字符，避免过大）
      var bodyText = document.body ? (document.body.innerText || '').slice(0, 8000) : '';
      return bodyText || null;
    }
    return collected.slice(0, 12000);
  } catch (e) {
    return null;
  }
})();`
}

// ===========================================================================
// 内部解析函数
// ===========================================================================

/** 平台特定的 DOM 选择器列表 */
function getPlatformSelectors(platform: string): string[] {
  switch (platform.toLowerCase()) {
    case 'codeforces':
      return [
        '.problem-statement',
        '.input-specification',
        '.time-limit',
        '.memory-limit',
        '.section-title',
      ]
    case 'luogu':
      return [
        '.problem-content',
        '.lg-content-card',
        '.field',
        '.problem-statement',
      ]
    case 'leetcode-cn':
    case 'leetcode':
      return ['.question-content', '.notranslate', '[data-track-load="description_content"]']
    case 'acwing':
      return ['.problem-content', '.problem-desc']
    case 'nowcoder':
      return ['.question-content', '.question-desc', '.nk-question']
    case 'pta':
    case 'pintia':
      return ['.problem-content', '.question-content']
    default:
      return ['.problem-statement', '.problem-content', '.question-content']
  }
}

/**
 * 解析时间限制。
 * 支持格式：
 * - "时间限制 1.00s" / "时间限制: 1.00 s"
 * - "Time limit: 1 second" / "Time limit: 2 seconds"
 * - "time limit per test: 1 second" (CF 英文版)
 * - "1.00s" / "2s" (单字段)
 */
function parseTimeLimit(text: string, _platform: string): number | null {
  // 中文：时间限制 1.00s
  const cnMatch = text.match(/时间限制[:：\s]*([0-9]+(?:\.[0-9]+)?)\s*s?/i)
  if (cnMatch) {
    const v = parseFloat(cnMatch[1])
    if (!Number.isNaN(v)) return v
  }
  // 英文：Time limit ... 1 second / 2 seconds
  const enMatch = text.match(/time\s*limit[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(?:second|seconds|s)\b/i)
  if (enMatch) {
    const v = parseFloat(enMatch[1])
    if (!Number.isNaN(v)) return v
  }
  // 洛谷：1.00s 单独一行
  const loneMatch = text.match(/(?:^|\n)\s*([0-9]+(?:\.[0-9]+)?)\s*s(?:\s|$)/i)
  if (loneMatch) {
    const v = parseFloat(loneMatch[1])
    if (!Number.isNaN(v) && v > 0 && v < 100) return v // 合理范围
  }
  return null
}

/**
 * 解析内存限制。
 * 支持格式：
 * - "内存限制 256MB" / "内存限制: 256 MB"
 * - "Memory limit: 256 megabytes" / "memory limit: 256 mb"
 */
function parseMemoryLimit(text: string, _platform: string): number | null {
  const cnMatch = text.match(/内存限制[:：\s]*([0-9]+)\s*mb?/i)
  if (cnMatch) {
    const v = parseInt(cnMatch[1], 10)
    if (!Number.isNaN(v)) return v
  }
  const enMatch = text.match(/memory\s*limit[^0-9]*([0-9]+)\s*(?:megabytes|mb|megabyte)\b/i)
  if (enMatch) {
    const v = parseInt(enMatch[1], 10)
    if (!Number.isNaN(v)) return v
  }
  return null
}

/**
 * 解析测试组数。
 * 支持格式：
 * - "本题包含多组数据" / "多组测试数据"
 * - "The first line contains an integer t (1 ≤ t ≤ 1e4) — the number of test cases"
 */
function parseTestGroupCount(text: string): number | null {
  // 显式多组数据
  if (/多组数据|多组测试|multiple\s+test\s+cases|t\s+test\s+cases/i.test(text)) {
    // 尝试解析 t 的上限
    const tMatch = text.match(/\bt\s*[([<][^)\]>]*\ble\s*([0-9]+(?:e[0-9]+)?)[^)\]>]*[)\]>]/i)
    if (tMatch) {
      const v = parseLooseInt(tMatch[1])
      if (v !== null) return v
    }
    // 无法确定具体数值，返回 0 表示"有多组但数量未知"
    return 0
  }
  return null
}

/**
 * 解析主变量数据范围。
 * 支持格式：
 * - "1 ≤ n ≤ 2·10^5" / "1 ≤ n ≤ 2e5"
 * - "1 <= n <= 200000" / "1 <= n <= 2*10^5"
 * - "n 的范围是 [1, 1e5]"
 * - "1 ≤ n, m ≤ 1e5"（取第一个变量 n）
 *
 * 返回主变量名 + 下限 + 上限。
 */
function parsePrimaryRange(text: string): {
  varName: string
  lower: number | null
  upper: number | null
} | null {
  // 1. 标准 "1 ≤ n ≤ 2·10^5" 形式
  // 支持 ≤ / <= / ≤（全角）
  const patterns = [
    // "1 ≤ n ≤ 2·10^5" / "1 ≤ n ≤ 2e5" / "1 <= n <= 200000"
    /([0-9]+(?:\.[0-9]+)?)\s*(?:≤|<=)\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(?:≤|<=)\s*([0-9eE·.*^+\-()]+?)(?=[\s,，。.\n]|$)/g,
    // "1 ≤ n, m ≤ 1e5"（取第一个变量）
    /([0-9]+(?:\.[0-9]+)?)\s*(?:≤|<=)\s*([a-zA-Z][a-zA-Z0-9_]*)\s*,\s*[a-zA-Z][a-zA-Z0-9_]*\s*(?:≤|<=)\s*([0-9eE·.*^+\-()]+?)(?=[\s,，。.\n]|$)/g,
  ]

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern))
    if (matches.length === 0) continue
    // 选第一个有效的（主变量通常是第一个出现的 n）
    for (const m of matches) {
      const lowerStr = m[1]
      const varName = m[2]
      const upperStr = m[3]
      const lower = parseLooseInt(lowerStr)
      const upper = parseLooseInt(upperStr)
      if (lower !== null && upper !== null && upper > lower) {
        return { varName, lower, upper }
      }
    }
  }

  // 2. "n 的范围是 [1, 1e5]" / "1 <= n <= 1e5"（已在上面的 pattern 覆盖）

  // 3. CF 英文："The first line contains a single integer n (1 ≤ n ≤ 2·10^5)"
  // 上面的 pattern 已经能匹配括号内的形式

  return null
}

/**
 * 解析值域（a_i 等）。
 * 支持格式：
 * - "1 ≤ a_i ≤ 1e9" / "1 ≤ a_i ≤ 10^9"
 * - "1 <= a_i <= 1e9"
 */
function parseValueRange(text: string): { lower: number | null; upper: number | null } | null {
  // 值域变量通常带下标：a_i, a[j], arr[i], x_i, etc.
  const pattern = /([0-9]+(?:\.[0-9]+)?)\s*(?:≤|<=)\s*(?:a_|a\[|x_|x\[|arr|b_|b\[)[^\s]*(?:≤|<=)\s*([0-9eE·.*^+\-()]+?)(?=[\s,，。.\n]|$)/gi
  const matches = Array.from(text.matchAll(pattern))
  for (const m of matches) {
    const lower = parseLooseInt(m[1])
    const upper = parseLooseInt(m[2])
    if (lower !== null && upper !== null && upper > lower) {
      return { lower, upper }
    }
  }
  // 退化：任意 "1 ≤ X ≤ 1e9" 形式中 X 含下标
  const fallbackPattern = /([0-9]+(?:\.[0-9]+)?)\s*(?:≤|<=)\s*([a-zA-Z][a-zA-Z0-9_[\]]+)\s*(?:≤|<=)\s*([0-9eE·.*^+\-()]+?)(?=[\s,，。.\n]|$)/g
  const fallbackMatches = Array.from(text.matchAll(fallbackPattern))
  for (const m of fallbackMatches) {
    const varName = m[2]
    // 跳过主变量 n / m（已被 parsePrimaryRange 处理）
    if (varName === 'n' || varName === 'm' || varName === 't' || varName === 'k') continue
    const lower = parseLooseInt(m[1])
    const upper = parseLooseInt(m[3])
    if (lower !== null && upper !== null && upper > lower) {
      return { lower, upper }
    }
  }
  return null
}

/**
 * 宽松解析整数：支持
 * - "200000" / "100"
 * - "2e5" / "1e9"
 * - "2·10^5" / "2*10^5" / "2·10⁵"
 * - "10^9" / "10⁹"
 */
export function parseLooseInt(value: string): number | null {
  if (typeof value !== 'string') return null
  const s = value.trim().replace(/\s/g, '').replace(/[(),]/g, '')
  if (!s) return null

  // 直接整数
  const direct = parseInt(s, 10)
  if (!Number.isNaN(direct) && String(direct) === s) return direct

  // e 形式：2e5 / 1e9
  const eMatch = s.match(/^(\d+(?:\.\d+)?)e(\d+)$/i)
  if (eMatch) {
    const mantissa = parseFloat(eMatch[1])
    const exp = parseInt(eMatch[2], 10)
    return mantissa * Math.pow(10, exp)
  }

  // ·10^p / *10^p 形式
  const caretMatch = s.match(/^(\d+(?:\.\d+)?)\s*[·*\u00d7]\s*10\^(\d+)$/)
  if (caretMatch) {
    const mantissa = parseFloat(caretMatch[1])
    const exp = parseInt(caretMatch[2], 10)
    return mantissa * Math.pow(10, exp)
  }

  // 10^p 形式（无系数）
  const loneCaretMatch = s.match(/^10\^(\d+)$/)
  if (loneCaretMatch) {
    const exp = parseInt(loneCaretMatch[1], 10)
    return Math.pow(10, exp)
  }

  // 上标数字（Unicode）：10⁹
  const superscriptMatch = s.match(/^10([\u2070-\u2079]+)$/)
  if (superscriptMatch) {
    const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹'
    let exp = 0
    for (const ch of superscriptMatch[1]) {
      const idx = superscripts.indexOf(ch)
      if (idx < 0) return null
      exp = exp * 10 + idx
    }
    return Math.pow(10, exp)
  }

  // 复合形式：2*10^5 + 100 等（取第一个可解析部分）
  const complexMatch = s.match(/(\d+(?:\.\d+)?)\s*[·*\u00d7]?\s*10\^?(\d+)?/)
  if (complexMatch) {
    const mantissa = parseFloat(complexMatch[1])
    const expStr = complexMatch[2]
    if (expStr) {
      const exp = parseInt(expStr, 10)
      return mantissa * Math.pow(10, exp)
    }
    return mantissa
  }

  return Number.isNaN(direct) ? null : direct
}

/** 筛选与约束相关的段落（避免无关文本干扰解析） */
function filterRelevantParagraphs(text: string, _platform: string): string {
  if (!text) return ''
  const lines = text.split('\n')
  const keywords = [
    '限制', 'limit', '范围', 'range', '≤', '<=', 'data', 'constraint',
    'input', 'specification', '说明', '格式', 'n ', 'n=', 't ', 't=',
  ]
  const relevant = lines.filter((line) =>
    keywords.some((kw) => line.toLowerCase().includes(kw.toLowerCase())),
  )
  // 如果筛掉太多（< 总文本 30%），返回原文（避免漏掉关键约束）
  if (relevant.join('\n').length < text.length * 0.3) {
    return text
  }
  return relevant.join('\n')
}

/** 解码 HTML 实体（最小集合） */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&#8804;/g, '≤')
    .replace(/&#8805;/g, '≥')
    .replace(/&times;/g, '×')
    .replace(/&middot;/g, '·')
    .replace(/&#183;/g, '·')
}

// ===========================================================================
// verdict 与 constraints 联动分析
// ===========================================================================

export interface ConstraintVerdictAnalysis {
  /** 派生事件类型（如 complexity_warning / boundary_suspected） */
  derivedEventType: 'complexity_warning' | 'boundary_suspected' | null
  /** 是否需要溢出警告 */
  suggestOverflow: boolean
  /** 是否需要复杂度警告 */
  suggestComplexity: boolean
  /** 人类可读建议 */
  reason: string
}

/**
 * 分析 verdict 与 constraints 的联动关系。
 * - TLE + n>=1e5 → complexity_warning
 * - WA + value>=1e9 → boundary_suspected（溢出嫌疑）
 */
export function analyzeVerdictVsConstraints(
  verdict: string,
  constraints: ProblemConstraints | null,
): ConstraintVerdictAnalysis {
  const result: ConstraintVerdictAnalysis = {
    derivedEventType: null,
    suggestOverflow: false,
    suggestComplexity: false,
    reason: '',
  }
  if (!constraints) return result

  const v = verdict.toUpperCase()
  if (v === 'TLE' && constraints.nUpper !== null && constraints.nUpper >= 1e5) {
    result.derivedEventType = 'complexity_warning'
    result.suggestComplexity = true
    result.reason = `n 上限 ${formatNumber(constraints.nUpper)} 通常需要 O(n log n) 以内，检查嵌套循环`
  }
  if (v === 'WA' && constraints.valueUpper !== null && constraints.valueUpper >= 1e9) {
    result.derivedEventType = 'boundary_suspected'
    result.suggestOverflow = true
    result.reason = `值域上限 ${formatNumber(constraints.valueUpper)} 已超 int 范围，可能溢出`
  }
  return result
}

/** 将数字格式化为人类可读形式（与 hintTemplates.formatNumber 行为一致） */
function formatNumber(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const exp = Math.floor(Math.log10(abs))
    const mantissa = value / Math.pow(10, exp)
    const mantissaStr = Number.isInteger(mantissa) ? String(mantissa) : mantissa.toFixed(1)
    return `${mantissaStr}·10^${exp}`
  }
  return String(value)
}
