'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Settings, Trash2, Wifi, Zap } from 'lucide-react'
import { Standard } from '@/lib/types'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  standards: Standard[]
  driftingIds: Set<string>
  orgAutoDefault: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: (ids: string[]) => void
  onEdit: (s: Standard) => void
  onRefresh: () => void
}

export function StandardsList({
  standards, driftingIds, orgAutoDefault, selected,
  onToggleSelect, onToggleSelectAll, onEdit, onRefresh,
}: Props) {
  const wlanStandards = standards.filter(s => s.scope === 'wlan')
  const siteStandards = standards.filter(s => s.scope === 'site')

  async function toggle(s: Standard) {
    await api.toggleStandard(s.id, !s.enabled)
    onRefresh()
  }

  async function toggleAuto(s: Standard) {
    const current = s.auto_remediate === null || s.auto_remediate === undefined
      ? orgAutoDefault
      : s.auto_remediate
    const next = !current
    await api.updateStandard(s.id, {
      name: s.name,
      description: s.description,
      scope: s.scope,
      filter: s.filter,
      check_field: s.check_field,
      check_condition: s.check_condition,
      check_value: s.check_value,
      remediation_field: s.remediation_field,
      remediation_value: s.remediation_value,
      auto_remediate: next,
      enabled: s.enabled,
    })
    onRefresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this standard?')) return
    await api.deleteStandard(id)
    onRefresh()
  }

  return (
    <div className="space-y-4">
      {wlanStandards.length > 0 && (
        <Section
          title="WLAN Standards"
          ids={wlanStandards.map(s => s.id)}
          selected={selected}
          onToggleSelectAll={onToggleSelectAll}
        >
          {wlanStandards.map(s => (
            <StandardRow
              key={s.id}
              standard={s}
              icon={<Wifi className="w-4 h-4 text-on-surface/50 shrink-0" strokeWidth={2} />}
              drifting={driftingIds.has(s.id)}
              selected={selected.has(s.id)}
              onToggleSelect={() => onToggleSelect(s.id)}
              onToggle={() => toggle(s)}
              onToggleAuto={() => toggleAuto(s)}
              autoOn={s.auto_remediate === null || s.auto_remediate === undefined ? orgAutoDefault : s.auto_remediate}
              onEdit={() => onEdit(s)}
              onDelete={() => remove(s.id)}
            />
          ))}
        </Section>
      )}

      {siteStandards.length > 0 && (
        <Section
          title="Site Standards"
          ids={siteStandards.map(s => s.id)}
          selected={selected}
          onToggleSelectAll={onToggleSelectAll}
        >
          {siteStandards.map(s => (
            <StandardRow
              key={s.id}
              standard={s}
              icon={<Settings className="w-4 h-4 text-on-surface/50 shrink-0" strokeWidth={2} />}
              drifting={driftingIds.has(s.id)}
              selected={selected.has(s.id)}
              onToggleSelect={() => onToggleSelect(s.id)}
              onToggle={() => toggle(s)}
              onToggleAuto={() => toggleAuto(s)}
              autoOn={s.auto_remediate === null || s.auto_remediate === undefined ? orgAutoDefault : s.auto_remediate}
              onEdit={() => onEdit(s)}
              onDelete={() => remove(s.id)}
            />
          ))}
        </Section>
      )}

      {wlanStandards.length === 0 && siteStandards.length === 0 && (
        <p className="text-sm text-on-surface/40 text-center py-8">No standards match your filters.</p>
      )}
    </div>
  )
}

function Section({
  title,
  ids,
  selected,
  onToggleSelectAll,
  children,
}: {
  title: string
  ids: string[]
  selected: Set<string>
  onToggleSelectAll: (ids: string[]) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const checkboxRef = useRef<HTMLInputElement>(null)

  const selectedCount = ids.filter(id => selected.has(id)).length
  const allSelected   = selectedCount > 0 && selectedCount === ids.length
  const someSelected  = selectedCount > 0 && selectedCount < ids.length

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected
  }, [someSelected])

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => onToggleSelectAll(ids)}
          className="w-3.5 h-3.5 accent-primary cursor-pointer"
          aria-label={`Select all ${title}`}
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 group"
        >
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-on-surface/40 transition-transform',
              !open && '-rotate-90',
            )}
            strokeWidth={2.5}
          />
          <span className="text-[10px] font-semibold text-on-surface/60 group-hover:text-on-surface uppercase tracking-[0.1em]">
            {title} ({ids.length})
          </span>
        </button>
      </div>
      {open && (
        <div className="bg-surface-lowest rounded-lg p-2 space-y-1">
          {children}
        </div>
      )}
    </section>
  )
}

function StandardRow({
  standard: s,
  icon,
  drifting,
  selected,
  autoOn,
  onToggleSelect,
  onToggle,
  onToggleAuto,
  onEdit,
  onDelete,
}: {
  standard: Standard
  icon: React.ReactNode
  drifting: boolean
  selected: boolean
  autoOn: boolean
  onToggleSelect: () => void
  onToggle: () => void
  onToggleAuto: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 px-3 py-2.5 rounded-lg transition-colors',
        drifting ? 'bg-drift-container' : 'hover:bg-surface-container-low',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="w-4 h-4 accent-primary cursor-pointer shrink-0"
        aria-label={`Select ${s.name}`}
      />
      {icon}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', s.enabled ? 'text-on-surface' : 'text-on-surface/50')}>
          {s.name}
        </p>
        {s.description && (
          <p className="text-xs text-on-surface-variant truncate">{s.description}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {drifting && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-drift/20 text-drift text-[10px] font-semibold uppercase tracking-wide">
            Drift
          </span>
        )}
        <button
          type="button"
          onClick={onToggleAuto}
          title={autoOn ? 'Auto-fix enabled — click to turn off' : 'Auto-fix off — click to enable'}
          aria-label={autoOn ? 'Disable auto-fix' : 'Enable auto-fix'}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            autoOn
              ? 'text-drift bg-drift/10 hover:bg-drift/20'
              : 'text-on-surface/40 hover:bg-surface-container-high hover:text-on-surface',
          )}
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={2} fill={autoOn ? 'currentColor' : 'none'} />
        </button>
        <ToggleSwitch on={s.enabled} onChange={onToggle} />
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface transition-colors"
          aria-label="Edit"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-on-surface/60 hover:bg-danger/10 hover:text-danger transition-colors"
          aria-label="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={on ? 'Disable' : 'Enable'}
      className={cn(
        'relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0',
        on ? 'bg-healthy' : 'bg-surface-container-highest',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
