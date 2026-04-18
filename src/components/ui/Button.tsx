import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-opacity disabled:opacity-50',
        size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        variant === 'primary' && 'bg-signature-gradient text-on-primary',
        variant === 'secondary' && 'bg-surface-highest text-on-surface',
        variant === 'ghost' && 'text-primary hover:bg-surface-low',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
