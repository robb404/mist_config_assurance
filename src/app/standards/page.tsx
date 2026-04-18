'use client'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { StandardsTable } from '@/components/standards/StandardsTable'
import { StandardForm } from '@/components/standards/StandardForm'
import { SlideOver } from '@/components/ui/SlideOver'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Standard } from '@/lib/types'

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([])
  const [editing, setEditing] = useState<Partial<Standard> | null>(null)
  const [open, setOpen] = useState(false)

  async function load() { const { standards } = await api.listStandards(); setStandards(standards) }

  function openNew() { setEditing({}); setOpen(true) }
  function openEdit(s: Standard) { setEditing(s); setOpen(true) }
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

  useEffect(() => { load() }, [])

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Standards</h1>
        <Button onClick={openNew}>Add Standard</Button>
      </div>

      {standards.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No standards yet. <button onClick={openNew} className="text-primary underline">Add one</button>
        </div>
      ) : (
        <StandardsTable standards={standards} onEdit={openEdit} onRefresh={load} />
      )}

      <SlideOver open={open} onClose={close} title={(editing as Standard)?.id ? 'Edit Standard' : 'New Standard'}>
        {editing !== null && (
          <StandardForm initial={editing} onSave={save} onCancel={close} />
        )}
      </SlideOver>
    </PageShell>
  )
}
