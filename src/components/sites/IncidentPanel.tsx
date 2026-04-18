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
          Open Incidents ({open.length})
        </h2>
        {open.length > 0 && (
          <Button variant="primary" size="sm" onClick={remediateAll}>Remediate All</Button>
        )}
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-on-surface/40">No open incidents.</p>
      ) : (
        <div className="space-y-3">
          {open.map(inc => (
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
    </div>
  )
}
