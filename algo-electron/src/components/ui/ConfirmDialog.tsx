import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
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
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    return () => {
      const previousFocus = restoreFocusRef.current
      restoreFocusRef.current = null
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const animationFrame = window.requestAnimationFrame(() => {
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
      ;(panelRef.current?.querySelector<HTMLElement>('[data-testid="confirm-ok"]')
        ?? focusable[0]
        ?? panelRef.current)?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="ui-dialog-overlay" data-testid="confirm-overlay" onClick={onCancel}>
      <div
        ref={panelRef}
        className="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="confirm-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div id={titleId} className="ui-dialog-title">{title}</div>
        {description && <div className="ui-dialog-desc">{description}</div>}
        {children && <div className="ui-dialog-extra">{children}</div>}
        <div className="ui-dialog-actions">
          <Button variant="ghost" onClick={onCancel} data-testid="confirm-cancel">
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-testid="confirm-ok">
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
