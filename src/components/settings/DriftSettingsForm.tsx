'use client'
import { useEffect, useState } from 'react'
import { OrgConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from './CollapsibleSection'

const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'
const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'

export function DriftSettingsForm() {
  const [interval, setInterval] = useState(0)
  const [autoRemediate, setAutoRemediate] = useState(false)
  const [mode, setMode] = useState<'polling' | 'webhook'>('polling')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getOrg()
      .then(data => {
        const cfg = data as OrgConfig & { drift_interval_mins?: number; auto_remediate?: boolean }
        setInterval(cfg.drift_interval_mins ?? 0)
        setAutoRemediate(cfg.auto_remediate ?? false)
        setMode(cfg.mode ?? 'polling')
      })
      .catch(() => {})
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.updateSettings({ drift_interval_mins: interval, auto_remediate: autoRemediate, mode })
      setMsg('Settings saved.')
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <CollapsibleSection title="Drift Settings">
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={labelCls}>Check Interval (minutes — 0 to disable schedule)</label>
          <input
            type="number"
            min={0}
            value={interval}
            onChange={e => setInterval(Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Detection Mode</label>
          <div className="flex gap-3">
            {(['polling', 'webhook'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors',
                  mode === m
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface border-border text-on-surface/60 hover:text-on-surface',
                )}
              >
                {m === 'polling' ? 'Polling' : 'Webhook'}
              </button>
            ))}
          </div>
          <p className="text-xs text-on-surface/50 mt-1">
            {mode === 'polling'
              ? 'Mist API is polled on the interval above.'
              : 'Mist pushes config changes to your webhook URL. See API Usage above.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoRemediate(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 rounded-full transition-colors',
              autoRemediate ? 'bg-healthy' : 'bg-surface-high',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
                autoRemediate ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </button>
          <span className="text-sm text-on-surface">Self-healing</span>
        </div>

        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
      </form>
    </CollapsibleSection>
  )
}
