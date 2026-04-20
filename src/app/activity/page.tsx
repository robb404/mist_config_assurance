'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { ActivityTable } from '@/components/activity/ActivityTable'
import { api } from '@/lib/api'
import type { Incident, RemediationAction } from '@/lib/types'

export default function ActivityPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [actions, setActions] = useState<RemediationAction[]>([])

  const load = useCallback(async () => {
    const [{ incidents }, { actions }] = await Promise.all([
      api.listIncidents(),
      api.listPendingRemediation(),
    ])
    setIncidents(incidents)
    setActions(actions)
    router.refresh()
  }, [router])

  useEffect(() => {
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

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
