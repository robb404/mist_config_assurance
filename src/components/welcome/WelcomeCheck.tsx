'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Site } from '@/lib/types'

interface Props {
  onDone: () => void
  onBack: () => void
}

type Status = 'idle' | 'running' | 'done' | 'error'

export function WelcomeCheck({ onDone, onBack }: Props) {
  const [sites, setSites] = useState<Site[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [completed, setCompleted] = useState(0)
  const [totals, setTotals] = useState({ pass: 0, fail: 0, skip: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    api.listSites()
      .then(({ sites }) => setSites(sites.filter(s => s.monitored)))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load sites'))
  }, [])

  async function runAll() {
    if (sites.length === 0) return
    setStatus('running')
    setCompleted(0)
    setTotals({ pass: 0, fail: 0, skip: 0 })
    setError('')
    let pass = 0, fail = 0, skip = 0
    try {
      for (const site of sites) {
        const res = await api.runSite(site.id) as { passed: number; failed: number; skipped: number }
        pass += res.passed ?? 0
        fail += res.failed ?? 0
        skip += res.skipped ?? 0
        setCompleted(prev => prev + 1)
        setTotals({ pass, fail, skip })
      }
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed')
      setStatus('error')
    }
  }

  const pct = sites.length > 0 ? Math.round((completed / sites.length) * 100) : 0

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-primary tracking-tight mb-2">
        Run your first check
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        We'll scan each monitored site against the standards you just added and surface any drift.
      </p>

      <div className="bg-surface-lowest rounded-lg p-6 mb-5">
        {status === 'idle' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-on-surface">
              <strong>{sites.length}</strong> {sites.length === 1 ? 'site' : 'sites'} ready to scan.
            </p>
            {sites.length === 0 && (
              <p className="text-xs text-on-surface/50">
                No monitored sites yet. You can still finish setup — sync and check from the Dashboard.
              </p>
            )}
          </div>
        )}

        {status === 'running' && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-on-surface">
                Checking site <strong>{completed + 1}</strong> of {sites.length}…
              </p>
              <p className="text-xs text-on-surface-variant">{pct}%</p>
            </div>
            <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-signature-gradient transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-on-surface-variant">
              <span><span className="text-healthy font-semibold">{totals.pass}</span> pass</span>
              <span><span className="text-drift font-semibold">{totals.fail}</span> fail</span>
              <span><span className="text-on-surface/60 font-semibold">{totals.skip}</span> skip</span>
            </div>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-3 text-center">
            <p className="font-display text-lg font-semibold text-primary">Scan complete</p>
            <p className="text-sm text-on-surface">
              <span className="text-healthy font-semibold">{totals.pass}</span> passed,{' '}
              <span className="text-drift font-semibold">{totals.fail}</span> drift,{' '}
              <span className="text-on-surface/60 font-semibold">{totals.skip}</span> skipped
              {' '}across <strong>{sites.length}</strong> {sites.length === 1 ? 'site' : 'sites'}.
            </p>
            {totals.fail > 0 && (
              <p className="text-xs text-on-surface-variant">
                Drift shows up on the Dashboard — click into any site to see the details or remediate.
              </p>
            )}
          </div>
        )}

        {status === 'error' && error && (
          <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-on-surface/60 hover:text-on-surface"
          disabled={status === 'running'}
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {status === 'idle' && sites.length > 0 && (
            <Button type="button" onClick={runAll}>Start Scan</Button>
          )}
          {(status === 'idle' && sites.length === 0) || status === 'done' || status === 'error' ? (
            <Button type="button" onClick={onDone}>Go to Dashboard</Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
