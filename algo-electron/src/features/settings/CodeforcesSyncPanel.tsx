import { useEffect, useState } from 'react'
import { Button, Input } from '../../components/ui'
import { errorMessage } from '../../shared/errors'
import {
  loadPrimaryCodeforcesAccount,
  syncCodeforcesRatingProfile,
  syncCodeforcesSubmissions,
} from './settingsApi'
import type { CodeforcesAccount } from './settingsTypes'

interface CodeforcesSyncPanelProps {
  onStatsRefresh: () => void | Promise<void>
}

export function CodeforcesSyncPanel({ onStatsRefresh }: CodeforcesSyncPanelProps) {
  const [cfHandle, setCfHandle] = useState('')
  const [ratingHandle, setRatingHandle] = useState('')
  const [ratingInfo, setRatingInfo] = useState<CodeforcesAccount | null>(null)
  const [ratingStatus, setRatingStatus] = useState('')
  const [submissionSyncStatus, setSubmissionSyncStatus] = useState('')

  useEffect(() => {
    void loadPrimaryCodeforcesAccount()
      .then((account) => {
        if (account) {
          setRatingHandle(account.handle)
          setRatingInfo(account)
        }
      })
      // 读失败时若不提示，输入框会是空的，与「还没绑定过 Handle」无法区分。
      .catch((error: unknown) => setRatingStatus(`读取已绑定 Handle 失败: ${errorMessage(error)}`))
  }, [])

  const handleSyncCF = async () => {
    if (!cfHandle.trim()) {
      setSubmissionSyncStatus('请输入 Handle')
      return
    }

    setSubmissionSyncStatus('同步中...')
    try {
      const result = await syncCodeforcesSubmissions(cfHandle.trim())
      if (result.error) {
        setSubmissionSyncStatus(`失败: ${result.error}`)
      } else {
        setSubmissionSyncStatus(`成功: ${result.fetched} 条，新增 ${result.inserted} 条`)
        await onStatsRefresh()
      }
    } catch (e: unknown) {
      setSubmissionSyncStatus(`错误: ${errorMessage(e)}`)
    }
  }

  const handleSyncRating = async () => {
    if (!ratingHandle.trim()) {
      setRatingStatus('请输入 Handle')
      return
    }

    setRatingStatus('同步中...')
    try {
      const { result, account } = await syncCodeforcesRatingProfile(ratingHandle.trim())
      if (result.success) {
        setRatingStatus(`同步成功，peak: ${result.peak}`)
        setRatingInfo(account)
      } else {
        setRatingStatus(`失败: ${result.error}`)
      }
    } catch (e: unknown) {
      setRatingStatus(`错误: ${errorMessage(e)}`)
    }
  }

  return (
    <>
      <div className="settings-section">
        <h3 className="settings-section-title">Codeforces Rating</h3>
        <div className="sync-row">
          <Input
            className="settings-input"
            type="text"
            value={ratingHandle}
            onChange={(e) => setRatingHandle(e.target.value)}
            placeholder="Codeforces Handle"
          />
          <Button variant="primary" onClick={handleSyncRating}>同步 Rating</Button>
        </div>
        {ratingStatus && <div className="sync-status">{ratingStatus}</div>}
        {ratingInfo && (
          <div className="rating-info">
            <span className="rating-current">当前: <span className="num">{ratingInfo.current_rating ?? '-'}</span></span>
            <span className="rating-peak">最高: <span className="num">{ratingInfo.peak_rating ?? '-'}</span></span>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">提交同步</h3>
        <div className="sync-row">
          <Input
            className="settings-input"
            type="text"
            value={cfHandle}
            onChange={(e) => setCfHandle(e.target.value)}
            placeholder="Codeforces Handle"
          />
          <Button variant="primary" onClick={handleSyncCF}>同步 CF</Button>
        </div>
        {submissionSyncStatus && <div className="sync-status">{submissionSyncStatus}</div>}
        <div className="sync-hint">AcWing / 牛客 / VJudge / 洛谷：在浏览器打开提交页面后点工具栏抓取按钮</div>
      </div>
    </>
  )
}
