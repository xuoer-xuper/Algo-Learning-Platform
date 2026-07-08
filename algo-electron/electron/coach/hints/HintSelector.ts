import type { CoachEventType } from '../types'
import {
  type HintCategory,
  type HintTemplate,
  HINT_TEMPLATES_BY_CATEGORY,
  fillTemplatePlaceholders,
} from './hintTemplates'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'

/**
 * HintSelector：verdict → 提示类目映射 + 模板挑选（阶段 3 Task 14）。
 *
 * 设计要点：
 * - 不依赖算法标签（Demo 默认无 LLM，不解析算法标签）
 * - verdict → 类目映射：
 *   - WA → 边界 / 特判 / 输入输出（轮流）
 *   - TLE → 复杂度（+ ConstraintParser 联动数值对照）
 *   - RE → 越界 / 初始化
 *   - MLE → 复杂度（内存）
 *   - CE → 输入输出（语法错误近似）
 *   - idle_too_long → 元认知
 *   - first_ac → 元认知（庆祝语）
 * - 当 ConstraintParser 解析出 constraints 时，优先选 targeted 模板：
 *   - TLE + n=2e5 → complexity 类带 large_n tag
 *   - WA + value>=1e9 → overflow 类
 *
 * 选择策略：轮询（round-robin）避免每次都返回同一条。
 */

/** verdict 归一化（处理大小写、变体） */
function normalizeVerdict(verdict: string | undefined): string {
  if (!verdict) return 'UNKNOWN'
  return verdict.toUpperCase()
}

/**
 * verdict → 候选类目列表（按优先级排序）。
 *
 * 多个候选类目用于轮询：同一 verdict 多次触发时换一个类目，
 * 避免用户反复看到同一句话。
 */
export function verdictToCategories(verdict: string, eventType?: CoachEventType): HintCategory[] {
  const v = normalizeVerdict(verdict)
  // idle_too_long 优先级最高（卡壳专用元认知类）
  if (eventType === 'idle_too_long' || eventType === 'long_session') {
    return ['metacognition']
  }
  if (eventType === 'first_ac') {
    return ['metacognition']
  }
  if (eventType === 'complexity_warning') {
    return ['complexity']
  }
  if (eventType === 'boundary_suspected') {
    return ['boundary', 'overflow']
  }

  switch (v) {
    case 'WA':
      // WA 的可能原因排序：边界 > 特判 > 输入输出
      return ['boundary', 'special_case', 'io']
    case 'TLE':
    case 'MLE':
      return ['complexity']
    case 'RE':
      // RE 可能是越界或未初始化
      return ['array_bounds', 'initialization']
    case 'CE':
      // 编译错误：近似 IO 类（语法/格式）
      return ['io']
    case 'PE':
      return ['io']
    default:
      // 未知 verdict 退化到边界类（最常见错误源）
      return ['boundary']
  }
}

/**
 * 根据 constraints 选择 targeted 标签。
 * - TLE + n 上限大 → 加 large_n / nested_loop tag
 * - WA + value 上限 >= 1e9 → 切到 overflow 类
 * - RE → 无 constraints 联动
 */
function deriveTagsForVerdict(
  verdict: string,
  constraints: ProblemConstraints | null,
): string[] {
  const tags: string[] = []
  const v = normalizeVerdict(verdict)
  if (v === 'WA' && constraints) {
    const valueUpper = constraints.valueUpper
    if (valueUpper !== null && valueUpper >= 1e9) {
      tags.push('overflow', 'large_value')
    }
  }
  if (v === 'TLE' && constraints) {
    const nUpper = constraints.nUpper
    if (nUpper !== null && nUpper >= 1e5) {
      tags.push('large_n', 'nested_loop')
    }
  }
  return tags
}

/**
 * 当 constraints 暗示应改用更 targeted 的类目时，覆盖默认类目。
 * - WA + value>=1e9 → 切到 overflow
 * - TLE + n>=1e5 → 保持 complexity 但加 large_n tag
 */
function overrideCategoryForConstraints(
  category: HintCategory,
  verdict: string,
  constraints: ProblemConstraints | null,
): HintCategory | null {
  if (!constraints) return null
  const v = normalizeVerdict(verdict)
  if (v === 'WA' && category === 'boundary') {
    const valueUpper = constraints.valueUpper
    if (valueUpper !== null && valueUpper >= 1e9) {
      return 'overflow'
    }
  }
  return null
}

export interface HintSelectorOptions {
  /** 是否启用轮询（默认 true）。测试时可关闭以获得稳定结果 */
  enableRoundRobin?: boolean
}

export interface SelectHintInput {
  verdict?: string
  eventType?: CoachEventType
  constraints?: ProblemConstraints | null
  /** 当前 Socratic Ladder 等级（影响是否启用 constraints 联动；L3+ 才用 targeted） */
  level?: number
}

export interface SelectedHint {
  templateId: string
  category: HintCategory
  text: string
  tags: string[]
}

export class HintSelector {
  /** 每个类目的轮询游标 */
  private readonly cursorByCategory = new Map<HintCategory, number>()
  private readonly enableRoundRobin: boolean

