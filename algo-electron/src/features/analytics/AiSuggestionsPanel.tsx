import { PLATFORM_NAMES } from '../../shared/display'

interface ReviewRecommendation {
  problem_id: number
  platform: string
  title?: string
  platform_problem_id: string
  canonical_url: string
  reason: string
  source: {
    wrong_count: number
    days_since_attempt: number
    visit_count: number
  }
}

interface WeaknessItem {
  tag: string
  ac_rate: number
  evidence: string
  weakness_score: number
}

interface AiSuggestionsPanelProps {
  recommendations: ReviewRecommendation[]
  weaknesses: WeaknessItem[]
  weaknessNote: string
  onNavigate: (url: string) => void
}

export function AiSuggestionsPanel({
  recommendations,
  weaknesses,
  weaknessNote,
  onNavigate,
}: AiSuggestionsPanelProps) {
  return (
    <div className="ai-suggest-section">
      <div className="ai-suggest-grid">
        <div className="ai-suggest-card">
          <h3 className="ai-suggest-title">复习建议</h3>
          {recommendations.length === 0 ? (
            <div className="dashboard-empty">暂无错题数据</div>
          ) : (
            recommendations.map((r) => (
              <div key={r.problem_id} className="ai-rec-item" onClick={() => onNavigate(r.canonical_url)}>
                <div className="ai-rec-head">
                  <span className="ai-rec-platform">{PLATFORM_NAMES[r.platform] || r.platform}</span>
                  <span className="ai-rec-title">{r.title || r.platform_problem_id}</span>
                </div>
                <div className="ai-rec-reason">{r.reason}</div>
                <div className="ai-rec-evidence">
                  {r.source.wrong_count} 次错误 · {r.source.days_since_attempt} 天前 · 访问 {r.source.visit_count} 次
                </div>
              </div>
            ))
          )}
        </div>
        <div className="ai-suggest-card">
          <h3 className="ai-suggest-title">薄弱标签</h3>
          {weaknesses.length === 0 ? (
            <div className="dashboard-empty">{weaknessNote || '暂无标签数据'}</div>
          ) : (
            weaknesses.map((w) => (
              <div key={w.tag} className="ai-weak-item">
                <div className="ai-weak-head">
                  <span className="ai-weak-tag">{w.tag}</span>
                  <span className="ai-weak-acrate">{w.ac_rate}% AC</span>
                </div>
                <div className="ai-weak-evidence">{w.evidence}</div>
                <div className="ai-weak-bar">
                  <div className="ai-weak-bar-fill" style={{ width: `${Math.min(w.weakness_score, 100)}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="ai-suggest-note">基于本地统计规则生成，不修改任何题目状态</div>
    </div>
  )
}
