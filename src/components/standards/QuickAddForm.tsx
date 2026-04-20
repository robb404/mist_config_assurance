'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { AIConfig, FieldDict } from '@/lib/types'

type Filter = Array<{ field: string; condition: string; value?: unknown }>

interface DerivedStandard {
  field: string
  scope: 'wlan' | 'site' | 'org'
  recognised: boolean
  name: string
  check_condition: string
  check_value: unknown
  remediation_value: unknown
  filter: Filter | null
  filterText: string
  filterParsing: boolean
  filterError: string
}

function deriveFromEntry(field: string, value: unknown, fieldDict: FieldDict): DerivedStandard {
  const entry = fieldDict[field]
  const scope = entry?.scope ?? 'wlan'
  const recognised = !!entry
  const name = field
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  let check_condition: string
  let check_value: unknown

  if (value === true) {
    check_condition = 'truthy'; check_value = null
  } else if (value === false) {
    check_condition = 'falsy'; check_value = null
  } else if (Array.isArray(value)) {
    if (value.length === 1) {
      check_condition = 'contains_item'; check_value = value[0]
    } else {
      check_condition = 'eq'; check_value = value
    }
  } else {
    check_condition = 'eq'; check_value = value
  }

  return {
    field, scope, recognised, name, check_condition, check_value,
    remediation_value: value,
    filter: null, filterText: '', filterParsing: false, filterError: '',
  }
}

function filterToHuman(filter: Filter | null): string {
  if (!filter || filter.length === 0) return 'All WLANs / sites'
  return filter.map(f => `${f.field} ${f.condition}${f.value != null ? ` "${f.value}"` : ''}`).join(' OR ')
}

function checkSummary(s: DerivedStandard): string {
  if (s.check_condition === 'truthy') return `${s.field} is enabled`
  if (s.check_condition === 'falsy') return `${s.field} is disabled`
  if (s.check_condition === 'contains_item') return `${s.field} contains "${s.check_value}"`
  return `${s.field} = ${JSON.stringify(s.check_value)}`
}

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

interface Props {
  existingNames: string[]
  onAdded: () => void
  onCancel: () => void
}

