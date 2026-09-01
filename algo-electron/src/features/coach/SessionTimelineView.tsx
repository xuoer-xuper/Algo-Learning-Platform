import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { loadProblemTimeline } from './coachDataApi'
import { PLATFORM_NAMES, STATUS_COLORS, VERDICT_COLORS } from '../../shared/display'
import { Empty, Icon, IconButton, Skeleton, type IconName } from '../../components/ui'

/**
 * 单题时间轴复盘视图（阶段 4 Task 18）。
 *
 * 把一次做题过程还原成可视时间轴：进入题目 → 提交序列（verdict 变化）→
 * Coach 介入点 → AC / 放弃。数据全部来自现有表（problem_visits /
 * submissions / coach_events / coach_interventions），不新增采集。
 *
 * 思考 / 实现时间切分：
 * - 首次提交前 = 思考时间（读题 + 构思）
 * - 提交间隔 = 实现时间（写码 + 调试）
 * - 结合三态（reading/coding/stuck）由事件 evidence 体现
 */
interface Props {
  problemId: string
  onClose: () => void
}

type TimelinePointKind = 'visit' | 'submission' | 'event' | 'intervention' | 'ac'

interface TimelinePoint {
  kind: TimelinePointKind
  time: string
  timestamp: number
  title: string
  subtitle: string
  color: string
  icon: IconName
  detail?: string
  /** 判题结果代码（AC/WA/…），存在时以等宽芯片展示 */
  verdict?: string
}

const KIND_META: Record<TimelinePointKind, { label: string; icon: IconName }> = {
  visit: { label: '进入题目', icon: 'log-in' },
  submission: { label: '提交', icon: 'upload' },
  event: { label: 'Coach 事件', icon: 'bolt' },
  intervention: { label: 'Coach 介入', icon: 'lightbulb' },
  ac: { label: '通过', icon: 'star' },
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  idle_too_long: '卡壳提醒',
  multiple_wrong: '多次错误',
  same_error: '重复错误',
  review_due: '复习到期',
  long_session: '会话过长',
  first_ac: '首次 AC',
  boundary_suspected: '边界疑似',
  complexity_warning: '复杂度警告',
}

const INTERVENTION_LEVEL_LABELS: Record<number, string> = {
  0: 'L0 不提示',
  1: 'L1 轻提醒',
  2: 'L2 元认知',
  3: 'L3 关键细节',
  4: 'L4 策略',
  5: 'L5 概念/标签',
}

function parseTs(s: string | null | undefined): number {
  if (!s) return NaN
  return Date.parse(s)
}

function fmtTime(s: string | null | undefined): string {
  if (!s) return '-'
  const t = parseTs(s)
  if (Number.isNaN(t)) return s
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s === 0 ? `${m} 分钟` : `${m} 分 ${s} 秒`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm === 0 ? `${h} 小时` : `${h} 小时 ${mm} 分`
}

function verdictColor(verdict: string): string {
  // 判题色统一取自 display.ts 语义色表
  return VERDICT_COLORS[verdict] || VERDICT_COLORS.UNKNOWN
}

