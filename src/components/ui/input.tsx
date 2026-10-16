import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.ts'

export const fieldControlClass =
  'w-full rounded-full border border-[var(--kl-glass-border)] bg-[var(--kl-glass-bg)] px-4 text-sm text-foreground shadow-xs outline-none backdrop-blur-md focus:border-[var(--kl-color-primary-fill)] focus:ring-[3px] focus:ring-[var(--kl-color-semantic-focus-ring)]'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldControlClass, 'h-10', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldControlClass, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldControlClass, 'min-h-24 rounded-3xl py-3', className)} {...props} />
}
