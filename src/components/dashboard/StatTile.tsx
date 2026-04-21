import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: number
  tone?: 'neutral' | 'healthy' | 'drift' | 'error'
  active?: boolean
  onClick?: () => void
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  neutral: 'text-on-surface',
  healthy: 'text-healthy',
  drift:   'text-drift',
  error:   'text-danger',
}

const ringClass: Record<NonNullable<Props['tone']>, string> = {
  neutral: 'ring-primary',
  healthy: 'ring-healthy',
  drift:   'ring-drift',
  error:   'ring-danger',
}

export function StatTile({ label, value, tone = 'neutral', active = false, onClick }: Props) {
  const interactive = Boolean(onClick)
  const Element = interactive ? 'button' : 'div'
  return (
    <Element
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'bg-surface-lowest rounded-lg px-5 py-4 text-left transition-all',
        interactive && 'hover:bg-surface-container-high cursor-pointer',
        active && `ring-2 ${ringClass[tone]}`,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface/60">
        {label}
      </p>
      <p className={cn('font-display text-3xl font-semibold mt-1 tracking-tight', toneClass[tone])}>
        {value.toLocaleString()}
      </p>
    </Element>
  )
}
