'use client'
import { useState } from 'react'
import { Site } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  site: Site
  failed: number
  passed: number
  onRunComplete: () => void
}

export function SiteRow({ site, failed, passed, onRunComplete }: Props) {
  const [running, setRunning] = useState(false)

  async function runCheck() {
    setRunning(true)
    try { await api.runSite(site.id); onRunComplete() }
    finally { setRunning(false) }
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 bg-surface-lowest rounded-lg">
      <div className="flex items-center gap-6 min-w-0">
        <span className="font-medium text-on-surface truncate">{site.name}</span>
        <span className="text-xs text-healthy font-medium">{passed} pass</span>
        {failed > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-drift/10 text-drift text-xs rounded-lg font-medium">
            {failed} drift
          </span>
        )}
        {site.last_checked_at && (
          <span className="text-xs text-on-surface/40">
            {new Date(site.last_checked_at).toLocaleString()}
          </span>
        )}
        {site.check_error && (
          <span
            title={site.check_error}
            className="text-xs text-drift font-medium cursor-help"
          >
            Check failed ⚠
          </span>
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={runCheck} disabled={running}>
        {running ? 'Running…' : 'Run Check'}
      </Button>
    </div>
  )
}
