import { useState, useEffect } from 'react'

const PLATFORM_NAMES: Record<string, string> = {
  codeforces: 'Codeforces',
  acwing: 'AcWing',
  nowcoder: '牛客',
  vjudge: 'VJudge',
}

const STATUS_LABELS: Record<string, string> = {
  solved: '已通过',
  attempted: '尝试中',
  visited: '已访问',
  unknown: '未知',
}

const STATUS_COLORS: Record<string, string> = {
  solved: '#a6e3a1',
  attempted: '#f9e2af',
  visited: '#89b4fa',
  unknown: '#585b70',
}

const VERDICT_COLORS: Record<string, string> = {
  AC: '#a6e3a1',
  WA: '#f38ba8',
  TLE: '#fab387',
  MLE: '#fab387',
  RE: '#f38ba8',
  CE: '#f9e2af',
  PE: '#f9e2af',
  UNKNOWN: '#585b70',
}

interface Props {
  problemId: string
  onClose: () => void
}

export function ProblemDetail({ problemId, onClose }: Props) {
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    window.electronAPI.hideBrowserView()
    window.electronAPI.getProblemDetail(problemId).then(setDetail)
    return () => { window.electronAPI.showBrowserView() }
  }, [problemId])

  if (!detail) {
    return (
      <div className="settings-overlay" onClick={onClose}>
        <div className="settings-page" onClick={e => e.stopPropagation()}>
          <div className="settings-header">
            <span className="settings-title">加载中...</span>
            <button className="settings-close" onClick={onClose}>✕</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="detail-page" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">{detail.title || detail.platform_problem_id}</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-info">
          <div className="detail-row">
            <span className="detail-label">平台</span>
            <span className="detail-value">{PLATFORM_NAMES[detail.platform] || detail.platform}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">题号</span>
            <span className="detail-value">{detail.platform_problem_id}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">状态</span>
            <span className="detail-value" style={{ color: STATUS_COLORS[detail.status] }}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">提交</span>
            <span className="detail-value">{detail.submission_count} 次（AC {detail.ac_count} 次）</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">首次访问</span>
            <span className="detail-value">{detail.first_seen_at?.replace('T', ' ').slice(0, 19)}</span>
          </div>
          {detail.last_visited_at && (
            <div className="detail-row">
              <span className="detail-label">最近访问</span>
              <span className="detail-value">{detail.last_visited_at?.replace('T', ' ').slice(0, 19)}</span>
            </div>
          )}
          <div className="detail-row">
            <a className="detail-link" href="#" onClick={e => { e.preventDefault(); window.electronAPI.navigate(detail.canonical_url); onClose() }}>
              打开原题 →
            </a>
          </div>
        </div>

        {detail.submissions?.length > 0 && (
          <div className="detail-submissions">
            <h3 className="settings-section-title">提交记录</h3>
            <div className="submissions-list">
              {detail.submissions.map((s: any) => (
                <div key={s.id} className="submission-item">
                  <span className="submission-verdict" style={{ color: VERDICT_COLORS[s.verdict] || '#585b70' }}>
                    {s.verdict}
                  </span>
                  <span className="submission-lang">{s.language || '-'}</span>
                  <span className="submission-time">{s.submitted_at?.replace('T', ' ').slice(0, 19)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
