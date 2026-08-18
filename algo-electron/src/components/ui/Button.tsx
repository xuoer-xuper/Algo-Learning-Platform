import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'sm'
type TestIdProps = { 'data-testid'?: string }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, TestIdProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  children?: ReactNode
}

/** 通用按钮：primary/secondary/ghost/danger 四变体（B1.2） */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  type,
  'data-testid': testId = 'ui-button',
  ...rest
}: ButtonProps) {
  const classes = ['ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, className].filter(Boolean).join(' ')
  return (
    <button type={type ?? 'button'} className={classes} data-testid={testId} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, TestIdProps {
  icon: IconName
  /** 无文字按钮必须给可达性标题 */
  title: string
  size?: number
  danger?: boolean
}

/** 纯图标按钮：title 必填（tooltip + aria-label） */
export function IconButton({
  icon,
  title,
  size = 16,
  danger,
  className,
  type,
  'data-testid': testId = 'ui-icon-button',
  ...rest
}: IconButtonProps) {
  const classes = ['ui-icon-btn', danger ? 'ui-icon-btn-danger' : '', className].filter(Boolean).join(' ')
  return (
    <button type={type ?? 'button'} className={classes} title={title} aria-label={title} data-testid={testId} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  )
}
