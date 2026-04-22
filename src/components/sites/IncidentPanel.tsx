'use client'
import { Incident } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  incidents: Incident[]
  onUpdate: () => void
}

export function IncidentPanel({ incidents, onUpdate }: Props) {
  const open = incidents.filter(i => i.status === 'open')
  const verifying = incidents.filter(i => i.status === 'pending_verification')
  const active = [...open, ...verifying]

  async function remediateAll() {
    const { actions } = await api.listPendingRemediation()
    const siteActions = actions.filter(a => open.some(i => i.id === a.incident_id))
    await Promise.all(siteActions.map(a => api.approveRemediation(a.id)))
    onUpdate()
  }

  return (
    <div className="bg-surface-lowest rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
          Active Incidents ({active.length})
        </h2>
        {open.length > 0 && (
          <Button variant="primary" size="sm" onClick={remediateAll}>Remediate All</Button>
        )}
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-on-surface/40">No active incidents.</p>
      ) : (
        <div className="space-y-3">
          {active.map(inc => (
            <div key={inc.id} className="flex items-center justify-between p-3 bg-surface-low rounded-lg">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{inc.title}</p>
                {inc.ssid && <p className="text-xs text-on-surface/50 mt-0.5">SSID: {inc.ssid}</p>}
              </div>
              <StatusBadge status={inc.status} />
            </div>
          ))}
        </div>
      )}

      {verifying.length > 0 && (
        <p className="text-xs text-on-surface/50 mt-3">
          <strong>{verifying.length}</strong> incident{verifying.length === 1 ? '' : 's'} awaiting verification by the next scheduled check.
          Click <strong>Check</strong> on this site to verify now.
        </p>
      )}
    </div>
  )
}
