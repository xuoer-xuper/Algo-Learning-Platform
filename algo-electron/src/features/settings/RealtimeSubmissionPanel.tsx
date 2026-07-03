import { PLATFORM_NAMES } from '../../shared/display'
import type { RealtimeSubmissionStatus } from './settingsTypes'

interface RealtimeSubmissionPanelProps {
  status: RealtimeSubmissionStatus | null
  statusText: string
  onRefresh: () => void
}

function formatStatusTime(value?: string) {
  if (!value) return '暂无'
  return value.replace('T', ' ').slice(0, 19)
}

function hookStatusLabel(status?: RealtimeSubmissionStatus['lastHook']) {
  if (!status) return '尚未注入'
  if (status.status === 'success') return '已注入'
  if (status.status === 'skipped') return `已跳过：${status.reason ?? '未知原因'}`
  return `失败：${status.error ?? '未知错误'}`
}

function detectionStatusLabel(status?: RealtimeSubmissionStatus['lastDetection']) {
  if (!status) return '尚未检测到提交'
  if (status.inserted) return '已写入提交记录'
  return status.error ? `未写入：${status.error}` : '未写入：重复或无有效结果'
}

function pageStatusLabel(status?: RealtimeSubmissionStatus['lastPage']) {
  if (!status) return '尚未看到页面'
  if (status.realtimeSupported) return `已识别：${status.realtimeAdapterId}`
  return '当前页面不支持实时监听'
}

export function RealtimeSubmissionPanel({
  status,
  statusText,
  onRefresh,
}: RealtimeSubmissionPanelProps) {
  return (
    <div className="settings-section">
      <div className="settings-section-header-row">
        <h3 className="settings-section-title">实时监听诊断</h3>
        <button className="site-toggle" onClick={onRefresh}>刷新</button>
      </div>
      <div className="realtime-status-card">
        <div className="realtime-status-row">
          <span className="realtime-status-label">IPC</span>
          <span className={status?.ipcRegistered ? 'realtime-status-ok' : 'realtime-status-muted'}>
            {status?.ipcRegistered ? '已注册' : '未注册'}
          </span>
        </div>
        <div className="realtime-status-row">
          <span className="realtime-status-label">页面</span>
          <span className={status?.lastPage?.realtimeSupported ? 'realtime-status-ok' : 'realtime-status-muted'}>
            {pageStatusLabel(status?.lastPage)}
          </span>
        </div>
        {status?.lastPage && (
          <div className="realtime-status-detail">
            {formatStatusTime(status.lastPage.at)}
            <br />
            {status.lastPage.url}
          </div>
        )}
        <div className="realtime-status-row">
          <span className="realtime-status-label">Hook</span>
          <span className={status?.lastHook?.status === 'success' ? 'realtime-status-ok' : 'realtime-status-muted'}>
            {hookStatusLabel(status?.lastHook)}
          </span>
        </div>
        {status?.lastHook && (
          <div className="realtime-status-detail">
            {status.lastHook.adapterId} · {formatStatusTime(status.lastHook.at)}
            <br />
            {status.lastHook.url}
          </div>
        )}
        <div className="realtime-status-row">
          <span className="realtime-status-label">提交</span>
          <span className={status?.lastDetection?.inserted ? 'realtime-status-ok' : 'realtime-status-muted'}>
            {detectionStatusLabel(status?.lastDetection)}
          </span>
        </div>
        {status?.lastDetection && (
          <div className="realtime-status-detail">
            {formatStatusTime(status.lastDetection.at)}
            {status.lastDetection.senderUrl ? ` · ${status.lastDetection.senderUrl}` : ''}
            {(status.lastDetection.platform || status.lastDetection.verdict || status.lastDetection.problemId) && (
              <>
                <br />
                {[status.lastDetection.platform, status.lastDetection.verdict, status.lastDetection.problemId]
                  .filter(Boolean)
                  .join(' · ')}
              </>
            )}
          </div>
        )}
        {statusText && <div className="sync-status">{statusText}</div>}
        <div className="sync-hint">
          支持站点：
          {(status?.supportedAdapterIds || [])
            .map(id => PLATFORM_NAMES[id] || id)
            .join(' / ') || '暂无'}
        </div>
        <div className="sync-hint">验收实时监听：打开任一支持站点题目页提交一次，等待最终评测后点刷新。</div>
      </div>
    </div>
  )
}
