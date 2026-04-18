type Status = 'pass' | 'fail' | 'skip' | 'open' | 'resolved' | 'suppressed' | 'pending' | 'success' | 'failed'

const map: Record<Status, string> = {
  pass:        'bg-healthy/10 text-healthy',
  fail:        'bg-drift/10 text-drift',
  skip:        'bg-surface-base text-on-surface/50',
  open:        'bg-drift/10 text-drift',
  resolved:    'bg-healthy/10 text-healthy',
  suppressed:  'bg-surface-base text-on-surface/50',
  pending:     'bg-primary/10 text-primary',
  success:     'bg-healthy/10 text-healthy',
  failed:      'bg-error/10 text-error',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium uppercase tracking-wide ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}
