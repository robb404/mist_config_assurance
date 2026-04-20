'use client'
import { useState } from 'react'
import { Incident, RemediationAction } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

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

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Standard</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">SSID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Opened</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {incidents.map(inc => {
            const action = actionMap[inc.id]
            const isBusy = busy === inc.id
            return (
              <tr key={inc.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 font-medium">{inc.title}</td>
                <td className="px-4 py-3 text-on-surface/60">{inc.site_name}</td>
                <td className="px-4 py-3 text-on-surface/60">{inc.ssid ?? '—'}</td>
                <td className="px-4 py-3 text-on-surface/40 text-xs">{new Date(inc.opened_at).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                <td className="px-4 py-3 text-right space-x-2">
                  {inc.status === 'open' && action?.status === 'pending' && (
                    <>
                      <Button variant="primary" size="sm" disabled={isBusy}
                        onClick={() => run(inc.id, () => api.approveRemediation(action.id))}>
                        {isBusy ? 'Fixing…' : 'Approve Fix'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={isBusy}
                        onClick={() => run(inc.id, () => api.rejectRemediation(action.id))}>
                        Reject
                      </Button>
                    </>
                  )}
                  {inc.status === 'open' && action?.status === 'failed' && (
                    <Button variant="primary" size="sm" disabled={isBusy}
                      onClick={() => run(inc.id, () => api.retryRemediation(action.id))}>
                      {isBusy ? 'Fixing…' : 'Retry Fix'}
                    </Button>
                  )}
                  {inc.status === 'open' && (
                    <Button variant="ghost" size="sm" disabled={isBusy}
                      onClick={() => run(inc.id, () => api.suppressIncident(inc.id))}>
                      Suppress
                    </Button>
                  )}
                  {action && <StatusBadge status={action.status} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
