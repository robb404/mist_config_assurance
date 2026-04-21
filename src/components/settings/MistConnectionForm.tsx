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
  const [token, setToken]       = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [orgId, setOrgId]       = useState('')
  const [org, setOrg]           = useState<OrgConfig | null>(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    api.getOrg().then(setOrg).catch(() => {})
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      const res = await api.connect(token, endpoint, orgId || undefined)
      setMsg(`Connected to: ${(res as { org_name: string }).org_name}`)
      setOrg(await api.getOrg())
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Connection failed'}`)
    } finally {
      setSaving(false)
    }
  }

  const adornment = org
    ? <span className="text-xs text-healthy font-medium normal-case tracking-normal">✓ {org.org_name}</span>
    : null

  return (
    <CollapsibleSection title="Mist Connection" adornment={adornment}>
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
        {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
      </form>
    </CollapsibleSection>
  )
}
