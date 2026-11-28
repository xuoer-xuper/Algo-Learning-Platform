import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '../../components/ui'
import { CHART_COLORS } from '../../shared/display'
import type { TrendPoint } from '@shared/types/stats'

interface TrendPanelProps {
  visitedTrend: TrendPoint[]
  acTrend: TrendPoint[]
  trendRange: number | undefined
  onTrendRangeChange: (range: number | undefined) => void
}

function formatTrendCategory(category: unknown, points: TrendPoint[], short: boolean): string {
  if (typeof category !== 'number' || !Number.isInteger(category) || category < 0) return ''
  const point = points[category]
  if (!point) return ''
  if (point.local_day === null) return '日期缺失'
  return short ? point.local_day.slice(5) : point.local_day
}

export function TrendPanel({
  visitedTrend,
  acTrend,
  trendRange,
  onTrendRangeChange,
}: TrendPanelProps) {
  return (
    <div className="dashboard-chart-section">
      <div className="dashboard-section-header">
        <h3 className="dashboard-section-title">趋势</h3>
        <div className="dashboard-range-btns">
          <Button
            size="sm"
            className={`dashboard-range-btn ${trendRange === 7 ? 'active' : ''}`}
            onClick={() => onTrendRangeChange(7)}
          >
            7天
          </Button>
          <Button
            size="sm"
            className={`dashboard-range-btn ${trendRange === 30 ? 'active' : ''}`}
            onClick={() => onTrendRangeChange(30)}
          >
            30天
          </Button>
          <Button
            size="sm"
            className={`dashboard-range-btn ${trendRange === undefined ? 'active' : ''}`}
            onClick={() => onTrendRangeChange(undefined)}
          >
            全部
          </Button>
        </div>
      </div>
      {visitedTrend.length > 0 && (
        <>
          <h4 className="dashboard-sub-title">访问题数</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={visitedTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis
                type="category"
                stroke="var(--border-light)"
                tickFormatter={(category) => formatTrendCategory(category, visitedTrend, true)}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
              />
              <YAxis
                stroke="var(--border-light)"
                width={32}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
              />
              <Tooltip
                labelFormatter={(category) => formatTrendCategory(category, visitedTrend, false)}
              />
              {/* 「访问」实体固定占槽位 0 */}
              <Line
                type="monotone"
                dataKey="count"
                name="题数"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
      {acTrend.length > 0 && (
        <>
          <h4 className="dashboard-sub-title">AC 题数</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={acTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis
                type="category"
                stroke="var(--border-light)"
                tickFormatter={(category) => formatTrendCategory(category, acTrend, true)}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
              />
              <YAxis
                stroke="var(--border-light)"
                width={32}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
              />
              <Tooltip
                labelFormatter={(category) => formatTrendCategory(category, acTrend, false)}
              />
              {/* 「AC」实体固定占槽位 2（低对比槽，由小节标题 + Tooltip 补救） */}
              <Line
                type="monotone"
                dataKey="count"
                name="题数"
                stroke={CHART_COLORS[2]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
