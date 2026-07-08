import crypto from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { TabManager } from '../browser/TabManager'
import type { TrackingService } from '../tracking/TrackingService'
import type { ProblemIdentity } from '../shared/types'
import {
  type ProblemSession,
  type ProblemSessionPhase,
  type StuckLevel,
  type ProblemSessionStatus,
} from './types'

/**
 * ProblemSessionTracker：维护当前做题会话，区分三态（读题/写码/卡壳），
 * active_seconds 只累计有效活跃，挂机不计时。
 *
 * 生命周期：
 *   - 进入题目页（problem:detected 或 active tab 切到题目 URL）→ 开 session
 *   - 切到本地 IDE（非题目 URL，如 localhost/file://）→ 挂起保持
 *   - 回到题目页或提交 → 同一 session 继续
 *   - 切到另一道题 → 关旧 session，开新 session
 *   - 应用退出 → 关 session
 *
 * 三态推导：
 *   - reading: 无提交且 active_seconds < 300（5 分钟）
 *   - coding: 已提交 ≥1 次或 active_seconds ≥ 300
 *   - stuck: 无新提交超过 600s（10 分钟）且 active_seconds > 600
 *
 * 卡壳等级：
 *   - 0: 未卡壳
 *   - 1: 10+ 分钟无新提交
 *   - 2: 15+ 分钟无新提交且有 ≥1 次 WA
 *   - 3: 20+ 分钟无新提交且 ≥2 次 WA
 *
 * active_seconds 聚合：
 *   - 每 30s tick 一次（tickIntervalMs）
 *   - tick 时若 isCurrentlyActive()（主窗口 focused + 系统空闲 < idleThresholdSec + 当前为 active 状态）
 *     → active_seconds += elapsed（约 30s）
 *   - 挂起期间（suspended）不计时
 *
 * 历史会话保留在内存环形缓冲（最近 50 条），供 getSessionHistory 查询。
 * 不直接入库（CoachEvent.session_id 关联）；阶段 4 时间轴复盘可从 coach_events
 * + problem_visits + submissions 重建。
 */

/** URL 解析函数类型（无副作用版本） */
export type ParseProblemUrlFn = (url: string) => ProblemIdentity | null

export interface ProblemSessionTrackerOptions {
  tabManager: TabManager
  trackingService: TrackingService
  getMainWindow: () => BrowserWindow | null
  /** URL → ProblemIdentity 解析函数（parsers/registry.parseUrl 的无副作用版本） */
  parseProblemUrl: ParseProblemUrlFn
  /** 系统空闲阈值（秒），超过则不计时。默认 60s */
  idleThresholdSec?: number
  /** 聚合 tick 间隔（毫秒）。默认 30000（30s） */
  tickIntervalMs?: number
  /** reading → coding 阈值（秒）。默认 300 */
  readingToCodingSec?: number
  /** 卡壳阈值（秒）。默认 600（10 分钟） */
  stuckThresholdSec?: number
  /** 历史会话环形缓冲容量。默认 50 */
  historyLimit?: number
  /** 注入式 powerMonitor（便于测试）。默认 electron.powerMonitor */
  powerMonitor?: { getSystemIdleTime: () => number }
  /** 注入式 setInterval（便于测试）。默认全局 setInterval */
  setInterval?: (fn: () => void, ms: number) => NodeJS.Timeout
  /** 注入式 clearInterval（便于测试）。默认全局 clearInterval */
  clearInterval?: (handle: NodeJS.Timeout) => void
  /** 注入式 Date.now（便于测试） */
  now?: () => number
}

const DEFAULT_IDLE_THRESHOLD_SEC = 60
const DEFAULT_TICK_INTERVAL_MS = 30_000
const DEFAULT_READING_TO_CODING_SEC = 300
const DEFAULT_STUCK_THRESHOLD_SEC = 600
const DEFAULT_HISTORY_LIMIT = 50

interface ResolvedOptions {
  idleThresholdSec: number
  tickIntervalMs: number
  readingToCodingSec: number
  stuckThresholdSec: number
  historyLimit: number
  powerMonitor?: { getSystemIdleTime: () => number }
  setInterval: (fn: () => void, ms: number) => NodeJS.Timeout
  clearInterval: (handle: NodeJS.Timeout) => void
  now: () => number
  getMainWindow: () => BrowserWindow | null
  tabManager: TabManager
  trackingService: TrackingService
  parseProblemUrl: ParseProblemUrlFn
}

export class ProblemSessionTracker {
  private readonly options: ResolvedOptions

