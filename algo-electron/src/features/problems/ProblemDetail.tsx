import { useState, useEffect } from 'react'
import { PLATFORM_NAMES, STATUS_COLORS, STATUS_LABELS, VERDICT_COLORS } from '../../shared/display'
import {
  deleteNotesByProblem,
  deleteProblemRecord,
  loadNotesForDelete,
  loadProblemDetail,
  navigateToProblemUrl,
} from './problemsApi'
import type { ProblemDetailRecord, SubmissionRecord } from './problemTypes'
import { SessionTimelineView } from '../coach/SessionTimelineView'

interface Props {
  problemId: string
  onClose: () => void
}

function isContestPageLink(url: string): boolean {
  if (!url.includes('codeforces.com')) return false
  return !url.includes('/problem/') && !url.includes('/problemset/problem/')
}

export function ProblemDetail({ problemId, onClose }: Props) {
  const [detail, setDetail] = useState<ProblemDetailRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<'detail' | 'timeline'>('detail')

  useEffect(() => {
    loadProblemDetail(problemId).then(setDetail)
  }, [problemId])

  // 切题时重置子视图
  useEffect(() => {
    setView('detail')
  }, [problemId])

  if (view === 'timeline') {
    return <SessionTimelineView problemId={problemId} onClose={() => setView('detail')} />
  }

  const handleDelete = async () => {
    if (!confirm('确定删除这道题的本地记录吗？')) return

    // 检查是否有关联笔记，若有则询问是否一并删除笔记文件
    let deleteNotes = false
    try {
      const notes = await loadNotesForDelete(problemId)
      if (notes.length > 0) {
        deleteNotes = confirm(
          `该题目关联了 ${notes.length} 条笔记。\n\n点击「确定」将同时删除这些笔记文件（不可恢复）；\n点击「取消」仅删除题目记录，保留笔记文件。`
        )
      }
    } catch { /* 忽略查询失败 */ }

    setDeleting(true)
    try {
      if (deleteNotes) {
        await deleteNotesByProblem(problemId)
      }
      const ok = await deleteProblemRecord(problemId)
      if (ok) onClose()
    } finally {
      setDeleting(false)
    }
  }

  if (!detail) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          <span className="settings-title">加载中...</span>
          <button type="button" className="settings-close" onClick={onClose}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <div className="detail-page">
      <div className="settings-header">
        <span className="settings-title">{detail.title || detail.platform_problem_id}</span>
        <div className="detail-header-actions">
          <button
            type="button"
            className="detail-timeline-btn"
            onClick={() => setView('timeline')}
            title="查看本题做题时间轴与 Coach 介入点"
          >
            时间轴复盘
          </button>
          <button
            type="button"
            className="detail-delete-btn"
            onClick={handleDelete}
            disabled={deleting}
            title="删除本地记录"
          >
            {deleting ? '删除中…' : '删除'}
          </button>
          <button type="button" className="settings-close" onClick={onClose}>✕</button>
        </div>
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
        {detail.visitStats && detail.visitStats.total_visits > 0 && (
          <div className="detail-row">
            <span className="detail-label">停留</span>
            <span className="detail-value">
              {detail.visitStats.total_visits} 次访问，
              累计 {Math.round(detail.visitStats.total_duration / 60)} 分钟
            </span>
          </div>
        )}
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
          <a
            className="detail-link"
            href="#"
            onClick={(e) => {
              e.preventDefault()
              navigateToProblemUrl(detail.canonical_url)
              onClose()
            }}
          >
            {isContestPageLink(detail.canonical_url) ? '打开比赛 →' : '打开原题 →'}
          </a>
        </div>
      </div>

      {(detail.submissions?.length ?? 0) > 0 && (
        <div className="detail-submissions">
          <h3 className="settings-section-title">提交记录</h3>
          <div className="submissions-list">
            {(detail.submissions ?? []).map((s: SubmissionRecord) => (
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
  )
}