export function QuickAddForm({ existingNames, onAdded, onCancel }: Props) {
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState('')
  const [standards, setStandards] = useState<DerivedStandard[]>([])
  const [addingAll, setAddingAll] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const fieldDictRef = useRef<FieldDict>({})
  const [fieldDict, setFieldDict] = useState<FieldDict>({})

  useEffect(() => {
    api.getAIConfig().then(setAiConfig).catch(() => {})
  }, [])

  useEffect(() => {
    api.getFields().then(d => { fieldDictRef.current = d; setFieldDict(d) }).catch(() => {})
  }, [])

  function parseJson() {
    setParseError('')
    setStandards([])
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setParseError('Invalid JSON — paste a Mist config object like {"arp_filter": true}')
      return
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      setParseError('Expected a JSON object (key-value pairs), not an array or primitive')
      return
    }
    setStandards(Object.entries(parsed).map(([k, v]) => deriveFromEntry(k, v, fieldDictRef.current)))
  }

  function updateStd(idx: number, patch: Partial<DerivedStandard>) {
    setStandards(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  async function parseFilterForStd(idx: number) {
    const text = standards[idx].filterText.trim()
    if (!text) { updateStd(idx, { filter: null }); return }
    updateStd(idx, { filterParsing: true, filterError: '' })
    try {
      const res = await api.parseFilter(text)
      updateStd(idx, { filter: res.filter, filterParsing: false })
    } catch (err: unknown) {
      updateStd(idx, {
        filterParsing: false,
        filterError: err instanceof Error ? err.message : 'AI error',
      })
    }
  }

  async function addOne(idx: number) {
    const s = standards[idx]
    setAddingId(s.field)
    try {
      await api.createStandard({
        name: s.name,
        scope: s.scope,
        filter: s.filter ?? undefined,
        check_field: s.field,
        check_condition: s.check_condition,
        check_value: s.check_value ?? null,
        remediation_field: s.field,
        remediation_value: s.remediation_value,
        enabled: true,
        auto_remediate: null,
      })
      setAdded(prev => new Set([...prev, s.field]))
      onAdded()
    } catch (err: unknown) {
      updateStd(idx, { filterError: err instanceof Error ? err.message : 'Save failed' })
      throw err
    } finally {
      setAddingId(null)
    }
  }

  async function addAll() {
    setAddingAll(true)
    try {
      for (let i = 0; i < standards.length; i++) {
        const s = standards[i]
        if (added.has(s.field) || existingNames.includes(s.name)) continue
        await addOne(i)
      }
    } finally {
      setAddingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className={labelCls}>Paste Mist Config JSON</label>
        <textarea
          rows={6}
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          placeholder={'{\n  "arp_filter": true,\n  "roam_mode": "11r"\n}'}
          className={`${inputCls} font-mono text-xs resize-none`}
        />
        {parseError && <p className="text-xs text-error mt-1">{parseError}</p>}
        <div className="flex gap-3 mt-3">
          <Button type="button" onClick={parseJson}>Parse Config</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {standards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-on-surface/50 uppercase tracking-wide">
              {standards.length} standard{standards.length !== 1 ? 's' : ''} derived
            </p>
            <Button type="button" onClick={addAll} disabled={addingAll}>
              {addingAll ? 'Adding…' : 'Add All'}
            </Button>
          </div>

          {standards.map((s, idx) => {
            const alreadyAdded = added.has(s.field) || existingNames.includes(s.name)
            return (
              <div key={s.field} className="bg-surface-lowest rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={s.name}
                      onChange={e => updateStd(idx, { name: e.target.value })}
                      className={`${inputCls} font-medium mb-1`}
                    />
                    <p className="text-xs text-on-surface/50">
                      <span className="text-primary/70 uppercase tracking-wide text-[10px] font-semibold mr-1">{s.scope}</span>
                      Check: {checkSummary(s)} · Fix: {s.field} → {JSON.stringify(s.remediation_value)}
                    </p>
                    {!s.recognised && (
                      <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning">
                        unrecognized field
                      </span>
                    )}
                    {s.recognised && fieldDict[s.field]?.notes && (
                      <span className="text-on-surface/40 text-xs mt-0.5 block">
                        {fieldDict[s.field].notes}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={alreadyAdded || addingId === s.field || addingAll}
                    onClick={() => addOne(idx)}
                    className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      alreadyAdded
                        ? 'bg-surface-high text-on-surface/40 cursor-default'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}>
                    {alreadyAdded ? 'Added' : addingId === s.field ? 'Adding…' : 'Add'}
                  </button>
                </div>

                <div>
                  <label className={labelCls}>
                    Applies to{' '}
                    <span className="normal-case font-normal opacity-60">(optional — describe which WLANs/sites)</span>
                    {aiConfig?.configured && (
                      <span className="ml-2 normal-case font-normal text-primary/50">
                        via {aiConfig.provider} / {aiConfig.model}
                      </span>
                    )}
                    {!aiConfig?.configured && (
                      <span className="ml-2 normal-case font-normal text-warning/70">
                        — no AI configured
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={s.filterText}
                      onChange={e => updateStd(idx, { filterText: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), parseFilterForStd(idx))}
                      placeholder="e.g. PSK and Enterprise WLANs only"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => parseFilterForStd(idx)}
                      disabled={s.filterParsing || !s.filterText.trim() || !aiConfig?.configured}
                      title={aiConfig?.configured ? `${aiConfig.provider} / ${aiConfig.model}` : 'Configure an AI provider in Settings first'}
                      className="shrink-0 px-3 py-2 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-colors">
                      {s.filterParsing ? '…' : '✦ AI'}
                    </button>
                  </div>
                  {s.filterError && <p className="text-xs text-error mt-1">{s.filterError}</p>}
                  {s.filter !== null && !s.filterError && (
                    <p className="text-xs text-on-surface/50 mt-1">
                      → {filterToHuman(s.filter)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
