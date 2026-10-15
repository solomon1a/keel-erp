import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.ts'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary',
        className,
      )}
      {...props}
    />
  )
}
