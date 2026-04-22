'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { TABS } from '@/lib/standard-templates'
import { cn } from '@/lib/utils'

// Curated starter pack — all one-click (no options), safe defaults.
const STARTER_KEYS = [
  'fast_roaming',
  'arp_filter',
  'limit_bcast',
  'disable_gw_down',
  'persist_config',
  'uplink_monitoring',
] as const

interface Props {
  onDone: () => void
  onBack: () => void
}

export function WelcomeStandards({ onDone, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(STARTER_KEYS))
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  // Collect starter templates from TABS (both WLAN and Site)
  const starters = TABS.flatMap(tab =>
    tab.groups.flatMap(g => g.templates.filter(t => STARTER_KEYS.includes(t.key as typeof STARTER_KEYS[number]))),
  )

  // Prune any already-added standards to avoid duplicates
  useEffect(() => {
    api.listStandards()
      .then(({ standards }) => {
        setSelected(prev => {
          const next = new Set(prev)
          for (const t of starters) {
            if (t.isAdded(standards)) next.delete(t.key)
          }
          return next
        })
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function addAndContinue() {
    setError('')
    setAdding(true)
    try {
      const toAdd = starters.filter(t => selected.has(t.key))
      for (const card of toAdd) {
        const stds = card.getStandards()
        for (const std of stds) {
          await api.createStandard(std)
        }
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add standards')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-primary tracking-tight mb-2">
        Pick your starter standards
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        One-click best practices we recommend for every Mist org. You can customize or add more later from the Standards page.
      </p>

      <div className="bg-surface-lowest rounded-lg p-2 mb-5">
        {starters.map(t => {
          const isChecked = selected.has(t.key)
          return (
            <label
              key={t.key}
              className={cn(
                'flex items-start gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors',
                isChecked ? 'bg-surface-container-low' : 'hover:bg-surface-container-low',
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(t.key)}
                className="mt-0.5 w-4 h-4 accent-primary shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface">{t.title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{t.description}</p>
              </div>
            </label>
          )
        })}
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-on-surface/60 hover:text-on-surface"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-on-surface/60 hover:text-on-surface"
          >
            Skip for now
          </button>
          <Button type="button" onClick={addAndContinue} disabled={adding || selected.size === 0}>
            {adding
              ? 'Adding…'
              : selected.size === 0
                ? 'No standards selected'
                : `Add ${selected.size} & Continue`}
          </Button>
        </div>
      </div>
    </div>
  )
}