  constructor(options: HintSelectorOptions = {}) {
    this.enableRoundRobin = options.enableRoundRobin ?? true
  }

  /**
   * 选择一条提示。
   * - 优先用 constraints 联动选 targeted 类目 + tag
   * - 否则按 verdict 默认类目
   * - 多候选类目时轮询
   */
  select(input: SelectHintInput): SelectedHint | null {
    const verdict = input.verdict
    const eventType = input.eventType
    const constraints = input.constraints ?? null
    const level = input.level ?? 1
    // L3+ 才使用 constraints 联动（L1/L2 是元认知层，不需要数值细节）
    const useConstraints = level >= 3 && constraints !== null

    let categories = verdictToCategories(verdict ?? '', eventType)
    if (categories.length === 0) return null

    // constraints 覆盖：WA + value>=1e9 → 切到 overflow
    if (useConstraints) {
      const override = overrideCategoryForConstraints(categories[0], verdict ?? '', constraints)
      if (override) {
        categories = [override]
      }
    }

    const category = categories[0]
    const tags = useConstraints ? deriveTagsForVerdict(verdict ?? '', constraints) : []

    const template = this.pickTemplate(category, tags)
    if (!template) return null

    // 填充占位符（需要 constraints）
    const text = useConstraints && constraints
      ? fillTemplatePlaceholders(template.text, {
          nUpper: constraints.nUpper ?? undefined,
          nLower: constraints.nLower ?? undefined,
          timeLimitSec: constraints.timeLimitSec ?? undefined,
          valueUpper: constraints.valueUpper ?? undefined,
        })
      : template.text

    return {
      templateId: template.id,
      category: template.category,
      text,
      tags: template.tags ?? [],
    }
  }

  /** 直接按类目选模板（HintLadder 在 L3/L4 阶段会调用） */
  selectByCategory(category: HintCategory, constraints?: ProblemConstraints | null): SelectedHint | null {
    const template = this.pickTemplate(category, [])
    if (!template) return null
    const text = constraints
      ? fillTemplatePlaceholders(template.text, {
          nUpper: constraints.nUpper ?? undefined,
          nLower: constraints.nLower ?? undefined,
          timeLimitSec: constraints.timeLimitSec ?? undefined,
          valueUpper: constraints.valueUpper ?? undefined,
        })
      : template.text
    return {
      templateId: template.id,
      category: template.category,
      text,
      tags: template.tags ?? [],
    }
  }

  /**
   * 派生靶向事件类型。
   * 当原始事件（multiple_wrong / same_error）的 verdict + constraints 满足特定条件时，
   * 返回应派生的更精准事件类型：
   * - TLE + n>=1e5 → complexity_warning
   * - WA + value>=1e9 → boundary_suspected
   * - 否则返回 null（继续用原事件类型）
   */
  deriveEventType(input: {
    originalEventType: CoachEventType
    verdict?: string
    constraints?: ProblemConstraints | null
  }): CoachEventType | null {
    const constraints = input.constraints ?? null
    if (!constraints) return null
    const v = normalizeVerdict(input.verdict)

    // TLE + n 大 → complexity_warning
    if (v === 'TLE' && constraints.nUpper !== null && constraints.nUpper >= 1e5) {
      return 'complexity_warning'
    }
    // WA + value 大 → boundary_suspected（其实是溢出嫌疑，但归到 boundary 类目）
    if (v === 'WA' && constraints.valueUpper !== null && constraints.valueUpper >= 1e9) {
      return 'boundary_suspected'
    }
    return null
  }

  /** 重置轮询游标（测试用） */
  resetCursorForTest(): void {
    this.cursorByCategory.clear()
  }

  // --- 内部 ---

  private pickTemplate(category: HintCategory, tags: string[]): HintTemplate | null {
    const pool = HINT_TEMPLATES_BY_CATEGORY[category]
    if (!pool || pool.length === 0) return null

    if (tags.length > 0) {
      const tagged = pool.filter((t) => t.tags?.some((tag) => tags.includes(tag)))
      if (tagged.length > 0) {
        return this.pickFromPool(category, tagged)
      }
    }
    return this.pickFromPool(category, pool)
  }

  private pickFromPool(category: HintCategory, pool: readonly HintTemplate[]): HintTemplate {
    if (!this.enableRoundRobin || pool.length === 1) {
      return pool[0]
    }
    const idx = this.cursorByCategory.get(category) ?? 0
    const next = (idx + 1) % pool.length
    this.cursorByCategory.set(category, next)
    return pool[idx]
  }
}

/**
 * 静态函数版（无状态场景使用，如规则 build() 直接调用）。
 * 不带轮询，按 tags 优先匹配。
 */
export function pickHintForEvent(
  verdict: string,
  eventType: CoachEventType | undefined,
  constraints: ProblemConstraints | null,
  level: number,
): SelectedHint | null {
  const selector = new HintSelector({ enableRoundRobin: false })
  return selector.select({ verdict, eventType, constraints, level })
}
