import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { loadMetricsBundle } from './coachDataApi'
import { computeCoachMetrics, formatPercent, type CoachMetricsComputed } from './computeMetrics'
import { MOCK_METRICS_BUNDLE, MOCK_EXPECTED } from './mockMetricsBundle'
import { Button, Card, IconButton } from '../../components/ui'
import { CHART_COLORS } from '../../shared/display'

/**
 * Coach 干预效果指标页（阶段 4 Task 19）。
 *
 * 展示 5 项指标：
 * 1. 提示展示数
 * 2. "再给一点"点击率
 * 3. "有帮助"反馈率
 * 4. 干预后同题 AC 转化率
 * 5. 桌宠关闭率
 *
 * 数据流：IPC 获取原始 bundle → 纯函数 computeCoachMetrics 计算 → 展示。
 *
 * 答辩预演：提供"加载模拟数据"按钮，注入一份可手工核对的 mock bundle，
 * 复用同一份计算逻辑，验证指标正确性。
 */
interface Props {
  onClose: () => void
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  idle_too_long: '卡壳',
  multiple_wrong: '多次错误',
  same_error: '重复错误',
  review_due: '复习到期',
  long_session: '会话过长',
  first_ac: '首次 AC',
  boundary_suspected: '边界疑似',
  complexity_warning: '复杂度警告',
}

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  helpful: '有帮助',
  not_helpful: '没帮助',
  dismiss: '先不用',
  never_today: '今天别提醒',
}

/** 反馈类型 → 图表系列色：按 CHART_COLORS 槽位固定分配实体（dataviz 规范，禁止取模循环） */
const FEEDBACK_COLORS: Record<string, string> = {
  helpful: CHART_COLORS[0],
  not_helpful: CHART_COLORS[1],
  dismiss: CHART_COLORS[2],
  never_today: CHART_COLORS[3],
}

/** 未知反馈类型的兜底色：中性墨色 token */
const FEEDBACK_FALLBACK_COLOR = 'var(--color-ink-3)'

