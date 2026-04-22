'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { SiteRow } from '@/components/dashboard/SiteRow'
import { StatTile } from '@/components/dashboard/StatTile'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Site } from '@/lib/types'

type RunCounts = { passed: number; failed: number }
type Filter    = 'all' | 'healthy' | 'drift' | 'error'

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [runs, setRuns] = useState<Record<string, RunCounts>>({})
  const [standardsCount, setStandardsCount] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [orgConnected, setOrgConnected] = useState<boolean | null>(null)

  async function load() {
    try {
      await api.getOrg()
      setOrgConnected(true)
    } catch {
      setOrgConnected(false)
      return
    }
    const [{ sites }, { standards }] = await Promise.all([
      api.listSites(),
      api.listStandards(),
    ])
    setSites(sites)
    setStandardsCount(standards.length)
    const runMap: Record<string, RunCounts> = {}
    await Promise.all(sites.map(async s => {
      try {
        const { findings } = await api.getSiteFindings(s.id)
        runMap[s.id] = {
          passed: findings.filter(f => f.status === 'pass').length,
          failed: findings.filter(f => f.status === 'fail').length,
        }
      } catch {
        runMap[s.id] = { passed: 0, failed: 0 }
      }
    }))
    setRuns(runMap)
  }

  async function syncSites() {
    setSyncing(true)
    try { await api.syncSites(); await load() }
    finally { setSyncing(false) }
  }

  async function checkBatch() {
    const ids = selected.size > 0 ? [...selected] : visibleSites.map(s => s.id)
    if (ids.length === 0) return
    setChecking(true)
    try {
      await Promise.all(ids.map(id => api.runSite(id)))
      await load()
      if (selected.size > 0) setSelected(new Set())
    } finally {
      setChecking(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectFilter(next: Filter) {
    setFilter(prev => prev === next ? 'all' : next)
    setSelected(new Set())
  }

  useEffect(() => { load() }, [])

  const total    = sites.length
  const errors   = sites.filter(s => !!s.check_error).length
  const drifting = sites.filter(s => !s.check_error && (runs[s.id]?.failed ?? 0) > 0).length
  const healthy  = total - drifting - errors

  const q = search.trim().toLowerCase()

  const visibleSites = sites.filter(s => {
    if (q && !s.name.toLowerCase().includes(q)) return false
    const failed = runs[s.id]?.failed ?? 0
    if (filter === 'all')     return true
    if (filter === 'error')   return !!s.check_error
    if (filter === 'drift')   return !s.check_error && failed > 0
    if (filter === 'healthy') return !s.check_error && failed === 0
    return true
  })

  const filterLabel = filter === 'healthy' ? 'Healthy' : filter === 'drift' ? 'Drift' : 'Errors'
  const checkLabel = checking
    ? 'Checking…'
    : selected.size > 0
      ? `Check (${selected.size})`
      : filter === 'all' ? 'Check All' : `Check ${filterLabel}`

  return (
    <PageShell>
      <div className="h-full flex flex-col">
        <div className="mb-8">
          <p className="label-overline">Overview</p>
          <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Dashboard</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatTile label="Sites"   value={total}    tone="neutral" active={filter === 'all'}     onClick={() => setFilter('all')} />
          <StatTile label="Healthy" value={healthy}  tone="healthy" active={filter === 'healthy'} onClick={() => selectFilter('healthy')} />
          <StatTile label="Drift"   value={drifting} tone="drift"   active={filter === 'drift'}   onClick={() => selectFilter('drift')} />
          <StatTile label="Errors"  value={errors}   tone="error"   active={filter === 'error'}   onClick={() => selectFilter('error')} />
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" strokeWidth={2} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${total} ${total === 1 ? 'site' : 'sites'}…`}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-lowest rounded-lg outline outline-1 outline-surface-container-high focus:outline-primary"
            />
          </div>
          <p className="text-xs text-on-surface/50 whitespace-nowrap">
            {filter === 'all' && !q
              ? `${visibleSites.length} ${visibleSites.length === 1 ? 'site' : 'sites'}`
              : `Showing ${visibleSites.length} of ${total}`}
          </p>
          <div className="flex-1" />
          <Button variant="primary" size="sm" onClick={checkBatch} disabled={checking || visibleSites.length === 0}>
            {checkLabel}
          </Button>
          <Button variant="secondary" size="sm" onClick={syncSites} disabled={syncing || checking}>
            {syncing ? 'Syncing…' : 'Sync Sites'}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {orgConnected === false ? (
            <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center space-y-3">
              <p className="text-sm text-on-surface">
                Welcome. Let's get your Mist org connected.
              </p>
              <Link href="/welcome">
                <Button variant="primary" size="sm">Start setup →</Button>
              </Link>
            </div>
          ) : sites.length === 0 ? (
            <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center space-y-3">
              <p className="text-sm text-on-surface">
                Your Mist org is connected. Next, sync your sites.
              </p>
              <Button variant="primary" size="sm" onClick={syncSites} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync Sites'}
              </Button>
            </div>
          ) : standardsCount === 0 ? (
            <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center space-y-3">
              <p className="text-sm text-on-surface">
                {sites.length} {sites.length === 1 ? 'site' : 'sites'} synced. Add standards to start checking for drift.
              </p>
              <Link href="/standards">
                <Button variant="primary" size="sm">Add standards →</Button>
              </Link>
            </div>
          ) : sites.every(s => !s.last_checked_at) ? (
            <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center space-y-3">
              <p className="text-sm text-on-surface">
                Ready to run your first drift check across {sites.length} {sites.length === 1 ? 'site' : 'sites'}.
              </p>
              <Button variant="primary" size="sm" onClick={checkBatch} disabled={checking}>
                {checking ? 'Checking…' : 'Check All'}
              </Button>
            </div>
          ) : visibleSites.length === 0 ? (
            <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
              {q ? 'No sites match your search.' : `No ${filter} sites.`}
              {' '}
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="text-primary underline"
              >
                Reset
              </button>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {visibleSites.map(site => (
                <SiteRow
                  key={site.id}
                  site={site}
                  passed={runs[site.id]?.passed ?? 0}
                  failed={runs[site.id]?.failed ?? 0}
                  selected={selected.has(site.id)}
                  onToggleSelect={toggleSelect}
                  onRunComplete={load}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
