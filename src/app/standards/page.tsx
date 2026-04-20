'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { StandardsTable } from '@/components/standards/StandardsTable'
import { StandardForm } from '@/components/standards/StandardForm'
import { QuickAddForm } from '@/components/standards/QuickAddForm'
import { TemplateLibrary } from '@/components/standards/TemplateLibrary'
import { SlideOver } from '@/components/ui/SlideOver'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Standard } from '@/lib/types'

type FormMode = 'quick' | 'advanced'

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([])
  const [editing, setEditing] = useState<Partial<Standard> | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('quick')

  const load = useCallback(async () => { const { standards } = await api.listStandards(); setStandards(standards) }, [])

  function openNew(m: FormMode = 'quick') { setMode(m); setEditing({}); setOpen(true) }
  function openEdit(s: Standard) { setMode('advanced'); setEditing(s); setOpen(true) }
  function close() { setOpen(false); setEditing(null) }

  async function save(data: Omit<Standard, 'id' | 'org_id' | 'created_at'>) {
    if ((editing as Standard)?.id) {
      await api.updateStandard((editing as Standard).id, data)
    } else {
      await api.createStandard(data)
    }
    close()
    load()
  }

  useEffect(() => { load() }, [load])

  const isEditing = !!(editing as Standard)?.id

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Standards</h1>
        <div className="flex gap-2">
          <Button onClick={() => openNew('quick')}>Quick Add</Button>
          <Button variant="ghost" onClick={() => openNew('advanced')}>Advanced</Button>
        </div>
      </div>

      <TemplateLibrary existingNames={standards.map(s => s.name)} onAdded={load} />

      {standards.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No standards yet. <button onClick={() => openNew('quick')} className="text-primary underline">Add one</button>
        </div>
      ) : (
        <StandardsTable standards={standards} onEdit={openEdit} onRefresh={load} />
      )}

      <SlideOver
        open={open}
        onClose={close}
        title={isEditing ? 'Edit Standard' : mode === 'quick' ? 'Quick Add Standards' : 'New Standard'}>
        {editing !== null && (
          isEditing || mode === 'advanced' ? (
            <StandardForm initial={editing} onSave={save} onCancel={close} />
          ) : (
            <QuickAddForm
              existingNames={standards.map(s => s.name)}
              onAdded={load}
              onCancel={close}
            />
          )
        )}
      </SlideOver>
    </PageShell>
  )
}
