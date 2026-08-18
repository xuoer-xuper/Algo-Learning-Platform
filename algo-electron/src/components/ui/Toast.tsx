import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './Button'

export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger'

export interface FeedbackAction {
  label: string
  onClick: () => void
}

export interface ToastProps {
  open: boolean
  message: ReactNode
  title?: ReactNode
  tone?: FeedbackTone
  duration?: number
  action?: FeedbackAction
  onClose: () => void
}

/** Short-lived, non-blocking feedback for internal pages. */
export function Toast({
  open,
  message,
  title,
  tone = 'info',
  duration = 4_000,
  action,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!open || duration <= 0) return
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [duration, onClose, open])

  if (!open) return null
  const assertive = tone === 'warning' || tone === 'danger'

  return createPortal(
    <div className="ui-toast-viewport" aria-live={assertive ? 'assertive' : 'polite'}>
      <div
        className={['ui-toast', `ui-toast-${tone}`].join(' ')}
        role={assertive ? 'alert' : 'status'}
        data-testid="toast"
      >
        <div className="ui-toast-content">
          {title && <div className="ui-toast-title">{title}</div>}
          <div className="ui-toast-message">{message}</div>
        </div>
        {action && (
          <Button size="sm" variant="ghost" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        <IconButton icon="close" title="关闭通知" size={13} onClick={onClose} />
      </div>
    </div>,
    document.body,
  )
}
