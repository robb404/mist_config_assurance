'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { OrgUsage } from '@/lib/types'
import { CollapsibleSection } from './CollapsibleSection'

const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'
const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30'

export function ApiUsagePanel() {
  const [usage, setUsage] = useState<OrgUsage | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getOrgUsage().then(setUsage).catch(() => {})
  }, [])

  async function generateSecret() {
    setGenerating(true)
    setError('')
    try {
      const res = await api.setupWebhook()
      setSecret(res.webhook_secret)
      setUsage(await api.getOrgUsage())
    } catch {
      setError('Failed to generate secret.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  if (!usage) return null

  const usedPct   = Math.min(100, Math.round(usage.calls_used_this_hour / 5000 * 100))
  const checkPct  = Math.min(100, Math.round(usage.calls_per_hour / 5000 * 100))

  return (
    <CollapsibleSection title="API Usage">
      <div className="space-y-5">

      {/* Live counter */}
      <div>
        <p className="text-xs text-on-surface/60 mb-1">
          Calls used this hour
        </p>
        <p className="text-sm font-medium text-on-surface">
          {usage.calls_used_this_hour.toLocaleString()} / 5,000
        </p>
        <div className="mt-2 h-2 bg-surface-high rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-danger' : 'bg-primary'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Polling mode stats */}
      {usage.mode === 'polling' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-on-surface/60 mb-1">Estimated check calls / hour</p>
            <p className={`text-sm font-medium ${usage.interval_safe ? 'text-on-surface' : 'text-danger'}`}>
              {usage.calls_per_hour.toLocaleString()} / 4,000 check budget
            </p>
            <div className="mt-2 h-2 bg-surface-high rounded-full overflow-hidden flex">
              <div
                className={`h-full ${usage.interval_safe ? 'bg-primary' : 'bg-danger'}`}
                style={{ width: `${checkPct}%` }}
              />
              <div className="h-full bg-warning/60" style={{ width: '20%' }} />
            </div>
            <div className="flex text-xs text-on-surface/40 mt-1 gap-3">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-primary" /> Checks</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-warning/60" /> Remediation reserve</span>
            </div>
          </div>

          {!usage.interval_safe && (
            <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
              Current interval is too short for {usage.site_count} sites.
              Minimum safe interval: <strong>{usage.min_interval_mins} min</strong>.
            </div>
          )}

          {usage.recommend_webhooks && (
            <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              At {usage.site_count} sites, webhook mode is recommended for reliable drift detection
              without long polling intervals.
            </div>
          )}

          <p className="text-xs text-on-surface/50">
            Minimum safe interval for {usage.site_count} monitored sites:{' '}
            <strong>{usage.min_interval_mins} min</strong>
          </p>
        </div>
      )}

      {/* Webhook mode stats + setup */}
      {usage.mode === 'webhook' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${usage.webhook_configured ? 'bg-healthy' : 'bg-on-surface/30'}`} />
            <span className="text-sm text-on-surface">
              {usage.webhook_configured ? 'Webhook secret configured' : 'Webhook not set up yet'}
            </span>
          </div>

          {usage.webhook_url && (
            <div>
              <label className={labelCls}>Webhook URL (paste into Mist)</label>
              <div className="flex gap-2">
                <input readOnly value={usage.webhook_url} className={inputCls} />
                <button
                  onClick={() => copyToClipboard(usage.webhook_url!)}
                  className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap"
                >
                  {copying ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Webhook Secret</label>
            {secret ? (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input readOnly value={secret} className={`${inputCls} font-mono text-xs`} />
                  <button
                    onClick={() => copyToClipboard(secret)}
                    className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap"
                  >
                    {copying ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-on-surface/50">Save this now — it won't be shown again.</p>
              </div>
            ) : (
              <button
                onClick={generateSecret}
                disabled={generating}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {generating ? 'Generating…' : usage.webhook_configured ? 'Regenerate Secret' : 'Generate Secret'}
              </button>
            )}
          </div>

          <div className="bg-surface-low rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-on-surface/70 uppercase tracking-wide">Mist Setup Steps</p>
            <ol className="text-xs text-on-surface/70 space-y-1 list-decimal list-inside">
              <li>In Mist portal: <strong>Organization → Webhooks → Add Webhook</strong></li>
              <li>URL: paste the Webhook URL above</li>
              <li>Secret Token: paste the Webhook Secret above</li>
              <li>Topics: enable <strong>audits</strong></li>
              <li>Toggle <strong>Enabled</strong> on → Save</li>
            </ol>
          </div>

          <p className="text-xs text-on-surface/50">
            Daily safety-net scan runs at 02:00 UTC to catch any missed events.
          </p>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
      </div>
    </CollapsibleSection>
  )
}
