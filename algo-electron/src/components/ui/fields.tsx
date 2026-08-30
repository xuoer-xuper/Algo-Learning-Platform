import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes } from 'react'

type TestIdProps = { 'data-testid'?: string }

export function Input({ className, 'data-testid': testId = 'ui-input', ...rest }: InputHTMLAttributes<HTMLInputElement> & TestIdProps) {
  return <input className={['ui-input', className].filter(Boolean).join(' ')} data-testid={testId} {...rest} />
}

/**
 * size 与原生 `<select size>`（可见行数，number）同名，这里按设计系统口径覆盖，
 * 因此必须 Omit 掉原生的再声明 —— 接口继承不能把 number 收窄成字符串联合。
 * 组件内已把 size 解构出去，不会作为属性落到 DOM 上。
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>, TestIdProps {
  /** 尺寸：md 为默认 30px，sm 为密集面板用的 24px（与 Button 的 md/sm 同口径） */
  size?: 'md' | 'sm'
}

export function Select({ size = 'md', className, children, 'data-testid': testId = 'ui-select', ...rest }: SelectProps) {
  const classes = ['ui-select', size === 'sm' ? 'ui-select-sm' : '', className].filter(Boolean).join(' ')
  return (
    <select className={classes} data-testid={testId} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, 'data-testid': testId = 'ui-textarea', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & TestIdProps) {
  return <textarea className={['ui-input', 'ui-textarea', className].filter(Boolean).join(' ')} data-testid={testId} {...rest} />
}

export interface CardProps extends HTMLAttributes<HTMLDivElement>, TestIdProps {
  /** 是否自带内边距（默认 true） */
  padded?: boolean
}

export function Card({ padded = true, className, children, 'data-testid': testId = 'ui-card', ...rest }: CardProps) {
  const classes = ['ui-card', padded ? 'ui-card-pad' : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes} data-testid={testId} {...rest}>
      {children}
    </div>
  )
}
