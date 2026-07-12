import { useEffect, useRef, useState } from 'react'
import { CoachActions } from './CoachActions'

export interface CoachBubbleProps {
  payload: {
    id: string
    title: string
    message: string
    source: string
    problemId?: string
    eventId?: string
    level?: number
    bubble_type?: 'hint' | 'disclaimer'
  }
  /** 自动消失毫秒数，默认 12000，传 0 表示不自动消失 */
  autoDismissMs?: number
  onClose: () => void
}

const SOURCE_LABEL: Record<string, string> = {
  local: '本地',
  llm: 'LLM',
}

export function CoachBubble({ payload, autoDismissMs = 12000, onClose }: CoachBubbleProps) {
  const [closing, setClosing] = useState(false)
  const dismissTimerRef = useRef<number | undefined>(undefined)
  const isDisclaimer = payload.bubble_type === 'disclaimer'

  useEffect(() => {
    // 免责声明不自动消失
    if (isDisclaimer || autoDismissMs <= 0) return
    dismissTimerRef.current = window.setTimeout(() => {
      handleClose('auto')
    }, autoDismissMs)
    return () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
    }
  }, [payload.id, autoDismissMs, isDisclaimer])

  const handleClose = (reason: 'auto' | 'manual' | 'dismiss' | 'never_today') => {
    if (closing) return
    setClosing(true)
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current)
    onClose()
    void reason
  }

  const handleTriggerHint = () => {
    void window.electronAPI.coachTriggerHint(payload.id)
    handleClose('dismiss')
  }

  const handleDismiss = () => {
    void window.electronAPI.coachDismissHint(payload.id)
    handleClose('dismiss')
  }

  const handleNeverToday = () => {
    void window.electronAPI.coachFeedback({ bubbleId: payload.id, type: 'never_today' })
    handleClose('never_today')
  }

  const handleManualClose = () => {
    handleClose('manual')
  }

  const handleDismissThisTime = () => {
    void window.electronAPI.coachDismissDisclaimer(false)
    handleClose('dismiss')
  }

  const handleDismissPermanently = () => {
    void window.electronAPI.coachDismissDisclaimer(true)
    handleClose('dismiss')
  }

  const handleMouseEnter = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(false)
  }
  const handleMouseLeave = () => {
    void window.electronAPI.coachToggleIgnoreMouseEvents(true)
  }

  return (
    <div className="coach-bubble" role="alert" aria-live="polite"
      onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="coach-bubble-header">
        <span className="coach-bubble-title">{payload.title}</span>
        {!isDisclaimer && (
          <span className="coach-bubble-source" data-source={payload.source}
            title={`来源：${SOURCE_LABEL[payload.source] ?? payload.source}`}>
            {SOURCE_LABEL[payload.source] ?? payload.source}
          </span>
        )}
        <button type="button" className="coach-bubble-close"
          onClick={handleManualClose} aria-label="关闭气泡">✕</button>
      </div>

      {typeof payload.level === 'number' && payload.level > 0 && !isDisclaimer && (
        <span className="coach-bubble-level">L{payload.level}</span>
      )}

      <div className="coach-bubble-message">{payload.message}</div>

      {isDisclaimer ? (
        <div className="coach-actions" data-bubble-id={payload.id}>
          <button type="button" className="coach-action-btn coach-action-secondary"
            onClick={handleDismissThisTime}>
            这次关闭
          </button>
          <button type="button" className="coach-action-btn coach-action-primary"
            onClick={handleDismissPermanently}>
            永久关闭
          </button>
        </div>
      ) : (
        <CoachActions
          bubbleId={payload.id}
          level={payload.level}
          onTriggerHint={handleTriggerHint}
          onDismiss={handleDismiss}
          onNeverToday={handleNeverToday}
        />
      )}

      {!isDisclaimer && autoDismissMs > 0 && (
        <div className="coach-bubble-progress" />
      )}
    </div>
  )
}
