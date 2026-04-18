'use client'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ActivityTable } from '@/components/activity/ActivityTable'
import { api } from '@/lib/api'
import type { Incident, RemediationAction } from '@/lib/types'

export default function ActivityPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [actions, setActions] = useState<RemediationAction[]>([])

  async function load() {
    const [{ incidents }, { actions }] = await Promise.all([
      api.listIncidents(),
      api.listPendingRemediation(),
    ])
    setIncidents(incidents)
    setActions(actions)
  }

  useEffect(() => { load() }, [])

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Activity</h1>
      </div>
      {incidents.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No incidents recorded yet.
        </div>
      ) : (
        <ActivityTable incidents={incidents} actions={actions} onUpdate={load} />
      )}
    </PageShell>
  )
}
