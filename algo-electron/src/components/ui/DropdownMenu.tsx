import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './Button'
import { Icon, type IconName } from './icons'

export interface DropdownMenuItem {
  id: string
  label: string
  icon?: IconName
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export interface DropdownMenuProps {
  label: string
  items: readonly DropdownMenuItem[]
  icon?: IconName
  triggerText?: string
  align?: 'start' | 'end'
  disabled?: boolean
  buttonClassName?: string
  onOpenChange?: (open: boolean) => void
}

/** Compact command menu for internal-page controls. */
export function DropdownMenu({
  label,
  items,
  icon = 'more',
  triggerText,
  align = 'end',
  disabled,
  buttonClassName,
  onOpenChange,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const preferredFocusRef = useRef<'first' | 'last'>('first')

  const setMenuOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const triggerButton = () => triggerRef.current?.querySelector<HTMLButtonElement>('button') ?? null
  const enabledItems = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    .filter(item => !item.disabled)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        top: Math.min(window.innerHeight - 8, rect.bottom + 4),
        left: align === 'end'
          ? Math.min(window.innerWidth - 8, rect.right)
          : Math.max(8, rect.left),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, open])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const candidates = enabledItems()
      const candidate = preferredFocusRef.current === 'last'
        ? candidates[candidates.length - 1]
        : candidates[0]
      candidate?.focus()
    })
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  })

  const openWithFocus = (preference: 'first' | 'last') => {
    preferredFocusRef.current = preference
    setMenuOpen(true)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const candidates = enabledItems()
    if (candidates.length === 0) return
    const currentIndex = candidates.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = currentIndex < candidates.length - 1 ? currentIndex + 1 : 0
    else if (event.key === 'ArrowUp') nextIndex = currentIndex > 0 ? currentIndex - 1 : candidates.length - 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = candidates.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      setMenuOpen(false)
      triggerButton()?.focus()
      return
    }
    else if (event.key === 'Tab') {
      setMenuOpen(false)
      return
    }
    if (nextIndex !== null) {
      event.preventDefault()
      candidates[nextIndex]?.focus()
    }
  }

  const triggerProps = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    disabled,
    className: buttonClassName,
    onClick: () => setMenuOpen(!open),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openWithFocus(event.key === 'ArrowUp' ? 'last' : 'first')
      }
    },
    'data-testid': 'dropdown-trigger',
  }

  return (
    <>
      <span ref={triggerRef} className="ui-dropdown-trigger">
        {triggerText
          ? <Button variant="ghost" icon={icon} {...triggerProps}>{triggerText}</Button>
          : <IconButton icon={icon} title={label} {...triggerProps} />}
      </span>
      {open && createPortal(
        <div
          ref={menuRef}
          className={['ui-dropdown-menu', `ui-dropdown-menu-${align}`].join(' ')}
          role="menu"
          aria-label={label}
          data-testid="dropdown-menu"
          style={{ top: position.top, left: position.left }}
          onKeyDown={onMenuKeyDown}
        >
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={[
                'ui-dropdown-item',
                item.danger ? 'ui-dropdown-item-danger' : '',
              ].filter(Boolean).join(' ')}
              disabled={item.disabled}
              data-testid={`dropdown-item-${item.id}`}
              onClick={() => {
                item.onSelect()
                setMenuOpen(false)
                triggerButton()?.focus()
              }}
            >
              {item.icon && <Icon name={item.icon} size={14} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
