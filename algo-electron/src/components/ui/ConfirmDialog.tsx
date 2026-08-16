import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认键红色描边样式 */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** 附加内容（如「同时删除笔记」勾选项） */
  children?: ReactNode
}

/**
 * 统一确认对话框（B1.4）：替代原生 window.confirm。
 * 浮层归类（计划 §4 三分法）：仅可在内部页/弹层上下文使用（view 已摘除），
 * web 标签激活时的询问一律走通知条，禁止用本组件。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="ui-dialog-overlay" data-testid="confirm-overlay" onClick={onCancel}>
      <div
        className="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-dialog-title">{title}</div>
        {description && <div className="ui-dialog-desc">{description}</div>}
        {children && <div className="ui-dialog-extra">{children}</div>}
        <div className="ui-dialog-actions">
          <Button variant="ghost" onClick={onCancel} data-testid="confirm-cancel">
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-testid="confirm-ok" autoFocus>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
