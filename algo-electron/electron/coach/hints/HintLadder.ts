import type { CoachEventType, CoachInterventionLevel } from '../types'
import type { ProblemConstraints } from '../problemFacts/ConstraintParser'
import { type HintCategory } from './hintTemplates'
import { HintSelector } from './HintSelector'

/**
 * HintLadder：Socratic Ladder 分级提示（阶段 3 Task 15）。
 *
 * 6 级设计（与 spec.md "Requirement: Socratic Ladder 分级提示" 对齐）：
 * - L0: 不提示（仅记录事件）
 * - L1: 轻提醒（"要不要看一个方向提示？"）
 * - L2: 元认知（"先想清楚状态能否被复用？举几个小例子试试？"）
 * - L3: 关键细节/边界（"注意下标从 0/1 开始时边界不同"——不涉及算法思想）
 * - L4: 策略（"维护区间累计信息，O(1) 查询"）
 * - L5: 概念/标签（"这题可能和前缀和有关"——仅当有标签，且升级前需二次确认）
 *
 * 设计原则：
 * - 概念/标签置于最高层（CP 中"想法即答案"，比实现细节更剧透）
 * - 用户每次点"再给一点"才升级，不跳级
 * - 升级有冷却（与阶段 2 RuleEngine 的防滥用联动，已有 2 分钟冷却）
 * - L5 升级需二次确认
 *
 * 使用方式：
 * 1. RuleEngine 在 handleEvent 后初始化 level（来自规则 build）
 * 2. 用户点"再给一点" → CoachOrchestrator.requestHintUpgrade →
 *    RuleEngine 检查冷却 → HintLadder.getMessageForLevel 拼装消息
 * 3. L5 升级时，HintLadder 返回 needsConfirmation=true，
 *    CoachOrchestrator 显示二次确认气泡，再次点击才真正升级
 *
 * 与 HintSelector 协作：
 * - L1/L2 用元认知类模板（HintSelector.selectByCategory('metacognition')）
 * - L3 用 verdict 推断的类目（boundary / array_bounds / io 等）
 * - L4 用策略类（complexity + 算法策略建议）
 * - L5 用算法标签类（仅当 problem_tags 已知）
 *
 * 不依赖 better-sqlite3 / electron，纯函数 + 类，便于单元测试。
 */

/** Ladder 等级类型（与 CoachInterventionLevel 一致） */
export type LadderLevel = CoachInterventionLevel

/** L5 二次确认状态 */
export type L5ConfirmationState = 'idle' | 'pending' | 'confirmed'

export interface HintLadderOptions {
  /** 注入式 HintSelector（可选；不传则内部创建一个无轮询的实例） */
  hintSelector?: HintSelector
  /** 是否启用 L5 二次确认（默认 true，Demo 必开） */
  enableL5Confirmation?: boolean
}

/** 某个等级的提示内容 */
export interface LadderHintContent {
  /** 当前等级 */
  level: LadderLevel
  /** 消息正文（用户可见） */
  message: string
  /** 关联标签（写入 CoachIntervention.related_tags） */
  tags: string[]
  /** 关联的模板 id（如有） */
  templateId?: string
  /** 关联的类目（如有） */
  category?: HintCategory
  /** 是否需要二次确认（仅 L5 升级前为 true） */
  needsConfirmation?: boolean
  /** 是否被拒绝升级（已到顶或需要冷却） */
  rejected?: boolean
  /** 拒绝原因（rejected=true 时填充） */
  rejectReason?: string
}

export interface GetMessageForLevelContext {
  /** 触发事件类型 */
  eventType: CoachEventType
  /** verdict（WA/TLE/RE 等） */
  verdict?: string
  /** 题目约束（来自 ConstraintParser） */
  constraints?: ProblemConstraints | null
  /** 题目标签（用于 L5；可为空） */
  problemTags?: string[]
  /** 题目 rating（用于难度自适应） */
  problemRating?: number | null
}

/** L0-L5 顶层描述（不展示给用户，仅用于审计） */
export const LADDER_LEVEL_DESCRIPTIONS: Record<LadderLevel, string> = {
  0: '不提示，仅记录',
  1: '轻提醒',
  2: '元认知',
  3: '关键细节/边界',
  4: '策略',
  5: '概念/标签',
}

export class HintLadder {
  private readonly hintSelector: HintSelector
  private readonly enableL5Confirmation: boolean
  /** 当前每个 eventType 的 L5 二次确认状态 */
  private readonly l5State = new Map<CoachEventType, L5ConfirmationState>()

  constructor(options: HintLadderOptions = {}) {
    this.hintSelector = options.hintSelector ?? new HintSelector({ enableRoundRobin: false })
    this.enableL5Confirmation = options.enableL5Confirmation ?? true
  }

