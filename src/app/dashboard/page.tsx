'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { SiteRow } from '@/components/dashboard/SiteRow'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Site } from '@/lib/types'

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [runs, setRuns] = useState<Record<string, { passed: number; failed: number }>>({})
  const [syncing, setSyncing] = useState(false)

  async function load() {
    const { sites } = await api.listSites()
    setSites(sites)
    const runMap: Record<string, { passed: number; failed: number }> = {}
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

  useEffect(() => { load() }, [])

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="label-overline">Overview</p>
          <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Dashboard</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={syncSites} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Sites'}
        </Button>
      </div>

      {sites.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No sites yet. <button onClick={syncSites} className="text-primary underline">Sync from Mist</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map(site => (
            <Link key={site.id} href={`/sites/${site.id}`} className="block hover:opacity-90 transition-opacity">
              <SiteRow
                site={site}
                passed={runs[site.id]?.passed ?? 0}
                failed={runs[site.id]?.failed ?? 0}
                onRunComplete={load}
              />
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  )
}
