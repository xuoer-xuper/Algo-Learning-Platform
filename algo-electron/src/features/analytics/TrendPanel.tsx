import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrendPoint } from './types'

interface TrendPanelProps {
  visitedTrend: TrendPoint[]
  acTrend: TrendPoint[]
  trendRange: number | undefined
  onTrendRangeChange: (range: number | undefined) => void
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
          <button className={`dashboard-range-btn ${trendRange === 7 ? 'active' : ''}`} onClick={() => onTrendRangeChange(7)}>7天</button>
          <button className={`dashboard-range-btn ${trendRange === 30 ? 'active' : ''}`} onClick={() => onTrendRangeChange(30)}>30天</button>
          <button className={`dashboard-range-btn ${trendRange === undefined ? 'active' : ''}`} onClick={() => onTrendRangeChange(undefined)}>全部</button>
        </div>
      </div>
      {visitedTrend.length > 0 && (
        <>
          <h4 className="dashboard-sub-title">访问题数</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={visitedTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
      {acTrend.length > 0 && (
        <>
          <h4 className="dashboard-sub-title">AC 题数</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={acTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="local_day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