  private current: ProblemSession | null = null
  private history: ProblemSession[] = []
  private tickHandle: NodeJS.Timeout | null = null
  /** 上次 tick 时间戳（ms），用于计算 elapsed */
  private lastTickAt: number | null = null
  /** 主窗口是否聚焦 */
  private mainWindowFocused = true
  /** 用户主动标记"今天别提醒"的提示类型 */
  private neverTodayEventTypes = new Set<string>()
  /** tabManager/navigate 监听器解绑句柄 */
  private cleanupFns: Array<() => void> = []

  constructor(options: ProblemSessionTrackerOptions) {
    this.options = {
      idleThresholdSec: options.idleThresholdSec ?? DEFAULT_IDLE_THRESHOLD_SEC,
      tickIntervalMs: options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS,
      readingToCodingSec: options.readingToCodingSec ?? DEFAULT_READING_TO_CODING_SEC,
      stuckThresholdSec: options.stuckThresholdSec ?? DEFAULT_STUCK_THRESHOLD_SEC,
      historyLimit: options.historyLimit ?? DEFAULT_HISTORY_LIMIT,
      powerMonitor: options.powerMonitor,
      setInterval: options.setInterval ?? setInterval,
      clearInterval: options.clearInterval ?? clearInterval,
      now: options.now ?? Date.now,
      getMainWindow: options.getMainWindow,
      tabManager: options.tabManager,
      trackingService: options.trackingService,
      parseProblemUrl: options.parseProblemUrl,
    }
  }

  /**
   * 启动 tracker，订阅 tabManager / TrackingService / 主窗口 focus。
   * 必须在 app ready 后调用。
   */
  start(): void {
    // 1. 订阅 problem:detected（TrackingService callback）
    this.options.trackingService.setProblemDetectedCallback((identity) => {
      this.handleProblemDetected(identity)
    })

    // 2. 订阅 active tab 变化（用于切换题目/挂起）
    const activeListener = (url: string) => {
      this.handleActiveTabChange(url)
    }
    const unsubscribeActive = this.options.tabManager.addActiveTabChangeListener(activeListener)
    this.cleanupFns.push(unsubscribeActive)

    // 3. 订阅主窗口 focus/blur（用 electron 主窗口对象）
    const win = this.options.getMainWindow()
    if (win) {
      const onFocus = () => {
        this.mainWindowFocused = true
      }
      const onBlur = () => {
        this.mainWindowFocused = false
      }
      win.on('focus', onFocus)
      win.on('blur', onBlur)
      this.cleanupFns.push(() => {
        win.off('focus', onFocus)
        win.off('blur', onBlur)
      })
    }

    // 4. 启动 tick
    this.lastTickAt = this.options.now()
    this.tickHandle = this.options.setInterval(() => this.tick(), this.options.tickIntervalMs)
  }

