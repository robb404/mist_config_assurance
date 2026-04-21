'use client'
import { useEffect, useState } from 'react'
import { TABS } from '@/lib/standard-templates'
import type { TemplateCard } from '@/lib/standard-templates'
import { api } from '@/lib/api'
import type { Standard, RfTemplate } from '@/lib/types'

interface Props {
  standards: Standard[]
  onAdded: () => void
}

export function TemplateLibrary({ standards, onAdded }: Props) {
  const [activeTab, setActiveTab] = useState<'wlan' | 'site'>('wlan')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({})
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [rfTemplates, setRfTemplates] = useState<RfTemplate[]>([])
  const [rfTemplatesLoaded, setRfTemplatesLoaded] = useState(false)
  const [rfError, setRfError] = useState(false)

  useEffect(() => {
    if (activeTab === 'site' && !rfTemplatesLoaded) {
      api.getRftemplates()
        .then(data => { setRfTemplates(data); setRfTemplatesLoaded(true) })
        .catch(() => { setRfError(true); setRfTemplatesLoaded(true) })
    }
  }, [activeTab, rfTemplatesLoaded])

  async function addTemplate(card: TemplateCard, selectedValue?: string | string[]) {
    const toCreate = card.getStandards(selectedValue)
    if (toCreate.length === 0) return
    setAdding(prev => new Set(prev).add(card.key))
    try {
      for (const std of toCreate) {
        await api.createStandard(std)
      }
      onAdded()
    } catch (err) {
      console.error('Template add failed', err)
      onAdded()
    } finally {
      setAdding(prev => { const n = new Set(prev); n.delete(card.key); return n })
    }
  }

  const currentTab = TABS.find(t => t.id === activeTab)!

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-border mb-5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface/50 hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Groups */}
      <div className="space-y-6">
        {currentTab.groups.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-on-surface/50 uppercase tracking-widest mb-3">
              {group.label}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {group.templates.map(card => {
                const alreadyAdded = card.isAdded(standards)
                const isAdding = adding.has(card.key)
                const hasOptions = card.options !== undefined
                const isMulti = card.multiSelect === true
                const isDynamic = card.dynamicOptions === 'rftemplates'
                const effectiveOptions = isDynamic
                  ? rfTemplates.map(t => ({ label: t.name, value: t.id }))
                  : (card.options ?? [])
                const selectedVal = selections[card.key] ?? ''
                const selectedBands = multiSelections[card.key] ?? (card.multiSelectDefault ?? [])
                const canAdd = !alreadyAdded && !isAdding &&
                  (!hasOptions || (effectiveOptions.length > 0 && (!isDynamic || selectedVal !== ''))) &&
                  !(isDynamic && rfError) &&
                  (!isMulti || selectedBands.length > 0)

                return (
                  <div key={card.key} className="bg-surface-container-low rounded-lg p-3 flex flex-col">
                    <p className="text-sm font-semibold text-on-surface mb-1">{card.title}</p>
                    <p className="text-xs text-on-surface/50 mb-3 flex-1">{card.description}</p>

                    {hasOptions && isMulti && (
                      <div className="mb-2 flex flex-col gap-1.5">
                        {effectiveOptions.map(opt => (
                          <label key={opt.value} className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={alreadyAdded}
                              checked={selectedBands.includes(opt.value)}
                              onChange={e => {
                                setMultiSelections(prev => {
                                  const cur = prev[card.key] ?? (card.multiSelectDefault ?? [])
                                  return {
                                    ...prev,
                                    [card.key]: e.target.checked
                                      ? [...cur, opt.value]
                                      : cur.filter(v => v !== opt.value),
                                  }
                                })
                              }}
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    )}

                    {hasOptions && !isMulti && (
                      <div className="mb-2">
                        {isDynamic && rfError ? (
                          <p className="text-xs text-on-surface/40 italic">Unable to load templates</p>
                        ) : effectiveOptions.length === 0 ? (
                          <p className="text-xs text-on-surface/40 italic">
                            {isDynamic ? 'Loading…' : 'No options'}
                          </p>
                        ) : (
                          <select
                            value={selectedVal}
                            disabled={alreadyAdded}
                            onChange={e =>
                              setSelections(prev => ({ ...prev, [card.key]: e.target.value }))
                            }
                            className="w-full text-xs bg-surface border border-border rounded px-2 py-1 text-on-surface"
                          >
                            {isDynamic && <option value="" disabled>Select a template…</option>}
                            {effectiveOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {alreadyAdded ? (
                      <span className="text-xs bg-surface-container-highest text-on-surface/40 px-3 py-1.5 rounded-lg self-start">
                        Added ✓
                      </span>
                    ) : (
                      <button
                        disabled={!canAdd}
                        onClick={() => addTemplate(card, isMulti ? selectedBands : selectedVal)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors self-start ${
                          canAdd
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-surface-container-highest text-on-surface/40 cursor-not-allowed'
                        }`}
                      >
                        {isAdding ? 'Adding…' : 'Add'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
