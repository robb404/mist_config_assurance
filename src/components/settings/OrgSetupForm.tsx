'use client'
import { useEffect, useState } from 'react'
import { OrgConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

export function OrgSetupForm() {
  const [token, setToken] = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [interval, setInterval] = useState(0)
  const [autoRemediate, setAutoRemediate] = useState(false)
  const [org, setOrg] = useState<OrgConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getOrg().then(setOrg).catch(() => {})
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      const res = await api.connect(token, endpoint)
      setMsg(`Connected to: ${(res as { org_name: string }).org_name}`)
      setOrg(await api.getOrg())
    } catch (err: unknown) { setMsg(`Error: ${err instanceof Error ? err.message : 'Connection failed'}`) }
    finally { setSaving(false) }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.updateSettings({ drift_interval_mins: interval, auto_remediate: autoRemediate })
      setMsg('Settings saved.')
    } catch (err: unknown) { setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-10 max-w-lg">
      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
          Mist Connection {org && <span className="text-healthy ml-2">✓ {org.org_name}</span>}
        </h2>
        <form onSubmit={connect} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">API Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} required
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Cloud Endpoint</label>
            <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)} required
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Connecting…' : 'Connect'}</Button>
        </form>
      </section>

      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">Drift Settings</h2>
        <form onSubmit={saveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">
              Check Interval (minutes — 0 to disable schedule)
            </label>
            <input type="number" min={0} value={interval} onChange={e => setInterval(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
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