  /**
   * 获取某个等级的提示内容。
   * 不修改内部状态，纯查询。
   *
   * @param level 目标等级
   * @param context 上下文（verdict / constraints / tags）
   */
  getMessageForLevel(level: LadderLevel, context: GetMessageForLevelContext): LadderHintContent {
    const tags: string[] = [`L${level}`, context.eventType]
    if (context.verdict) tags.push(context.verdict.toLowerCase())

    // L0: 不提示
    if (level === 0) {
      return {
        level: 0,
        message: '',
        tags,
        rejected: true,
        rejectReason: 'L0 不展示提示',
      }
    }

    // L1: 轻提醒
    if (level === 1) {
      return this.buildL1(context, tags)
    }
    // L2: 元认知
    if (level === 2) {
      return this.buildL2(context, tags)
    }
    // L3: 关键细节/边界
    if (level === 3) {
      return this.buildL3(context, tags)
    }
    // L4: 策略
    if (level === 4) {
      return this.buildL4(context, tags)
    }
    // L5: 概念/标签
    return this.buildL5(context, tags)
  }

  /**
   * 检查从 currentLevel 升级到 currentLevel+1 是否需要二次确认。
   * 仅 L4→L5 升级需要确认。
   */
  needsConfirmationForUpgrade(currentLevel: LadderLevel, eventType: CoachEventType): boolean {
    if (!this.enableL5Confirmation) return false
    if (currentLevel !== 4) return false
    const state = this.l5State.get(eventType) ?? 'idle'
    return state === 'idle'
  }

  /**
   * 标记 L5 升级已进入"待确认"状态。
   * CoachOrchestrator 在显示"该提示接近题解方向，确认查看？"气泡后调用。
   */
  markL5Pending(eventType: CoachEventType): void {
    this.l5State.set(eventType, 'pending')
  }

  /**
   * 标记 L5 升级已确认。
   * CoachOrchestrator 在用户二次点击"再给一点"后调用。
   */
  confirmL5(eventType: CoachEventType): void {
    this.l5State.set(eventType, 'confirmed')
  }

  /**
   * 重置某事件类型的 L5 确认状态（用户 dismiss 后调用）。
   */
  resetL5State(eventType: CoachEventType): void {
    this.l5State.delete(eventType)
  }

  /** 重置所有 L5 状态（测试用） */
  resetAllForTest(): void {
    this.l5State.clear()
  }

  /** 仅测试用：读取 L5 状态 */
  getL5StateForTest(eventType: CoachEventType): L5ConfirmationState {
    return this.l5State.get(eventType) ?? 'idle'
  }

  // --- 各等级构建 ---

  private buildL1(context: GetMessageForLevelContext, tags: string[]): LadderHintContent {
    // L1 轻提醒：提示用户"是否需要方向提示"
    const message = pickL1Message(context.eventType, context.verdict)
    return {
      level: 1,
      message,
      tags: [...tags, 'light'],
    }
  }

  private buildL2(context: GetMessageForLevelContext, tags: string[]): LadderHintContent {
    // L2 元认知：从 metacognition 类模板挑选
    const hint = this.hintSelector.selectByCategory('metacognition', context.constraints ?? null)
    if (hint) {
      return {
        level: 2,
        message: hint.text,
        tags: [...tags, ...hint.tags],
        templateId: hint.templateId,
        category: hint.category,
      }
    }
    // 退化到内置文案
    return {
      level: 2,
      message: 'L2：先想清楚这道题的状态能否被复用？举几个小例子试试？',
      tags: [...tags, 'metacognition'],
    }
  }

  private buildL3(context: GetMessageForLevelContext, tags: string[]): LadderHintContent {
    // L3 关键细节/边界：按 verdict 选类目（不涉及算法思想）
    const verdict = context.verdict
    const constraints = context.constraints ?? null
    const hint = this.hintSelector.select({
      verdict,
      eventType: context.eventType,
      constraints,
      level: 3,
    })
    if (hint) {
      return {
        level: 3,
        message: hint.text,
        tags: [...tags, ...hint.tags],
        templateId: hint.templateId,
        category: hint.category,
      }
    }
    // 退化
    return {
      level: 3,
      message: 'L3：注意边界条件与数据范围，是否漏了？',
      tags: [...tags, 'boundary'],
    }
  }

  private buildL4(context: GetMessageForLevelContext, tags: string[]): LadderHintContent {
    // L4 策略：基于 constraints 给出复杂度/数据结构策略建议
    const constraints = context.constraints ?? null
    const message = buildL4StrategyMessage(context.eventType, context.verdict, constraints)
    return {
      level: 4,
      message,
      tags: [...tags, 'strategy'],
    }
  }

  private buildL5(context: GetMessageForLevelContext, tags: string[]): LadderHintContent {
    // L5 概念/标签：仅当 problemTags 已知时给出，否则退化到元认知
    const problemTags = context.problemTags ?? []
    if (problemTags.length === 0) {
      // 无标签时退化到 L4 等级的策略提示（不再深入）
      const constraints = context.constraints ?? null
      const message = buildL4StrategyMessage(context.eventType, context.verdict, constraints)
      return {
        level: 5,
        message: `L5（无算法标签可用）：${message}`,
        tags: [...tags, 'no_tags', 'fallback'],
        rejected: false,
      }
    }

    // 有标签时给出概念性提示（不直接告诉答案，而是引导方向）
    const primaryTag = problemTags[0]
    const message = buildL5ConceptMessage(primaryTag, problemTags)
    return {
      level: 5,
      message,
      tags: [...tags, 'concept', ...problemTags],
    }
  }
}

