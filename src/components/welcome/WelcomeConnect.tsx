'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

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

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-lowest rounded-lg outline outline-1 outline-surface-container-high focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

interface Props {
  onDone: () => void
}

export function WelcomeConnect({ onDone }: Props) {
  const [token, setToken] = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [orgId, setOrgId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [success, setSuccess] = useState<{ org_name: string; sites_synced: number } | null>(null)
  const [error, setError] = useState('')

  // If already connected, skip straight to step 2
  useEffect(() => {
    api.getOrg().then(() => onDone()).catch(() => {})
  }, [onDone])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) {
      setError('API token is required')
      return
    }
    setError('')
    setConnecting(true)
    try {
      const res = await api.connect(token, endpoint, orgId || undefined) as {
        org_name: string
        sites_synced?: number
      }
      setSuccess({ org_name: res.org_name, sites_synced: res.sites_synced ?? 0 })
      // Advance after a short beat so the user sees the success state
      setTimeout(onDone, 1400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-surface-lowest rounded-lg p-8 space-y-3">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">
          Connected to {success.org_name}
        </h1>
        <p className="text-sm text-on-surface-variant">
          Synced <strong>{success.sites_synced}</strong> {success.sites_synced === 1 ? 'site' : 'sites'}.
          Moving you to standards…
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-primary tracking-tight mb-2">
        Connect your Mist org
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        Paste your Mist API token. We'll verify the connection and auto-sync your sites in the same step.
      </p>

      <form onSubmit={connect} className="space-y-4">
        <div>
          <label className={labelCls}>Cloud Endpoint</label>
          <select
            value={endpoint}
            onChange={e => setEndpoint(e.target.value)}
            className={inputCls}
          >
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
            placeholder="Paste your Mist API token"
            className={inputCls}
            autoComplete="off"
            autoFocus
          />
          <p className="text-xs text-on-surface/50 mt-1.5">
            Generate one in the Mist portal: Organization → Settings → API Token.
          </p>
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

        {error && (
          <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="pt-2">
          <Button type="submit" disabled={connecting || !token.trim()}>
            {connecting ? 'Connecting…' : 'Connect & Continue'}
          </Button>
        </div>
      </form>
    </div>
  )
}
