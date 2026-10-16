import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.ts'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--kl-color-semantic-focus-ring)]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-[var(--kl-color-primary-600)]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[var(--kl-color-neutral-100)]',
        outline: 'border border-border bg-card text-foreground hover:bg-secondary',
        ghost: 'text-foreground hover:bg-secondary',
        destructive: 'bg-[#C42B2B] text-white hover:bg-[#a82424]',
      },
      size: {
        default: 'h-[34px] px-3',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-[42px] px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