  /** 停止 tracker：关当前 session + 清理监听器 */
  stop(): void {
    this.closeCurrentSession('closed')
    if (this.tickHandle) {
      this.options.clearInterval(this.tickHandle)
      this.tickHandle = null
    }
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup()
      } catch {
        /* ignore */
      }
    }
    this.cleanupFns = []
  }

  /** 当前会话（可能为 null） */
  getCurrentSession(): ProblemSession | null {
    if (!this.current) return null
    return this.snapshot(this.current)
  }

  /** 历史会话（最近 N 条） */
  getSessionHistory(limit?: number): ProblemSession[] {
    const cap = limit ?? this.history.length
    return this.history.slice(-cap).map((s) => this.snapshot(s))
  }

  /**
   * 由 CoachEventBridge 在收到提交时调用，更新当前 session 的 submit_count/wrong_count/verdict_history。
   */
  recordSubmission(verdict: string, _problemKey?: string): void {
    if (!this.current) return
    this.current.submit_count += 1
    this.current.last_active_at = this.options.now()
    const v = verdict.toUpperCase()
    if (v === 'WA' || v === 'TLE' || v === 'MLE' || v === 'RE' || v === 'CE' || v === 'PE' || v === 'OLE') {
      this.current.wrong_count += 1
    }
    this.current.verdict_history.push(v)
    if (this.current.verdict_history.length > 20) {
      this.current.verdict_history = this.current.verdict_history.slice(-20)
    }
    this.recomputePhase()
  }

  /** 临时屏蔽某类提示到今天结束 */
  suppressToday(eventType: string): void {
    this.neverTodayEventTypes.add(eventType)
  }

  isSuppressed(eventType: string): boolean {
    return this.neverTodayEventTypes.has(eventType)
  }

  /** 仅供测试：注入 identity 触发会话开启 */
  handleProblemDetectedForTest(identity: ProblemIdentity): void {
    this.handleProblemDetected(identity)
  }

  /** 仅供测试：注入 active tab url */
  handleActiveTabChangeForTest(url: string): void {
    this.handleActiveTabChange(url)
  }

  /** 仅供测试：手动触发 tick */
  tickForTest(): void {
    this.tick()
  }

  /** 仅供测试：设置主窗口聚焦状态 */
  setMainWindowFocusedForTest(focused: boolean): void {
    this.mainWindowFocused = focused
  }

  // --- 内部 ---

  private handleProblemDetected(identity: ProblemIdentity): void {
    // 若与当前 session 同题，保持
    if (this.current && this.isSameProblem(this.current, identity)) {
      this.current.last_active_at = this.options.now()
      if (this.current.current_status === 'suspended') {
        this.current.current_status = 'active'
      }
      this.recomputePhase()
      return
    }
    // 不同题，关旧开新
    this.closeCurrentSession('closed')
    this.openNewSession(identity)
  }

  private handleActiveTabChange(url: string): void {
    if (!url || url === 'about:blank') return

    // 试图解析为题目
    const identity = this.options.parseProblemUrl(url)
    if (identity) {
      // 是题目 URL：当作 problem:detected
      this.handleProblemDetected(identity)
      return
    }

    // 非题目 URL（如本地 IDE、首页）：
    // 若当前有 session，挂起；不要立即关闭（用户可能切回）
    if (this.current && this.current.current_status === 'active') {
      this.current.current_status = 'suspended'
      this.current.last_active_at = this.options.now()
    }
  }

  private tick(): void {
    const now = this.options.now()
    if (this.lastTickAt === null) {
      this.lastTickAt = now
      return
    }
    const elapsedSec = Math.floor((now - this.lastTickAt) / 1000)
    this.lastTickAt = now

    if (!this.current) return
    if (this.current.current_status !== 'active') return

    if (this.isCurrentlyActive()) {
      this.current.active_seconds += elapsedSec
      this.current.last_active_at = now
    }
    this.recomputePhase()
  }

  /**
   * 当前是否"有效活跃"：
   * - 主窗口 focused
   * - 系统空闲时间 < idleThresholdSec
   */
  private isCurrentlyActive(): boolean {
    if (!this.mainWindowFocused) return false
    const pm = this.options.powerMonitor
    if (pm && typeof pm.getSystemIdleTime === 'function') {
      try {
        const idle = pm.getSystemIdleTime()
        if (idle >= this.options.idleThresholdSec) return false
      } catch {
        /* ignore */
      }
    }
    return true
  }

  private openNewSession(identity: ProblemIdentity): void {
    const now = this.options.now()
    this.current = {
      session_id: crypto.randomUUID(),
      problem_id: null,
      platform: identity.platform,
      platform_problem_id: identity.platformProblemId,
      started_at: now,
      last_active_at: now,
      active_seconds: 0,
      submit_count: 0,
      wrong_count: 0,
      current_status: 'active',
      phase: 'reading',
      detected_stuck_level: 0,
      verdict_history: [],
      problem_rating: null,
    }
  }

  private closeCurrentSession(finalStatus: ProblemSessionStatus): void {
    if (!this.current) return
    this.current.current_status = finalStatus
    this.history.push(this.current)
    if (this.history.length > this.options.historyLimit) {
      this.history = this.history.slice(-this.options.historyLimit)
    }
    this.current = null
  }

  private recomputePhase(): void {
    if (!this.current) return
    const s = this.current
    const sinceLastSubmitSec = s.submit_count > 0
      ? Math.max(0, Math.floor((this.options.now() - s.last_active_at) / 1000))
      : s.active_seconds

    // phase
    let phase: ProblemSessionPhase
    if (s.submit_count === 0 && s.active_seconds < this.options.readingToCodingSec) {
      phase = 'reading'
    } else if (sinceLastSubmitSec > this.options.stuckThresholdSec && s.active_seconds > this.options.stuckThresholdSec) {
      phase = 'stuck'
    } else {
      phase = 'coding'
    }
    s.phase = phase

    // stuck level
    let level: StuckLevel = 0
    if (phase === 'stuck') {
      if (sinceLastSubmitSec >= this.options.stuckThresholdSec * 2 && s.wrong_count >= 2) {
        level = 3
      } else if (sinceLastSubmitSec >= this.options.stuckThresholdSec * 1.5 && s.wrong_count >= 1) {
        level = 2
      } else {
        level = 1
      }
    }
    s.detected_stuck_level = level
  }

  private isSameProblem(session: ProblemSession, identity: ProblemIdentity): boolean {
    return session.platform === identity.platform
      && session.platform_problem_id === identity.platformProblemId
  }

  private snapshot(s: ProblemSession): ProblemSession {
    // 浅拷贝 + 数组浅拷贝，避免外部修改
    return {
      ...s,
      verdict_history: [...s.verdict_history],
    }
  }
}
