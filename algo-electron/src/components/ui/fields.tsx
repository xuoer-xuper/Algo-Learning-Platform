import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes } from 'react'

type TestIdProps = { 'data-testid'?: string }

export function Input({ className, 'data-testid': testId = 'ui-input', ...rest }: InputHTMLAttributes<HTMLInputElement> & TestIdProps) {
  return <input className={['ui-input', className].filter(Boolean).join(' ')} data-testid={testId} {...rest} />
}

export function Select({ className, children, 'data-testid': testId = 'ui-select', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & TestIdProps) {
  return (
    <select className={['ui-select', className].filter(Boolean).join(' ')} data-testid={testId} {...rest}>
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
