import type { ProblemIdentity } from '../shared/types'

/**
 * ContestGuard：比赛模式硬保障。
 *
 * 职责：
 * 1. URL 规则判断当前 tab 是否处于比赛页（CF /contest/{id}、洛谷 /contest/{id}）
 * 2. 时间窗校验：当前时间是否落在"疑似比赛进行中"窗口
 *    （Demo 阶段：CF /contest/{id} 但访问 /contest/{id}/problem/{X} 也视为比赛中；
 *    洛谷同理。无 API 时一律视为进行中以保守 hard-disable）
 * 3. 检测到比赛进行中：
 *    - 规则引擎硬关闭（RuleEngine.handleEvent 直接返回 null）
 *    - LLM 通道禁用（Demo 无 LLM，预留接口）
 *    - 桌宠切换"比赛模式"状态（通过独立 channel coach:contestModeChanged 通知 renderer）
 * 4. 审计日志写入 coach_interventions（source_type='contest_audit'）
 * 5. 赛后自动恢复 + 提示复盘/upsolve（仅赛后，由 ContestGuard.onContestEnd 触发）
 *
 * 默认开启不可绕过：isContestMode() 是 hard gate，无配置开关。
 */

/** 比赛信息（从 URL 解析） */
export interface ContestInfo {
  /** 比赛平台（codeforces / luogu / ...） */
  platform: string
  /** 比赛 id（从 URL 解析） */
  contestId: string
  /** 比赛 URL（规范化） */
  contestUrl: string
  /** 进入比赛页时间戳（ms） */
  enteredAt: number
}

/**
 * URL 规则：识别比赛页 URL。
 *
 * 识别范围：
 * - Codeforces: /contest/{id}、/contest/{id}/problem/{X}、/contest/{id}/status、/contest/{id}/my、/gym/{id}/...
 *   （注意：/problemset/problem/{id}/{X} 不是比赛页，是练习页）
 * - 洛谷: /contest/{id}、/contest/{id}/...
 *
 * 复用现有 parsers/sites 的站点识别（通过传入 matchFn 注入），避免硬编码 host。
 * 若 matchFn 未提供，则降级到内置 host 匹配（仅 CF/洛谷）。
 */
export function detectContestFromUrl(
  url: string,
  options?: {
    /** 站点匹配函数：返回 platform id 或 null（来自 adapters/registry） */
    matchSite?: (url: string) => string | null
  },
): { platform: string; contestId: string; contestUrl: string } | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname
  const path = parsed.pathname.replace(/\/+$/, '') || '/'

  // 1. Codeforces: codeforces.com / www.codeforces.com
  if (host === 'codeforces.com' || host === 'www.codeforces.com') {
    // /contest/{id} 或 /contest/{id}/...
    const contestMatch = path.match(/^\/contest\/(\d+)(?:\/|$)/)
    if (contestMatch) {
      const contestId = contestMatch[1]
      return {
        platform: 'codeforces',
        contestId,
        contestUrl: `https://codeforces.com/contest/${contestId}`,
      }
    }
    // /gym/{id} 或 /gym/{id}/...（gym 也算比赛模式）
    const gymMatch = path.match(/^\/gym\/(\d+)(?:\/|$)/)
    if (gymMatch) {
      const contestId = gymMatch[1]
      return {
        platform: 'codeforces',
        contestId,
        contestUrl: `https://codeforces.com/gym/${contestId}`,
      }
    }
    return null
  }

  // 2. 洛谷: luogu.com.cn / www.luogu.com.cn
  if (host === 'luogu.com.cn' || host === 'www.luogu.com.cn') {
    const contestMatch = path.match(/^\/contest\/(\d+)(?:\/|$)/)
    if (contestMatch) {
      const contestId = contestMatch[1]
      return {
        platform: 'luogu',
        contestId,
        contestUrl: `https://www.luogu.com.cn/contest/${contestId}`,
      }
    }
    return null
  }

  // 3. 其他站点：尝试 matchSite 注入（vjudge / nowcoder 的 contest 页未来可扩展）
  if (options?.matchSite) {
    const platform = options.matchSite(url)
    if (platform) {
      // 通用 /contest/{id} 模式
      const contestMatch = path.match(/^\/contest\/(\w+)(?:\/|$)/)
      if (contestMatch) {
        const contestId = contestMatch[1]
        return {
          platform,
          contestId,
          contestUrl: `${parsed.protocol}//${host}/contest/${contestId}`,
        }
      }
    }
  }

  return null
}

/**
 * 时间窗校验。
 *
 * Demo 阶段简化：
 * - 若有 contest 的明确 start/end（从外部 API 注入），则校验 now 是否落在 [start, end]
 * - 若无（默认），则保守视为"进行中"（hard-disable）—— 一旦进入比赛页就视为比赛中
 *
 * 后续优化：接入 CF contest.standings API 获取真实开始/结束时间。
 */
