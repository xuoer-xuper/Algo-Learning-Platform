import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_COLORS } from '../../shared/display'
import type { CodeforcesAccount, RatingHistoryItem } from './types'

interface RatingPanelProps {
  account: CodeforcesAccount | null
  ratingHistory: RatingHistoryItem[]
}

export function RatingPanel({ account, ratingHistory }: RatingPanelProps) {
  return (
    <div className="dashboard-chart-section">
      <div className="dashboard-section-header">
        <h3 className="dashboard-section-title">Codeforces Rating</h3>
        {account && (
          <div className="rating-badges">
            <span className="rating-badge rating-current">当前 {account.current_rating ?? '-'}</span>
            <span className="rating-badge rating-peak">最高 {account.peak_rating ?? '-'}</span>
          </div>
        )}
      </div>
      {ratingHistory.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={ratingHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              {/* 场次名较长且倾斜排布，字号 11 防碰撞（其余轴统一 12） */}
              <XAxis dataKey="contest_name" stroke="var(--border-light)" angle={-30} textAnchor="end" height={60}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis stroke="var(--border-light)" width={44} domain={['auto', 'auto']}
                tick={{ fontSize: 12, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }} />
              <Tooltip />
              {/* 「Rating」实体固定占槽位 0 */}
              <Line type="monotone" dataKey="rating_after" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} name="Rating" />
            </LineChart>
          </ResponsiveContainer>
          <div className="dashboard-contest-list">
            {ratingHistory.slice(-10).reverse().map((rating, index) => (
              <div key={index} className="dashboard-contest-item">
                <span className="dashboard-contest-name">{rating.contest_name}</span>
                <span className={`dashboard-contest-delta num ${rating.delta >= 0 ? 'positive' : 'negative'}`}>
                  {rating.delta >= 0 ? '+' : ''}{rating.delta}
                </span>
                <span className="dashboard-contest-rating num">{rating.rating_after}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="dashboard-empty">
          {account ? '暂无 Rating 数据，请在设置中同步' : '请在设置中绑定 Codeforces Handle'}
        </div>
      )}
    </div>
  )
}
