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
import { Button, ConfirmDialog, IconButton } from '../../components/ui'

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
  // B1.4：删除二连问合并为单个确认对话框 + 「同时删除笔记」勾选项
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [noteCount, setNoteCount] = useState(0)
  const [alsoDeleteNotes, setAlsoDeleteNotes] = useState(false)

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

  // 打开删除确认：先查询关联笔记数，决定是否展示「同时删除笔记」勾选项
  const handleDeleteRequest = async () => {
    let count = 0
    try {
      const notes = await loadNotesForDelete(problemId)
      count = notes.length
    } catch { /* 查询失败时按无笔记处理 */ }
    setNoteCount(count)
    setAlsoDeleteNotes(false)
    setConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    setConfirmOpen(false)
    setDeleting(true)
    try {
      if (alsoDeleteNotes && noteCount > 0) {
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
      <div className="detail-page">
        <div className="detail-header">
          <span className="detail-title">加载中...</span>
          <IconButton icon="close" title="关闭" className="detail-close" onClick={onClose} />
        </div>
      </div>
    )
  }

  return (
    <div className="detail-page">
      <div className="detail-header">
        <span className="detail-title">{detail.title || detail.platform_problem_id}</span>
        <div className="detail-header-actions">
          <Button
            size="sm"
            icon="chart"
            onClick={() => setView('timeline')}
            title="查看本题做题时间轴与 Coach 介入点"
          >
            时间轴复盘
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="trash"
            onClick={handleDeleteRequest}
            disabled={deleting}
          >
            {deleting ? '删除中…' : '删除'}
          </Button>
          <IconButton icon="close" title="关闭" className="detail-close" onClick={onClose} />
        </div>
      </div>

      <div className="detail-info">
        <div className="detail-row">
          <span className="detail-label">平台</span>
          <span className="detail-value">{PLATFORM_NAMES[detail.platform] || detail.platform}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">题号</span>
          <span className="detail-value num">{detail.platform_problem_id}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">状态</span>
          <span className="detail-value" style={{ color: STATUS_COLORS[detail.status] }}>
            {STATUS_LABELS[detail.status] || detail.status}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">提交</span>
          <span className="detail-value num">{detail.submission_count} 次（AC {detail.ac_count} 次）</span>
        </div>
        {detail.visitStats && detail.visitStats.total_visits > 0 && (
          <div className="detail-row">
            <span className="detail-label">停留</span>
            <span className="detail-value num">
              {detail.visitStats.total_visits} 次访问，
              累计 {Math.round(detail.visitStats.total_duration / 60)} 分钟
            </span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">首次访问</span>
          <span className="detail-value num">{detail.first_seen_at?.replace('T', ' ').slice(0, 19)}</span>
        </div>
        {detail.last_visited_at && (
          <div className="detail-row">
            <span className="detail-label">最近访问</span>
            <span className="detail-value num">{detail.last_visited_at?.replace('T', ' ').slice(0, 19)}</span>
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
          <h3 className="detail-section-title">提交记录</h3>
          <div className="submissions-list">
            {(detail.submissions ?? []).map((s: SubmissionRecord) => (
              <div key={s.id} className="submission-item">
                <span
                  className="submission-verdict ui-chip"
                  style={{ color: VERDICT_COLORS[s.verdict] || VERDICT_COLORS.UNKNOWN }}
                >
                  <span
                    className="ui-chip-dot"
                    style={{ background: VERDICT_COLORS[s.verdict] || VERDICT_COLORS.UNKNOWN }}
                  />
                  {s.verdict}
                </span>
                <span className="submission-lang">{s.language || '-'}</span>
                <span className="submission-time num">{s.submitted_at?.replace('T', ' ').slice(0, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 删除题目确认：原「删记录 + 删笔记」二连问合并为一个对话框 */}
      <ConfirmDialog
        open={confirmOpen}
        title="删除该题目？"
        description="将删除本题的本地访问与提交记录，此操作不可恢复。"
        confirmText="删除"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmOpen(false)}
      >
        {noteCount > 0 && (
          <label>
            <input
              type="checkbox"
              checked={alsoDeleteNotes}
              onChange={(e) => setAlsoDeleteNotes(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            同时删除本地笔记（<span className="num">{noteCount}</span> 条，文件不可恢复）
          </label>
        )}
      </ConfirmDialog>
    </div>
  )
}
