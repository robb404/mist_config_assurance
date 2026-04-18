'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { FindingsTable } from '@/components/sites/FindingsTable'
import { IncidentPanel } from '@/components/sites/IncidentPanel'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Finding, Incident, Standard } from '@/lib/types'

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [findings, setFindings] = useState<Finding[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [running, setRunning] = useState(false)

  async function load() {
    const [{ findings }, { incidents }, { standards }] = await Promise.all([
      api.getSiteFindings(id),
      api.listIncidents(),
      api.listStandards(),
    ])
    setFindings(findings)
    setIncidents(incidents.filter(i => i.site_id === id))
    setStandards(standards)
  }

  async function runCheck() {
    setRunning(true)
    try { await api.runSite(id); await load() }
    finally { setRunning(false) }
  }

  useEffect(() => { load() }, [id])

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">{id}</h1>
        <Button onClick={runCheck} disabled={running}>
          {running ? 'Running…' : 'Run Check'}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7">
          <FindingsTable findings={findings} standards={standards} />
        </div>
        <div className="col-span-5">
          <IncidentPanel incidents={incidents} onUpdate={load} />
        </div>
      </div>
    </PageShell>
  )
}