export function isContestActive(
  now: number,
  contestStart?: number,
  contestEnd?: number,
): boolean {
  if (contestStart == null || contestEnd == null) {
    // 保守：无时间窗时视为进行中
    return true
  }
  return now >= contestStart && now <= contestEnd
}

export interface ContestGuardOptions {
  /** URL → 比赛信息识别函数（默认 detectContestFromUrl） */
  detectContest?: typeof detectContestFromUrl
  /** 时间窗判定函数（默认 isContestActive） */
  isActive?: typeof isContestActive
  /** 注入式 Date.now */
  now?: () => number
  /** 比赛进入/离开回调（用于驱动桌宠状态切换 + 审计写入） */
  onContestEnter?: (info: ContestInfo) => void
  onContestEnd?: (info: ContestInfo, durationSec: number) => void
}

export class ContestGuard {
  private readonly options: Required<Omit<ContestGuardOptions, 'onContestEnter' | 'onContestEnd' | 'detectContest' | 'isActive'>> & {
    detectContest: typeof detectContestFromUrl
    isActive: typeof isContestActive
    onContestEnter?: (info: ContestInfo) => void
    onContestEnd?: (info: ContestInfo, durationSec: number) => void
  }
  private current: ContestInfo | null = null

  constructor(options: ContestGuardOptions = {}) {
    this.options = {
      detectContest: options.detectContest ?? detectContestFromUrl,
      isActive: options.isActive ?? isContestActive,
      now: options.now ?? Date.now,
      onContestEnter: options.onContestEnter,
      onContestEnd: options.onContestEnd,
    }
  }

  /** 当前是否处于比赛模式（hard gate，不可绕过） */
  isContestMode(): boolean {
    return this.current !== null
  }

  /** 当前比赛信息（不在比赛模式时为 null） */
  getCurrentContest(): ContestInfo | null {
    return this.current ? { ...this.current } : null
  }

  /**
   * 处理 URL 变化（来自 TabManager active tab change 或 navigate）。
   * - 进入比赛页 → onContestEnter，设 current
   * - 离开比赛页 → onContestEnd，清 current
   * - 切换到另一个比赛 → 先 end 再 enter
   */
  handleUrlChange(url: string): void {
    const detected = this.options.detectContest(url)
    if (detected) {
      // 进入比赛页（或切换到另一个比赛）
      if (this.current && this.current.platform === detected.platform && this.current.contestId === detected.contestId) {
        // 同一比赛，无变化
        return
      }
      // 切换比赛：先结束旧的
      if (this.current) {
        this.endContest()
      }
      const info: ContestInfo = {
        platform: detected.platform,
        contestId: detected.contestId,
        contestUrl: detected.contestUrl,
        enteredAt: this.options.now(),
      }
      this.current = info
      this.options.onContestEnter?.(info)
    } else {
      // 离开比赛页
      if (this.current) {
        this.endContest()
      }
    }
  }

  /**
   * 显式结束比赛（如应用退出）。
   */
  forceEnd(): void {
    if (this.current) {
      this.endContest()
    }
  }

  /** 仅供测试：直接设置当前比赛状态 */
  setContestForTest(info: ContestInfo | null): void {
    this.current = info
  }

  private endContest(): void {
    if (!this.current) return
    const info = this.current
    const durationSec = Math.floor((this.options.now() - info.enteredAt) / 1000)
    this.current = null
    this.options.onContestEnd?.(info, durationSec)
  }
}

/**
 * 比赛模式硬关闭时，对 CoachEvent 的统一处理：不触发任何规则，仅返回 null。
 * 由 RuleEngine.handleEvent 内部判定，无需外部调用。
 * 此函数保留作为 ContestGuard 与 RuleEngine 的"协议文档"。
 */
export function isEventBlockedByContest(
  isContestMode: boolean,
  _event: { event_type: string },
): boolean {
  // 比赛模式硬关闭：所有事件类型都不触发提示
  // （first_ac 也不展示气泡，避免干扰；但事件本身仍可记录到 coach_events 用于审计）
  return isContestMode
}

/**
 * 判断一个 ProblemIdentity 是否处于比赛中。
 * 用于 ContestGuard 与 ProblemSessionTracker 协作：若 identity 携带 contestId，
 * 视为比赛题。
 */
export function isProblemIdentityInContest(identity: ProblemIdentity): boolean {
  // CF contest problem 携带 contestId；problemset problem 也携带 contestId（但不是比赛）
  // 简化：仅当 platform=codeforces 且 contestId > 100000（gym）时才视为比赛题
  // 但这不足以判定"进行中"，仍需 URL 判定。
  // 这里仅返回 false，让 ContestGuard 通过 URL 主导判定。
  void identity
  return false
}
