'use client'
import { useEffect, useState } from 'react'
import { OrgConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const ENDPOINTS = [
  { value: 'api.mist.com',    label: 'Global 01 — manage.mist.com' },
  { value: 'api.gc1.mist.com', label: 'Global 02 — manage.gc1.mist.com' },
  { value: 'api.ac2.mist.com', label: 'Global 03 — manage.ac2.mist.com' },
  { value: 'api.gc2.mist.com', label: 'Global 04 — manage.gc2.mist.com' },
  { value: 'api.gc4.mist.com', label: 'Global 05 — manage.gc4.mist.com' },
  { value: 'api.eu.mist.com',  label: 'EMEA 01 — manage.eu.mist.com' },
  { value: 'api.gc3.mist.com', label: 'EMEA 02 — manage.gc3.mist.com' },
  { value: 'api.ac6.mist.com', label: 'EMEA 03 — manage.ac6.mist.com' },
  { value: 'api.gc6.mist.com', label: 'EMEA 04 — manage.gc6.mist.com' },
  { value: 'api.ac5.mist.com', label: 'APAC 01 — manage.ac5.mist.com' },
  { value: 'api.gc5.mist.com', label: 'APAC 02 — manage.gc5.mist.com' },
  { value: 'api.gc7.mist.com', label: 'APAC 03 — manage.gc7.mist.com' },
]

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

export function OrgSetupForm() {
  const [token, setToken]       = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [orgId, setOrgId]       = useState('')
  const [interval, setInterval] = useState(0)
  const [autoRemediate, setAutoRemediate] = useState(false)
  const [mode, setMode] = useState<'polling' | 'webhook'>('polling')
  const [org, setOrg]           = useState<OrgConfig | null>(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    api.getOrg().then(data => {
      setOrg(data)
      setInterval((data as OrgConfig & { drift_interval_mins?: number }).drift_interval_mins ?? 0)
      setAutoRemediate((data as OrgConfig & { auto_remediate?: boolean }).auto_remediate ?? false)
      setMode((data as OrgConfig).mode ?? 'polling')
    }).catch(() => {})
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      const res = await api.connect(token, endpoint, orgId || undefined)
      setMsg(`Connected to: ${(res as { org_name: string }).org_name}`)
      setOrg(await api.getOrg())
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Connection failed'}`)
    } finally { setSaving(false) }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.updateSettings({ drift_interval_mins: interval, auto_remediate: autoRemediate, mode })
      setMsg('Settings saved.')
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-10 max-w-lg">
      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
          Mist Connection {org && <span className="text-healthy ml-2">✓ {org.org_name}</span>}
        </h2>
        <form onSubmit={connect} className="space-y-4">
          <div>
            <label className={labelCls}>Cloud Endpoint</label>
            <select value={endpoint} onChange={e => setEndpoint(e.target.value)} className={inputCls}>
              {ENDPOINTS.map(ep => (
                <option key={ep.value} value={ep.value}>{ep.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>API Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} required
              placeholder="Enter your Mist API token"
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>
              Mist Org ID <span className="normal-case font-normal opacity-60">(optional — auto-detected if you have only one org)</span>
            </label>
            <input type="text" value={orgId} onChange={e => setOrgId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputCls} />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Connecting…' : 'Connect'}</Button>
        </form>
      </section>

      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">Drift Settings</h2>
        <form onSubmit={saveSettings} className="space-y-4">
          <div>
            <label className={labelCls}>
              Check Interval (minutes — 0 to disable schedule)
            </label>
            <input type="number" min={0} value={interval} onChange={e => setInterval(Number(e.target.value))}
              className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Detection Mode</label>
            <div className="flex gap-3">
              {(['polling', 'webhook'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                    mode === m
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface border-border text-on-surface/60 hover:text-on-surface'
                  }`}
                >
                  {m === 'polling' ? 'Polling' : 'Webhook'}
                </button>
              ))}
            </div>
            {mode === 'polling' && (
              <p className="text-xs text-on-surface/50 mt-1">
                Mist API is polled on the interval below.
              </p>
            )}
            {mode === 'webhook' && (
              <p className="text-xs text-on-surface/50 mt-1">
                Mist pushes config changes to your webhook URL. See API Usage panel below.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setAutoRemediate(v => !v)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${autoRemediate ? 'bg-healthy' : 'bg-surface-high'}`}>
              <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${autoRemediate ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-on-surface">Auto-remediate drift immediately</span>
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        </form>
      </section>

      {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
    </div>
  )
}
