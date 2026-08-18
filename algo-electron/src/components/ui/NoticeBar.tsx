import type { ReactNode } from 'react'
import { Button, IconButton } from './Button'
import type { FeedbackAction, FeedbackTone } from './Toast'

export interface NoticeBarProps {
  children: ReactNode
  title?: ReactNode
  tone?: FeedbackTone
  action?: FeedbackAction
  dismissLabel?: string
  onDismiss?: () => void
  className?: string
}

/** Layout-yielding notice for active web-tab workflows; never rendered as an overlay. */
export function NoticeBar({
  children,
  title,
  tone = 'info',
  action,
  dismissLabel = '关闭通知',
  onDismiss,
  className,
}: NoticeBarProps) {
  const assertive = tone === 'warning' || tone === 'danger'
  return (
    <div
      className={['ui-notice-bar', `ui-notice-bar-${tone}`, className].filter(Boolean).join(' ')}
      role={assertive ? 'alert' : 'status'}
      data-testid="notice-bar"
    >
      <div className="ui-notice-content">
        {title && <span className="ui-notice-title">{title}</span>}
        <span className="ui-notice-message">{children}</span>
      </div>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <IconButton icon="close" title={dismissLabel} size={13} onClick={onDismiss} />
      )}
    </div>
  )
}