// --- L1/L4/L5 消息构建（不依赖模板库，使用内置文案） ---

function pickL1Message(eventType: CoachEventType, verdict?: string): string {
  // L1 是轻提醒，引导用户主动决定是否继续升级
  if (eventType === 'idle_too_long' || eventType === 'long_session') {
    return 'L1：已经做了一会儿。要不要看一个方向提示？'
  }
  if (eventType === 'multiple_wrong') {
    return `L1：连续 ${verdict ?? '错误'} 了。要不要看一个方向提示？`
  }
  if (eventType === 'same_error') {
    return `L1：同样错误重复了。要不要换个角度看看？`
  }
  if (eventType === 'complexity_warning') {
    return 'L1：时间复杂度可能不够优。要不要看一个提示？'
  }
  if (eventType === 'boundary_suspected') {
    return 'L1：可能是边界或类型问题。要不要看一个提示？'
  }
  if (eventType === 'first_ac') {
    return 'L1：AC 了！干得漂亮。'
  }
  return 'L1：要不要看一个方向提示？'
}

function buildL4StrategyMessage(
  eventType: CoachEventType,
  verdict: string | undefined,
  constraints: ProblemConstraints | null,
): string {
  const v = (verdict ?? '').toUpperCase()

  // TLE 复杂度策略
  if (eventType === 'complexity_warning' || v === 'TLE') {
    if (constraints?.nUpper !== null && constraints && constraints.nUpper !== null && constraints.nUpper >= 1e5) {
      const nUpper = formatNumber(constraints.nUpper)
      return `L4：n 上限 ${nUpper} 通常需要 O(n log n) 以内。考虑用排序、二分、堆、线段树、单调队列等把嵌套循环优化掉。`
    }
    return 'L4：考虑用更优的算法或数据结构（排序/二分/堆/线段树/单调队列）来降低复杂度。'
  }

  // WA 边界策略
  if (eventType === 'boundary_suspected' || v === 'WA') {
    if (constraints && constraints.valueUpper !== null && constraints.valueUpper >= 1e9) {
      return 'L4：值域超过 int 范围（约 2.1e9），中间运算可能溢出。考虑用 long long / BigInt，或者先除后乘。'
    }
    return 'L4：维护区间累计信息（前缀和/差分），O(1) 查询区间和。检查边界状态是否单独处理。'
  }

  // RE 越界策略
  if (v === 'RE') {
    return 'L4：检查数组大小、下标边界、空指针、栈溢出（如递归深度过大）。'
  }

  // 通用
  return 'L4：考虑分治/贪心/DP/图论等策略，根据题目数据范围选择合适算法。'
}

function buildL5ConceptMessage(primaryTag: string, allTags: string[]): string {
  // L5 给出概念性提示：根据算法标签引导，但不直接告诉答案
  const tagMap: Record<string, string> = {
    'dp': '这道题可能和动态规划有关——思考状态定义与转移。',
    'graph': '这道题可能和图论有关——考虑建图方式与遍历顺序。',
    'tree': '这道题可能和树有关——考虑 DFS/BFS 与子树信息合并。',
    'math': '这道题可能和数学有关——考虑公式推导或数论性质。',
    'greedy': '这道题可能和贪心有关——思考局部最优策略与反例。',
    'binary-search': '这道题可能和二分有关——思考单调性与判定函数。',
    'prefix-sum': '这道题可能和前缀和有关——思考区间信息如何 O(1) 查询。',
    'segment-tree': '这道题可能和线段树有关——思考区间操作如何维护。',
    'dfs': '这道题可能和 DFS 有关——思考搜索顺序与剪枝。',
    'bfs': '这道题可能和 BFS 有关——思考层次遍历与最短路径。',
    'string': '这道题可能和字符串有关——考虑 KMP/Trie/哈希。',
    'bitmask': '这道题可能和位运算有关——考虑状态压缩。',
    'sort': '这道题可能和排序有关——考虑排序后贪心或二分。',
    'stack': '这道题可能和栈有关——考虑单调栈维护最近满足条件的元素。',
    'queue': '这道题可能和队列有关——考虑单调队列优化 DP/滑动窗口。',
    'heap': '这道题可能和堆有关——考虑用优先队列维护动态极值。',
  }
  const msg = tagMap[primaryTag.toLowerCase()]
  if (msg) return `L5（接近题解方向）：${msg}`

  // 未知标签：列出所有标签作为方向提示
  if (allTags.length > 1) {
    return `L5（接近题解方向）：这道题可能涉及 ${allTags.slice(0, 3).join(' / ')} 等概念。`
  }
  return `L5（接近题解方向）：这道题考察的概念可能与 ${primaryTag} 有关。`
}

/** 将数字格式化为人类可读形式 */
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
