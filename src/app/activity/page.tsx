'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { ActivityTable } from '@/components/activity/ActivityTable'
import { StatTile } from '@/components/dashboard/StatTile'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Incident, RemediationAction } from '@/lib/types'

type Filter = 'all' | 'open' | 'failed' | 'resolved' | 'suppressed'

export default function ActivityPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [actions, setActions] = useState<RemediationAction[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')

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

  const actionMap = Object.fromEntries(actions.map(a => [a.incident_id, a]))
  const failedIds = new Set(
    incidents
      .filter(i => i.status === 'open' && actionMap[i.id]?.status === 'failed')
      .map(i => i.id),
  )

  const counts = {
    open:       incidents.filter(i => i.status === 'open').length,
    failed:     failedIds.size,
    resolved:   incidents.filter(i => i.status === 'resolved').length,
    suppressed: incidents.filter(i => i.status === 'suppressed').length,
  }

  function selectFilter(next: Filter) {
    setFilter(prev => prev === next ? 'all' : next)
  }

  const q = search.trim().toLowerCase()

  const visible = incidents.filter(inc => {
    if (q) {
      const hay = `${inc.title} ${inc.site_name} ${inc.ssid ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filter === 'all')        return true
    if (filter === 'open')       return inc.status === 'open'
    if (filter === 'failed')     return failedIds.has(inc.id)
    if (filter === 'resolved')   return inc.status === 'resolved'
    if (filter === 'suppressed') return inc.status === 'suppressed'
    return true
  })

  function downloadCsv() {
    const rows = [
      ['Standard', 'Site', 'SSID', 'Opened', 'Status', 'Resolved', 'Action Status', 'Error'],
      ...visible.map(inc => {
        const a = actionMap[inc.id]
        return [
          inc.title,
          inc.site_name,
          inc.ssid ?? '',
          inc.opened_at,
          inc.status,
          inc.resolved_at ?? '',
          a?.status ?? '',
          a?.error_detail ?? '',
        ]
      }),
    ]
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <PageShell>
      <div className="h-full flex flex-col">
        <div className="mb-8">
          <p className="label-overline">Activity</p>
          <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Incidents</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatTile label="Open"       value={counts.open}       tone="drift"   active={filter === 'open'}       onClick={() => selectFilter('open')} />
          <StatTile label="Failed"     value={counts.failed}     tone="error"   active={filter === 'failed'}     onClick={() => selectFilter('failed')} />
          <StatTile label="Resolved"   value={counts.resolved}   tone="healthy" active={filter === 'resolved'}   onClick={() => selectFilter('resolved')} />
          <StatTile label="Suppressed" value={counts.suppressed} tone="neutral" active={filter === 'suppressed'} onClick={() => selectFilter('suppressed')} />
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search standard, site, SSID…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-lowest rounded-lg outline outline-1 outline-surface-container-high focus:outline-primary"
            />
          </div>
          <p className="text-xs text-on-surface/50 whitespace-nowrap">
            {filter === 'all' && !q
              ? `${visible.length} ${visible.length === 1 ? 'incident' : 'incidents'}`
              : `Showing ${visible.length} of ${incidents.length}`}
          </p>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={visible.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5 inline" strokeWidth={2} />
            Export CSV
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <ActivityTable incidents={visible} actions={actions} onUpdate={load} />
        </div>
      </div>
    </PageShell>
  )
}

function csvCell(v: string): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
