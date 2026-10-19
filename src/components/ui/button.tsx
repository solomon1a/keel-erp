import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.ts'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--kl-color-semantic-focus-ring)]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--kl-color-primary-fill)] text-[var(--kl-color-primary-on)] shadow-sm hover:bg-[var(--kl-color-primary-600)]',
        secondary: 'border border-[var(--kl-glass-border)] bg-[var(--kl-color-primary-100)] text-[var(--kl-color-primary-800)] hover:bg-[var(--kl-color-primary-200)]',
        outline: 'border border-[var(--kl-glass-border)] bg-[var(--kl-glass-bg)] text-foreground backdrop-blur-md hover:bg-secondary',
        ghost: 'text-foreground shadow-none hover:bg-secondary',
        destructive: 'bg-[#B42323] text-white hover:bg-[#931c1c]',
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
