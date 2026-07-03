import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface CodeforcesAccount {
  current_rating?: number | null
  peak_rating?: number | null
}

interface RatingHistoryItem {
  contest_name: string
  delta: number
  rating_after: number
}

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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="contest_name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="rating_after" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Rating" />
            </LineChart>
          </ResponsiveContainer>
          <div className="dashboard-contest-list">
            {ratingHistory.slice(-10).reverse().map((rating, index) => (
              <div key={index} className="dashboard-contest-item">
                <span className="dashboard-contest-name">{rating.contest_name}</span>
                <span className={`dashboard-contest-delta ${rating.delta >= 0 ? 'positive' : 'negative'}`}>
                  {rating.delta >= 0 ? '+' : ''}{rating.delta}
                </span>
                <span className="dashboard-contest-rating">{rating.rating_after}</span>
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
