'use client'
import { useState } from 'react'
import { TEMPLATE_GROUPS } from '@/lib/standard-templates'
import { api } from '@/lib/api'

interface Props {
  existingNames: string[]
  onAdded: () => void
}

export function TemplateLibrary({ existingNames, onAdded }: Props) {
  const [adding, setAdding] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function addTemplate(key: string, template: (typeof TEMPLATE_GROUPS)[0]['templates'][0]) {
    setAdding(key)
    try {
      const { key: _k, hint: _h, ...data } = template
      await api.createStandard(data)
      onAdded()
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm text-primary font-medium hover:opacity-80 transition-opacity"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Template Library
        <span className="text-on-surface/40 font-normal">— one-click best-practice standards</span>
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {TEMPLATE_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-xs font-medium text-on-surface/50 uppercase tracking-wide mb-2">{group.label}</p>
              <div className="grid grid-cols-1 gap-2">
                {group.templates.map(t => {
                  const alreadyAdded = existingNames.includes(t.name)
                  return (
                    <div key={t.key}
                      className="flex items-start justify-between gap-4 bg-surface-lowest rounded-lg px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface">{t.name}</p>
                        <p className="text-xs text-on-surface/50 mt-0.5">{t.hint}</p>
                      </div>
                      <button
                        disabled={alreadyAdded || adding === t.key}
                        onClick={() => addTemplate(t.key, t)}
                        className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          alreadyAdded
                            ? 'bg-surface-high text-on-surface/40 cursor-default'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        {alreadyAdded ? 'Added' : adding === t.key ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
