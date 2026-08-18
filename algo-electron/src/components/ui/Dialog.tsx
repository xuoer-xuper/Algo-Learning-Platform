import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open: boolean
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeLabel?: string
  closeOnOverlay?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

/** Internal-page dialog with focus containment and focus restoration. */
export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = '关闭',
  closeOnOverlay = true,
  initialFocusRef,
  className,
  ...rest
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusInitial = () => {
      const requested = initialFocusRef?.current
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(requested ?? first ?? panelRef.current)?.focus()
    }
    const animationFrame = window.requestAnimationFrame(focusInitial)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
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
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [initialFocusRef, onClose, open])

  if (!open) return null

  return createPortal(
    <div
      className="ui-dialog-overlay"
      data-testid="dialog-overlay"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={['ui-dialog', 'ui-dialog-panel', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-testid="dialog"
        {...rest}
      >
        <div className="ui-dialog-header">
          <div id={titleId} className="ui-dialog-title">{title}</div>
          <IconButton icon="close" title={closeLabel} onClick={onClose} />
        </div>
        {description && <div id={descriptionId} className="ui-dialog-desc">{description}</div>}
        <div className="ui-dialog-body">{children}</div>
        {footer && <div className="ui-dialog-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
