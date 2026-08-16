import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes } from 'react'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={['ui-select', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={['ui-input', 'ui-textarea', className].filter(Boolean).join(' ')} {...rest} />
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 是否自带内边距（默认 true） */
  padded?: boolean
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  const classes = ['ui-card', padded ? 'ui-card-pad' : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
