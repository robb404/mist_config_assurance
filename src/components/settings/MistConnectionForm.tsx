'use client'
import { useEffect, useState } from 'react'
import { OrgConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { CollapsibleSection } from './CollapsibleSection'

const ENDPOINTS = [
  { value: 'api.mist.com',     label: 'Global 01 — manage.mist.com' },
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

export function MistConnectionForm() {
  const [org, setOrg] = useState<OrgConfig | null>(null)
  const [editing, setEditing] = useState(false)
  const [token, setToken] = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [orgId, setOrgId] = useState('')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getOrg()
      .then(data => {
        setOrg(data)
        setEndpoint(data.cloud_endpoint ?? 'api.mist.com')
      })
      .catch(() => {
        // Not yet connected — keep editing=false so the CTA shows
      })
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) {
      setMsg('Error: API token is required')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res = await api.connect(token, endpoint, orgId || undefined)
      setMsg(`Connected to: ${(res as { org_name: string }).org_name}`)
      setOrg(await api.getOrg())
      setEditing(false)
      setToken('')
      setOrgId('')
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Connection failed'}`)
    } finally {
      setSaving(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this Mist org from this workspace? Standards and incidents are preserved — only the API credentials and Mist org ID are cleared.')) return
    setDisconnecting(true)
    setMsg('')
    try {
      await api.disconnect()
      setOrg(null)
      setEditing(false)
      setToken('')
      setOrgId('')
      setMsg('Disconnected.')
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Disconnect failed'}`)
    } finally {
      setDisconnecting(false)
    }
  }

  const adornment = org
    ? <span className="text-xs text-healthy font-medium normal-case tracking-normal">✓ {org.org_name}</span>
    : null

  const showForm = !org || editing

  return (
    <CollapsibleSection title="Mist Connection" adornment={adornment}>
      {!showForm && org && (
        <div className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-on-surface/60 min-w-[7rem]">Organization</span>
              <span className="text-on-surface font-medium">{org.org_name}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-on-surface/60 min-w-[7rem]">Endpoint</span>
              <span className="text-on-surface font-mono text-xs">{org.cloud_endpoint}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xs uppercase tracking-wide text-on-surface/60 min-w-[7rem]">API Token</span>
              <span className="text-on-surface-variant font-mono text-xs tracking-widest">••••••••••••••••</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(true)
                setMsg('')
                setToken('')
              }}
            >
              Change connection
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={disconnect}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
          {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
        </div>
      )}

      {showForm && (
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
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
              minLength={1}
              placeholder="Enter your Mist API token"
              className={inputCls}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>
              Mist Org ID <span className="normal-case font-normal opacity-60">(optional — auto-detected if you have only one org)</span>
            </label>
            <input
              type="text"
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving || !token.trim()}>
              {saving ? 'Connecting…' : (org ? 'Reconnect' : 'Connect')}
            </Button>
            {org && editing && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setMsg(''); setToken('') }}>
                Cancel
              </Button>
            )}
          </div>
          {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
        </form>
      )}
    </CollapsibleSection>
  )
}
