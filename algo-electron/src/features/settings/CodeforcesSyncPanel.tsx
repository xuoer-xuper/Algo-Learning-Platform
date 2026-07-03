import { useEffect, useState } from 'react'

interface CodeforcesAccount {
  id?: string
  handle: string
  current_rating?: number | null
  peak_rating?: number | null
}

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
    window.electronAPI.getAccounts('codeforces').then((accounts: CodeforcesAccount[]) => {
      if (accounts.length > 0) {
        const account = accounts[0]
        setRatingHandle(account.handle)
        setRatingInfo(account)
      }
    })
  }, [])

  const handleSyncCF = async () => {
    if (!cfHandle.trim()) {
      setSubmissionSyncStatus('请输入 Handle')
      return
    }

    setSubmissionSyncStatus('同步中...')
    try {
      const result = await window.electronAPI.syncCodeforces(cfHandle.trim())
      if (result.error) {
        setSubmissionSyncStatus(`失败: ${result.error}`)
      } else {
        setSubmissionSyncStatus(`成功: ${result.fetched} 条，新增 ${result.inserted} 条`)
        await onStatsRefresh()
      }
    } catch (e: any) {
      setSubmissionSyncStatus(`错误: ${e.message}`)
    }
  }

  const handleSyncRating = async () => {
    if (!ratingHandle.trim()) {
      setRatingStatus('请输入 Handle')
      return
    }

    setRatingStatus('同步中...')
    try {
      await window.electronAPI.bindHandle('codeforces', ratingHandle.trim())
      const result = await window.electronAPI.syncCodeforcesRating(ratingHandle.trim())
      if (result.success) {
        setRatingStatus(`同步成功，peak: ${result.peak}`)
        const account = await window.electronAPI.getAccount('codeforces', ratingHandle.trim())
        setRatingInfo(account)
      } else {
        setRatingStatus(`失败: ${result.error}`)
      }
    } catch (e: any) {
      setRatingStatus(`错误: ${e.message}`)
    }
  }

  return (
    <>
      <div className="settings-section">
        <h3 className="settings-section-title">Codeforces Rating</h3>
        <div className="sync-row">
          <input
            className="settings-input"
            type="text"
            value={ratingHandle}
            onChange={(e) => setRatingHandle(e.target.value)}
            placeholder="Codeforces Handle"
          />
          <button className="settings-save-btn" onClick={handleSyncRating}>同步 Rating</button>
        </div>
        {ratingStatus && <div className="sync-status">{ratingStatus}</div>}
        {ratingInfo && (
          <div className="rating-info">
            <span className="rating-current">当前: {ratingInfo.current_rating ?? '-'}</span>
            <span className="rating-peak">最高: {ratingInfo.peak_rating ?? '-'}</span>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">提交同步</h3>
        <div className="sync-row">
          <input
            className="settings-input"
            type="text"
            value={cfHandle}
            onChange={(e) => setCfHandle(e.target.value)}
            placeholder="Codeforces Handle"
          />
          <button className="settings-save-btn" onClick={handleSyncCF}>同步 CF</button>
        </div>
        {submissionSyncStatus && <div className="sync-status">{submissionSyncStatus}</div>}
        <div className="sync-hint">AcWing / 牛客 / VJudge / 洛谷：在浏览器打开提交页面后点工具栏 ↗ 抓取</div>
      </div>
    </>
  )
}
