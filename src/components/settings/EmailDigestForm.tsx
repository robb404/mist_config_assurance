'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DigestSettings, DigestTestResult } from '@/lib/types'
import { CollapsibleSection } from './CollapsibleSection'

const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'
const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailDigestForm() {
  const [settings, setSettings] = useState<DigestSettings | null>(null)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | null>(null)
  const [recipientsText, setRecipientsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [testResult, setTestResult] = useState<DigestTestResult | null>(null)

  useEffect(() => {
    api.getDigestSettings().then(data => {
      setSettings(data)
      setFrequency(data.frequency)
      setRecipientsText((data.extra_recipients ?? []).join('\n'))
    }).catch(() => {})
  }, [])

  function parseRecipients(): { list: string[]; invalid: string[] } {
    const lines = recipientsText.split('\n').map(s => s.trim()).filter(Boolean)
    const invalid = lines.filter(l => !EMAIL_RE.test(l))
    return { list: lines, invalid }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const { list, invalid } = parseRecipients()
    if (invalid.length > 0) {
      setMsg(`Invalid email(s): ${invalid.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await api.updateDigestSettings({ frequency, extra_recipients: list })
      setMsg('Saved.')
      setSettings(await api.getDigestSettings())
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.sendTestDigest()
      setTestResult(result)
      setSettings(await api.getDigestSettings())
    } catch (err) {
      setTestResult({ ok: false, skipped: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!settings) return null

  const testEnabled = frequency !== null && settings.resend_configured

  return (
    <CollapsibleSection title="Email Digest">
      {!settings.resend_configured && (
        <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2 mb-4">
          Resend is not configured on the backend. Set <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> to enable.
        </div>
      )}

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={labelCls}>Frequency</label>
          <div className="flex gap-3">
            {([null, 'daily', 'weekly'] as const).map(f => (
              <button
                key={f ?? 'off'}
                type="button"
                onClick={() => setFrequency(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  frequency === f
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface border-border text-on-surface/60 hover:text-on-surface'
                }`}
              >
                {f === null ? 'Off' : f === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Extra Recipients (one per line)</label>
          <textarea
            value={recipientsText}
            onChange={e => setRecipientsText(e.target.value)}
            rows={3}
            placeholder="team@example.com"
            className={`${inputCls} font-mono resize-none`}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={!testEnabled || testing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? 'Sending…' : 'Send Test Digest'}
          </button>
        </div>

        {msg && <p className="text-xs text-on-surface/70">{msg}</p>}

        {testResult && (
          <p className={`text-xs ${testResult.ok ? 'text-healthy' : 'text-danger'}`}>
            {testResult.ok
              ? (testResult.skipped ? 'Sent (skipped — no activity in window)' : 'Sent!')
              : `Failed: ${testResult.error ?? 'unknown error'}`}
          </p>
        )}

        <div className="border-t border-border pt-3 space-y-1 text-xs text-on-surface/60">
          <p>Last sent: <strong>{settings.last_sent_at ?? 'Never'}</strong></p>
          {settings.last_error && (
            <p className="text-danger">Last error: {settings.last_error}</p>
          )}
        </div>
      </form>
    </CollapsibleSection>
  )
}