export function SessionTimelineView({ problemId, onClose }: Props) {
  const [data, setData] = useState<ProblemTimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadProblemTimeline(problemId)
      .then((d) => {
        if (cancelled) return
        setData(d)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(`加载时间轴失败: ${msg}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [problemId])

  // 合并四类数据点为单一时间轴
  const points = useMemo<TimelinePoint[]>(() => {
    if (!data) return []
    const list: TimelinePoint[] = []

    for (const v of data.visits) {
      list.push({
        kind: 'visit',
        time: v.entered_at,
        timestamp: parseTs(v.entered_at),
        title: '进入题目',
        subtitle: v.left_at
          ? `停留 ${fmtDuration(v.duration_seconds ?? 0)}（活跃 ${fmtDuration(v.active_seconds ?? 0)}）`
          : '尚未离开',
        color: STATUS_COLORS.visited,
        icon: KIND_META.visit.icon,
        detail: v.url,
      })
    }

    for (const s of data.submissions) {
      const isAc = s.verdict === 'AC'
      list.push({
        kind: isAc ? 'ac' : 'submission',
        time: s.submitted_at,
        timestamp: parseTs(s.submitted_at),
        title: isAc ? '通过' : '提交',
        verdict: s.verdict,
        subtitle: [
          s.language,
          s.runtime_ms != null ? `${s.runtime_ms} ms` : null,
        ].filter(Boolean).join(' · '),
        color: verdictColor(s.verdict),
        icon: isAc ? KIND_META.ac.icon : KIND_META.submission.icon,
      })
    }

    for (const e of data.events) {
      list.push({
        kind: 'event',
        time: e.created_at,
        timestamp: parseTs(e.created_at),
        title: EVENT_TYPE_LABELS[e.event_type] ?? e.event_type,
        subtitle: `severity=${e.severity}`,
        color: e.severity === 'critical'
          ? 'var(--color-danger)'
          : e.severity === 'warn'
            ? 'var(--color-warn)'
            : 'var(--color-accent)',
        icon: KIND_META.event.icon,
        detail: e.evidence.verdict
          ? `verdict=${e.evidence.verdict}`
          : e.evidence.wrong_count != null
            ? `wrong_count=${e.evidence.wrong_count}`
            : undefined,
      })
    }

    for (const i of data.interventions) {
      const isAudit = i.source_type === 'contest_audit'
      list.push({
        kind: 'intervention',
        time: i.created_at,
        timestamp: parseTs(i.created_at),
        title: isAudit ? '比赛模式审计' : (INTERVENTION_LEVEL_LABELS[i.intervention_level] ?? 'Coach 介入'),
        subtitle: i.trigger_reason,
        color: isAudit
          ? 'var(--text-muted)'
          : i.intervention_level >= 4
            ? 'var(--color-accent)'
            : i.intervention_level >= 2
              ? 'var(--color-warn)'
              : 'var(--color-ok)',
        icon: KIND_META.intervention.icon,
        detail: i.message,
      })
    }

    return list.sort((a, b) => a.timestamp - b.timestamp)
  }, [data])

  // 时间切分：思考时间 / 实现时间
  const segments = useMemo(() => {
    if (!data) return null
    const firstVisit = data.visits[0]?.entered_at
    const firstSubmit = data.submissions[0]?.submitted_at
    const lastSubmit = data.submissions[data.submissions.length - 1]?.submitted_at
    const lastActivity = data.last_activity_at

    const totalActiveSeconds = data.visits.reduce(
      (sum, v) => sum + (v.active_seconds ?? 0),
      0,
    )

    // 思考时间 = 首次进入 → 首次提交
    let thinkingSeconds = 0
    if (firstVisit && firstSubmit) {
      const diff = (parseTs(firstSubmit) - parseTs(firstVisit)) / 1000
      thinkingSeconds = diff > 0 ? diff : 0
    } else if (firstVisit && lastActivity) {
      // 无提交：全部视为思考/卡壳时间
      const diff = (parseTs(lastActivity) - parseTs(firstVisit)) / 1000
      thinkingSeconds = diff > 0 ? diff : 0
    }

    // 实现时间 = 首次提交 → 末次提交（或 AC）
    let codingSeconds = 0
    if (firstSubmit && lastSubmit) {
      const diff = (parseTs(lastSubmit) - parseTs(firstSubmit)) / 1000
      codingSeconds = diff > 0 ? diff : 0
    }

    return {
      firstVisit,
      firstSubmit,
      lastSubmit,
      lastActivity,
      thinkingSeconds,
      codingSeconds,
      totalActiveSeconds,
    }
  }, [data])

  // verdict 分布（Recharts 用）
  const verdictDist = useMemo(() => {
    if (!data) return []
    const map = new Map<string, number>()
    for (const s of data.submissions) {
      map.set(s.verdict, (map.get(s.verdict) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([verdict, count]) => ({
      verdict,
      count,
      fill: verdictColor(verdict),
    }))
  }, [data])

  if (loading) {
    return (
      <div className="coach-timeline-view">
        <div className="settings-header">
          <span className="settings-title">时间轴复盘</span>
          <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
        </div>
        <Skeleton rows={5} label="时间轴加载中" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="coach-timeline-view">
        <div className="settings-header">
          <span className="settings-title">时间轴复盘</span>
          <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
        </div>
        {/* 错误保留独立类名与 role：它不是空态，也不是加载态 */}
        <div className="coach-timeline-error" role="alert">{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="coach-timeline-view">
        <div className="settings-header">
          <span className="settings-title">时间轴复盘</span>
          <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
        </div>
        <Empty compact>未找到该题目的时间轴数据。</Empty>
      </div>
    )
  }

  const hasAc = data.first_ac_at !== null

  return (
    <div className="coach-timeline-view">
      <div className="settings-header">
        <span className="settings-title">
          时间轴复盘 · {data.title || data.platform_problem_id}
        </span>
        <IconButton icon="close" title="关闭" className="settings-close" onClick={onClose} />
      </div>

      <div className="coach-timeline-info">
        <div className="detail-row">
          <span className="detail-label">平台</span>
          <span className="detail-value">{PLATFORM_NAMES[data.platform] || data.platform}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">题号</span>
          <span className="detail-value num">{data.platform_problem_id}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">最终状态</span>
          <span className="detail-value" style={{ color: hasAc ? STATUS_COLORS.solved : STATUS_COLORS.attempted }}>
            {hasAc ? `已 AC（${fmtTime(data.first_ac_at)}）` : '未通过 / 进行中'}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">访问次数</span>
          <span className="detail-value num">{data.visits.length} 次</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">提交次数</span>
          <span className="detail-value num">{data.submissions.length} 次</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Coach 介入</span>
          <span className="detail-value num">
            {data.interventions.filter((i) => i.source_type !== 'contest_audit').length} 次
            {data.interventions.some((i) => i.source_type === 'contest_audit') && '（含比赛模式审计）'}
          </span>
        </div>
      </div>

      {/* 时间切分摘要 */}
      {segments && (
        <div className="coach-timeline-segments">
          <h3 className="settings-section-title">时间切分</h3>
          <div className="coach-segment-bar">
            <div
              className="coach-segment thinking"
              title={`思考时间 ${fmtDuration(segments.thinkingSeconds)}`}
              style={{ flexGrow: Math.max(segments.thinkingSeconds, 1) }}
            />
            <div
              className="coach-segment coding"
              title={`实现时间 ${fmtDuration(segments.codingSeconds)}`}
              style={{ flexGrow: Math.max(segments.codingSeconds, 1) }}
            />
          </div>
          <div className="coach-segment-legend">
            <span className="coach-legend-item">
              <span className="coach-legend-dot thinking" />
              思考时间：{fmtDuration(segments.thinkingSeconds)}
              <span className="coach-legend-hint">（首次进入 → 首次提交）</span>
            </span>
            <span className="coach-legend-item">
              <span className="coach-legend-dot coding" />
              实现时间：{fmtDuration(segments.codingSeconds)}
              <span className="coach-legend-hint">（首次提交 → 末次提交）</span>
            </span>
            <span className="coach-legend-item">
              <span className="coach-legend-dot active" />
              有效活跃：{fmtDuration(segments.totalActiveSeconds)}
              <span className="coach-legend-hint">（排除挂机）</span>
            </span>
          </div>
        </div>
      )}

      {/* verdict 分布图 */}
      {verdictDist.length > 0 && (
        <div className="coach-timeline-chart">
          <h3 className="settings-section-title">提交 verdict 分布</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, verdictDist.length * 36)}>
            <BarChart data={verdictDist} layout="vertical" margin={{ left: 20, right: 20, top: 4, bottom: 4 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="verdict" tick={{ fontSize: 12 }} width={56} />
              <Tooltip cursor={{ fill: 'var(--color-hover)' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {verdictDist.map((entry) => (
                  <Cell key={entry.verdict} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 垂直时间轴 */}
      <div className="coach-timeline-list">
        <h3 className="settings-section-title">完整时间轴（{points.length}）</h3>
        {points.length === 0 ? (
          <Empty compact>暂无活动记录。</Empty>
        ) : (
          <ol className="timeline-stream">
            {points.map((p, idx) => (
              <li key={`${p.kind}-${idx}`} className="timeline-item">
                <span className="timeline-dot" style={{ color: p.color }}>
                  <Icon name={p.icon} size={12} strokeWidth={2} />
                </span>
                <div className="timeline-content">
                  <div className="timeline-head">
                    <span className="timeline-title" style={{ color: p.color }}>{p.title}</span>
                    {p.verdict && (
                      <span className="ui-chip" style={{ color: p.color }}>
                        <span className="ui-chip-dot" style={{ background: p.color }} />
                        {p.verdict}
                      </span>
                    )}
                    <span className="timeline-kind">{KIND_META[p.kind].label}</span>
                    <span className="timeline-time num">{fmtTime(p.time)}</span>
                  </div>
                  {p.subtitle && <div className="timeline-subtitle">{p.subtitle}</div>}
                  {p.detail && <div className="timeline-detail">{p.detail}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
