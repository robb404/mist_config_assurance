'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { FindingsTable } from '@/components/sites/FindingsTable'
import { IncidentPanel } from '@/components/sites/IncidentPanel'
import { StatTile } from '@/components/dashboard/StatTile'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Finding, Incident, RemediationAction, Site, Standard } from '@/lib/types'

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [site, setSite] = useState<Site | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [actions, setActions] = useState<RemediationAction[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [running, setRunning] = useState(false)
  const [togglingMonitor, setTogglingMonitor] = useState(false)

  async function load() {
    const [{ sites }, { findings }, { incidents }, { actions }, { standards }] = await Promise.all([
      api.listSites(),
      api.getSiteFindings(id),
      api.listIncidents(),
      api.listPendingRemediation(),
      api.listStandards(),
    ])
    setSite(sites.find(s => s.id === id) ?? null)
    setFindings(findings)
    setIncidents(incidents.filter(i => i.site_id === id))
    setActions(actions.filter(a => a.site_id === id))
    setStandards(standards)
  }

  async function runCheck() {
    setRunning(true)
    try { await api.runSite(id); await load() }
    finally { setRunning(false) }
  }

  async function toggleMonitor() {
    if (!site) return
    setTogglingMonitor(true)
    try {
      await api.toggleMonitored(id, !site.monitored)
      await load()
    } finally {
      setTogglingMonitor(false)
    }
  }

  useEffect(() => { load() }, [id])

  const passed  = findings.filter(f => f.status === 'pass').length
  const failed  = findings.filter(f => f.status === 'fail').length
  const skipped = findings.filter(f => f.status === 'skip').length
  const openIncidents = incidents.filter(i => i.status === 'open').length

  return (
    <PageShell>
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-on-surface/60 hover:text-on-surface transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="min-w-0">
          <p className="label-overline">Site</p>
          <h1 className="font-display text-2xl font-semibold text-primary tracking-tight truncate">
            {site?.name ?? id}
          </h1>
          <p className="text-xs text-on-surface/50 mt-1">
            {site?.last_checked_at
              ? `Last checked ${new Date(site.last_checked_at).toLocaleString()}`
              : 'Never checked'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleMonitor}
            disabled={togglingMonitor || !site}
            className={cn(
              'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50',
              site?.monitored
                ? 'bg-healthy/10 text-healthy hover:bg-healthy/20'
                : 'bg-surface-high text-on-surface/60 hover:bg-surface-highest',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', site?.monitored ? 'bg-healthy' : 'bg-on-surface/40')} />
            {site?.monitored ? 'Monitored' : 'Not monitored'}
          </button>
          <Button variant="primary" size="sm" onClick={runCheck} disabled={running}>
            {running ? 'Checking…' : 'Check'}
          </Button>
        </div>
      </div>

      {site?.check_error && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 bg-danger/10 text-danger rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 text-xs">
            <p className="font-semibold mb-0.5">Last check failed</p>
            <p className="text-on-surface/80 break-words font-mono">{site.check_error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatTile label="Pass"      value={passed}        tone="healthy" />
        <StatTile label="Fail"      value={failed}        tone="drift" />
        <StatTile label="Skip"      value={skipped}       tone="neutral" />
        <StatTile label="Incidents" value={openIncidents} tone="error" />
      </div>

      <section className="mb-8">
        <IncidentPanel incidents={incidents} onUpdate={load} />
      </section>

      <section className="bg-surface-lowest rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
            Findings ({findings.length})
          </h2>
        </div>
        <FindingsTable
          findings={findings}
          standards={standards}
          incidents={incidents}
          actions={actions}
          onUpdate={load}
        />
      </section>
    </PageShell>
  )
}
