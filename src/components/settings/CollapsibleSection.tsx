'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  /** Optional suffix next to the title (e.g., status indicator) */
  adornment?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({ title, adornment, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="bg-surface-lowest rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-5 group"
      >
        <div className="flex items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
            {title}
          </h2>
          {adornment}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-on-surface/40 group-hover:text-on-surface transition-transform',
            !open && '-rotate-90',
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="px-6 pb-6 -mt-1">
          {children}
        </div>
      )}
    </section>
  )
}