function fmtTime(s: string | null | undefined): string {
  if (!s) return '-'
  const t = Date.parse(s)
  if (Number.isNaN(t)) return s
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CoachMetricsView({ onClose }: Props) {
  const [bundle, setBundle] = useState<CoachMetricsBundle | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReal = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const b = await loadMetricsBundle()
      setBundle(b)
      setIsMock(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`加载指标失败: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReal()
  }, [loadReal])

  const loadMock = useCallback(() => {
    setBundle(MOCK_METRICS_BUNDLE)
    setIsMock(true)
    setLoading(false)
    setError(null)
  }, [])

  const metrics: CoachMetricsComputed | null = useMemo(() => {
    if (!bundle) return null
    return computeCoachMetrics(bundle, isMock)
  }, [bundle, isMock])

  // 事件类型分布（Recharts 用）
  const eventTypeData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.events_by_type)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        type: EVENT_TYPE_LABELS[type] ?? type,
        count,
      }))
  }, [metrics])

  // 反馈类型分布（饼图）
  const feedbackData = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.feedback_by_type)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        name: FEEDBACK_TYPE_LABELS[type] ?? type,
        value: count,
        fill: FEEDBACK_COLORS[type] ?? FEEDBACK_FALLBACK_COLOR,
      }))
  }, [metrics])

  return (
    <div className="coach-metrics-view">
      <div className="dashboard-header">
        <h2 className="dashboard-title">
          Coach 干预效果指标
          {metrics?.is_mock && <span className="coach-mock-badge">模拟数据</span>}
        </h2>
        <div className="dashboard-header-actions">
          {!isMock ? (
            <Button
              size="sm"
              className="dashboard-recompute-btn coach-mock-btn"
              onClick={loadMock}
              title="注入一份可手工核对的模拟数据，用于答辩预演"
            >
              加载模拟数据
            </Button>
          ) : (
            <Button
              size="sm"
              className="dashboard-recompute-btn coach-mock-btn active"
              onClick={loadReal}
            >
              恢复真实数据
            </Button>
          )}
          <IconButton className="dashboard-close" icon="close" title="关闭" onClick={onClose} />
        </div>
      </div>

      {metrics && (
        <div className="coach-metrics-window">
          统计窗口：<span className="num">{fmtTime(metrics.since)}</span> ~ <span className="num">{fmtTime(metrics.until)}</span>（最近 30 天）
        </div>
      )}

      {loading && <div className="coach-timeline-loading">加载中...</div>}
      {error && <div className="coach-timeline-error">{error}</div>}

      {/* 5 项指标卡片（数据声线：大数字与分子分母等宽 + 表格数字） */}
      {metrics && (
        <div className="dashboard-cards coach-metrics-cards">
          <Card padded={false} className="dashboard-card">
            <div className="dashboard-card-value num">{metrics.total_shown}</div>
            <div className="dashboard-card-label">提示展示数</div>
            <div className="dashboard-card-sub">（不含比赛审计）</div>
          </Card>
          <Card padded={false} className="dashboard-card">
            <div className="dashboard-card-value num">{formatPercent(metrics.hint_click_rate)}</div>
            <div className="dashboard-card-label">"再给一点"点击率</div>
            <div className="dashboard-card-sub num">{metrics.hint_requested_count} / {metrics.total_shown}</div>
          </Card>
          <Card padded={false} className="dashboard-card">
            <div className="dashboard-card-value num">{formatPercent(metrics.helpful_rate)}</div>
            <div className="dashboard-card-label">"有帮助"反馈率</div>
            <div className="dashboard-card-sub num">{metrics.helpful_count} / {metrics.total_feedback}</div>
          </Card>
          <Card padded={false} className="dashboard-card">
            <div className="dashboard-card-value num">{formatPercent(metrics.post_intervention_ac_rate)}</div>
            <div className="dashboard-card-label">干预后同题 AC 转化率</div>
            <div className="dashboard-card-sub num">{metrics.post_intervention_ac_count} / {metrics.intervention_problem_count}</div>
          </Card>
          <Card padded={false} className="dashboard-card">
            <div className="dashboard-card-value num">{formatPercent(metrics.dismiss_rate)}</div>
            <div className="dashboard-card-label">桌宠关闭率</div>
            <div className="dashboard-card-sub num">
              {metrics.dismissed_count + metrics.never_today_count} / {metrics.total_shown}
              <span className="coach-card-sub-hint">（dismiss {metrics.dismissed_count} + never_today {metrics.never_today_count}）</span>
            </div>
          </Card>
        </div>
      )}

      {/* 答辩预演核对面板（仅模拟数据时展示） */}
      {metrics?.is_mock && (
        <div className="coach-verify-panel">
          <h3 className="dashboard-section-title">答辩核对（模拟数据预期值）</h3>
          <ul className="coach-verify-list">
            <li>提示展示数 = 10（10 条非审计干预）</li>
            <li>"再给一点"点击率 = 3/10 = 30.0%（当前 {formatPercent(metrics.hint_click_rate)}）</li>
            <li>"有帮助"反馈率 = 4/8 = 50.0%（当前 {formatPercent(metrics.helpful_rate)}）</li>
            <li>干预后 AC 转化率 = 1/3 ≈ 33.3%（当前 {formatPercent(metrics.post_intervention_ac_rate)}）</li>
            <li>桌宠关闭率 = (2+2)/10 = 40.0%（当前 {formatPercent(metrics.dismiss_rate)}）</li>
          </ul>
          <p className="coach-verify-note">
            断言：{MOCK_EXPECTED.total_shown === metrics.total_shown
              && Math.abs(MOCK_EXPECTED.hint_click_rate - metrics.hint_click_rate) < 1e-9
              && Math.abs(MOCK_EXPECTED.helpful_rate - metrics.helpful_rate) < 1e-9
              && Math.abs(MOCK_EXPECTED.post_intervention_ac_rate - metrics.post_intervention_ac_rate) < 1e-9
              && Math.abs(MOCK_EXPECTED.dismiss_rate - metrics.dismiss_rate) < 1e-9
              ? '通过，全部指标计算与预期一致' : '不通过，存在偏差，需检查 computeCoachMetrics'}
          </p>
        </div>
      )}

      {/* 图表区 */}
      {metrics && (
        <div className="coach-charts-row">
          {eventTypeData.length > 0 && (
            <div className="dashboard-chart-section coach-chart-half">
              <h3 className="dashboard-section-title">事件类型分布</h3>
              <ResponsiveContainer width="100%" height={Math.max(140, eventTypeData.length * 36)}>
                <BarChart data={eventTypeData} layout="vertical" margin={{ left: 12, right: 20, top: 4, bottom: 4 }}>
                  <XAxis type="number" allowDecimals={false} stroke="var(--border-light)"
                    tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} />
                  <YAxis type="category" dataKey="type" stroke="var(--border-light)" width={78}
                    tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <Tooltip cursor={{ fill: 'var(--hover-bg)' }} />
                  {/* 单系列柱图固定占槽位 0；横向柱的数据端（右端）圆角 4px */}
                  <Bar dataKey="count" name="次数" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {feedbackData.length > 0 && (
            <div className="dashboard-chart-section coach-chart-half">
              <h3 className="dashboard-section-title">反馈类型分布</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  {/* 扇区用卡片底色描边留出间隙；标识与数值交给图例 + Tooltip（低对比槽位补救） */}
                  <Pie
                    data={feedbackData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    stroke="var(--bg-card)"
                    strokeWidth={2}
                  >
                    {feedbackData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {metrics && (
        <div className="dashboard-footer coach-metrics-footer">
          事件总数：<span className="num">{metrics.total_events}</span> · 干预总数：<span className="num">{metrics.total_interventions}</span>
          {bundle?.interventions.some((i) => i.source_type === 'contest_audit') && (
            <> · 含比赛模式审计记录</>
          )}
        </div>
      )}
    </div>
  )
}
