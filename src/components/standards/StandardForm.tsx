'use client'
import { useState } from 'react'
import { Standard } from '@/lib/types'
import { Button } from '@/components/ui/Button'

const CONDITIONS = [
  'truthy','falsy','eq','ne','in','not_in',
  'contains','not_contains','contains_item','not_contains_item','gte','lte',
]

interface Props {
  initial?: Partial<Standard>
  onSave: (data: Omit<Standard, 'id' | 'org_id' | 'created_at'>) => Promise<void>
  onCancel: () => void
}

export function StandardForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    scope: initial?.scope ?? 'wlan',
    check_field: initial?.check_field ?? '',
    check_condition: initial?.check_condition ?? 'truthy',
    check_value: initial?.check_value != null ? JSON.stringify(initial.check_value) : '',
    remediation_field: initial?.remediation_field ?? '',
    remediation_value: initial?.remediation_value != null ? JSON.stringify(initial.remediation_value) : '',
    auto_remediate: initial?.auto_remediate ?? null,
    enabled: initial?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    let check_value: unknown = null
    let remediation_value: unknown = null
    try {
      if (form.check_value) check_value = JSON.parse(form.check_value)
      if (!form.remediation_value) { setError('Remediation value is required'); return }
      remediation_value = JSON.parse(form.remediation_value)
    } catch {
      setError('check_value and remediation_value must be valid JSON')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...form, check_value, remediation_value, filter: undefined } as Omit<Standard, 'id' | 'org_id' | 'created_at'>)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: string, hint?: string) => (
    <div className="mb-4">
      <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">{label}</label>
      <input
        type="text"
        value={(form as Record<string, unknown>)[key] as string}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary"
      />
      {hint && <p className="text-xs text-on-surface/40 mt-1">{hint}</p>}
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-1">
      {field('Name', 'name')}
      {field('Description', 'description')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Scope</label>
        <select value={form.scope} onChange={e => set('scope', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          <option value="wlan">WLAN</option>
          <option value="site">Site</option>
        </select>
      </div>

      {field('Check Field', 'check_field', 'Dotted path e.g. auth.pairwise')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Condition</label>
        <select value={form.check_condition} onChange={e => set('check_condition', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          {CONDITIONS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {field('Check Value (JSON)', 'check_value', 'e.g. "wpa3" or ["5","6"]  — leave blank for truthy/falsy')}
      {field('Remediation Field', 'remediation_field', 'Field to set in Mist API')}
      {field('Remediation Value (JSON)', 'remediation_value', 'Value to set e.g. true or ["wpa3"]')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Auto Remediate</label>
        <select value={form.auto_remediate === null ? 'inherit' : String(form.auto_remediate)}
          onChange={e => set('auto_remediate', e.target.value === 'inherit' ? null : e.target.value === 'true')}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          <option value="inherit">Inherit org default</option>
          <option value="true">Yes — remediate immediately</option>
          <option value="false">No — require approval</option>
        </select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Standard'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
