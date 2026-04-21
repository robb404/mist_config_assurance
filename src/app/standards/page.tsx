'use client'
import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { StandardsList } from '@/components/standards/StandardsList'
import { StandardForm } from '@/components/standards/StandardForm'
import { QuickAddForm } from '@/components/standards/QuickAddForm'
import { TemplateLibrary } from '@/components/standards/TemplateLibrary'
import { StatTile } from '@/components/dashboard/StatTile'
import { SlideOver } from '@/components/ui/SlideOver'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Incident, OrgConfig, Standard } from '@/lib/types'

type Filter = 'all' | 'enabled'
type Drawer = null | 'templates' | 'custom' | 'edit'

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [orgAutoDefault, setOrgAutoDefault] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [editing, setEditing] = useState<Standard | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [{ standards }, { incidents }, org] = await Promise.all([
      api.listStandards(),
      api.listIncidents(),
      api.getOrg().catch(() => null as OrgConfig | null),
    ])
    setStandards(standards)
    setIncidents(incidents)
    setOrgAutoDefault(Boolean(org?.auto_remediate))
  }, [])

  function openTemplates()       { setDrawer('templates') }
  function openCustom()          { setDrawer('custom') }
  function openEdit(s: Standard) { setEditing(s); setDrawer('edit') }
  function closeDrawer()         { setDrawer(null); setEditing(null) }

  async function save(data: Omit<Standard, 'id' | 'org_id' | 'created_at'>) {
    if (editing) {
      await api.updateStandard(editing.id, data)
    }
    closeDrawer()
    load()
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids: string[]) {
    setSelected(prev => {
      const allSelected = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach(id => next.delete(id))
      } else {
        ids.forEach(id => next.add(id))
      }
      return next
    })
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} standard${selected.size === 1 ? '' : 's'}?`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => api.deleteStandard(id)))
      setSelected(new Set())
      load()
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => { load() }, [load])

  const driftingIds = new Set(
    incidents.filter(i => i.status === 'open').map(i => i.standard_id),
  )

  const total    = standards.length
  const enabled  = standards.filter(s => s.enabled).length

  function selectFilter(next: Filter) {
    setFilter(prev => prev === next ? 'all' : next)
  }

  const q = search.trim().toLowerCase()

  const visible = standards.filter(s => {
    if (q) {
      const hay = `${s.name} ${s.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filter === 'enabled') return s.enabled
    return true
  })

  const drawerTitle =
    drawer === 'templates' ? 'Templates'
    : drawer === 'custom'  ? 'Custom Config'
    : drawer === 'edit'    ? 'Edit Standard'
    : ''

  return (
    <PageShell>
      <div className="mb-8">
        <p className="label-overline">Configuration</p>
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Standards</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5 max-w-md">
        <StatTile label="Total"   value={total}   tone="neutral" active={filter === 'all'}     onClick={() => setFilter('all')} />
        <StatTile label="Enabled" value={enabled} tone="healthy" active={filter === 'enabled'} onClick={() => selectFilter('enabled')} />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" strokeWidth={2} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${total} ${total === 1 ? 'standard' : 'standards'}…`}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-lowest rounded-lg outline outline-1 outline-surface-container-high focus:outline-primary"
          />
        </div>
        <p className="text-xs text-on-surface/50 whitespace-nowrap">
          {filter === 'all' && !q
            ? `${visible.length} ${visible.length === 1 ? 'standard' : 'standards'}`
            : `Showing ${visible.length} of ${total}`}
        </p>
        <div className="flex-1" />
        {selected.size > 0 && (
          <Button variant="secondary" size="sm" onClick={deleteSelected} disabled={deleting}>
            {deleting ? 'Deleting…' : `Delete (${selected.size})`}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={openTemplates}>Templates</Button>
        <Button variant="primary"   size="sm" onClick={openCustom}>Custom Config</Button>
      </div>

      {standards.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No standards yet.{' '}
          <button onClick={openTemplates} className="text-primary underline">Start with templates</button>
        </div>
      ) : (
        <StandardsList
          standards={visible}
          driftingIds={driftingIds}
          orgAutoDefault={orgAutoDefault}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onEdit={openEdit}
          onRefresh={load}
        />
      )}

      <SlideOver
        open={drawer !== null}
        onClose={closeDrawer}
        title={drawerTitle}
        size={drawer === 'templates' ? 'lg' : 'md'}
      >
        {drawer === 'templates' && (
          <TemplateLibrary standards={standards} onAdded={load} />
        )}
        {drawer === 'custom' && (
          <QuickAddForm
            existingNames={standards.map(s => s.name)}
            onAdded={load}
            onCancel={closeDrawer}
          />
        )}
        {drawer === 'edit' && editing && (
          <StandardForm initial={editing} onSave={save} onCancel={closeDrawer} />
        )}
      </SlideOver>
    </PageShell>
  )
}
