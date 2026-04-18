'use client'
import { Standard } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  standards: Standard[]
  onEdit: (s: Standard) => void
  onRefresh: () => void
}

export function StandardsTable({ standards, onEdit, onRefresh }: Props) {
  async function toggle(s: Standard) {
    await api.toggleStandard(s.id, !s.enabled)
    onRefresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this standard?')) return
    await api.deleteStandard(id)
    onRefresh()
  }

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Scope</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Check</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Enabled</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {standards.map(s => (
            <tr key={s.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3 text-on-surface/60 capitalize">{s.scope}</td>
              <td className="px-4 py-3 font-mono text-xs text-on-surface/60">
                {s.check_field} {s.check_condition} {s.check_value != null ? JSON.stringify(s.check_value) : ''}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggle(s)}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${s.enabled ? 'bg-healthy' : 'bg-surface-high'}`}
                >
                  <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </td>
              <td className="px-4 py-3 text-right space-x-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
