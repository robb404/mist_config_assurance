'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Site } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  site: Site
  failed: number
  passed: number
  selected: boolean
  onToggleSelect: (id: string) => void
  onRunComplete: () => void
}

export function SiteRow({ site, failed, passed, selected, onToggleSelect, onRunComplete }: Props) {
  const [running, setRunning] = useState(false)

  async function runCheck(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setRunning(true)
    try { await api.runSite(site.id); onRunComplete() }
    finally { setRunning(false) }
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-surface-lowest rounded-lg">
      <label className="flex items-center cursor-pointer select-none">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(site.id)}
          className="w-4 h-4 accent-primary cursor-pointer"
          aria-label={`Select ${site.name}`}
        />
      </label>

      <Link
        href={`/sites/${site.id}`}
        className="flex-1 min-w-0 flex items-center gap-6 hover:opacity-90 transition-opacity"
      >
        <span className="font-medium text-on-surface truncate">{site.name || site.id || 'Unnamed site'}</span>
        <span className="text-xs text-healthy font-medium">{passed} pass</span>
        {site.last_checked_at && (
          <span className="text-xs text-on-surface/40">
            {new Date(site.last_checked_at).toLocaleString()}
          </span>
        )}
      </Link>

      {failed > 0 && (
        <Link
          href="/activity"
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-drift/10 text-drift text-xs rounded-lg font-medium hover:bg-drift/20 transition-colors"
        >
          {failed} drift →
        </Link>
      )}

      {site.check_error && (
        <Link
          href={`/sites/${site.id}`}
          title={site.check_error}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-danger/10 text-danger text-xs rounded-lg font-medium hover:bg-danger/20 transition-colors"
        >
          Check failed →
        </Link>
      )}

      <Button variant="secondary" size="sm" onClick={runCheck} disabled={running}>
        {running ? 'Checking…' : 'Check'}
      </Button>
    </div>
  )
}
