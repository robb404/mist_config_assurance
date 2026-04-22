'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Check, EyeOff, RotateCcw, X } from 'lucide-react'
import { Incident, RemediationAction } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  incidents: Incident[]
  actions: RemediationAction[]
  onUpdate: () => void
}

export function ActivityTable({ incidents, actions, onUpdate }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const actionMap = Object.fromEntries(actions.map(a => [a.incident_id, a]))

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id)
    try { await fn() } finally { setBusy(null); onUpdate() }
  }

  if (incidents.length === 0) {
    return (
      <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center">
        <p className="text-sm text-on-surface/60 mb-1">No incidents match your filters.</p>
        <p className="text-xs text-on-surface/40">
          Drift and auto-remediation events will appear here as scans run.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-container-high">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">Standard</th>
            <th className="px-4 py-3 text-left font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">Site</th>
            <th className="px-4 py-3 text-left font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">SSID</th>
            <th className="px-4 py-3 text-left font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">Opened</th>
            <th className="px-4 py-3 text-left font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">Status</th>
            <th className="px-4 py-3 text-right font-semibold text-on-surface/70 text-[10px] uppercase tracking-[0.1em]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map(inc => {
            const action = actionMap[inc.id]
            const isBusy = busy === inc.id
            const actionFailed = action?.status === 'failed'
            return (
              <tr
                key={inc.id}
                className={cn(
                  'hover:bg-surface-container-low transition-colors',
                  actionFailed && inc.status === 'open' ? 'bg-danger/5' : '',
                )}
              >
                <td className="px-4 py-3 font-medium text-on-surface">{inc.title}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/sites/${inc.site_id}`}
                    className="text-on-surface-variant hover:text-primary hover:underline"
                  >
                    {inc.site_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{inc.ssid ?? '—'}</td>
                <td className="px-4 py-3 text-on-surface/50 text-xs whitespace-nowrap">
                  {new Date(inc.opened_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={inc.status} />
                    {action && inc.status === 'open' && <StatusBadge status={action.status} />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {inc.status === 'open' && action?.status === 'pending' && (
                      <>
                        <IconButton
                          title="Approve fix"
                          tone="healthy"
                          icon={<Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                          disabled={isBusy}
                          onClick={() => run(inc.id, () => api.approveRemediation(action.id))}
                        />
                        <IconButton
                          title="Reject fix"
                          tone="danger"
                          icon={<X className="w-3.5 h-3.5" strokeWidth={2.5} />}
                          disabled={isBusy}
                          onClick={() => run(inc.id, () => api.rejectRemediation(action.id))}
                        />
                      </>
                    )}
                    {inc.status === 'open' && action?.status === 'failed' && (
                      <IconButton
                        title="Retry fix"
                        tone="primary"
                        icon={<RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />}
                        disabled={isBusy}
                        onClick={() => run(inc.id, () => api.retryRemediation(action.id))}
                      />
                    )}
                    {inc.status === 'open' && (
                      <IconButton
                        title="Suppress incident"
                        tone="neutral"
                        icon={<EyeOff className="w-3.5 h-3.5" strokeWidth={2} />}
                        disabled={isBusy}
                        onClick={() => run(inc.id, () => api.suppressIncident(inc.id))}
                      />
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function IconButton({
  title,
  icon,
  tone,
  disabled,
  onClick,
}: {
  title: string
  icon: React.ReactNode
  tone: 'healthy' | 'danger' | 'primary' | 'neutral'
  disabled?: boolean
  onClick: () => void
}) {
  const toneClass: Record<typeof tone, string> = {
    healthy: 'text-on-surface/60 hover:bg-healthy/10 hover:text-healthy',
    danger:  'text-on-surface/60 hover:bg-danger/10 hover:text-danger',
    primary: 'text-on-surface/60 hover:bg-primary/10 hover:text-primary',
    neutral: 'text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface',
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn('p-1.5 rounded-md transition-colors disabled:opacity-30', toneClass[tone])}
    >
      {icon}
    </button>
  )
}
