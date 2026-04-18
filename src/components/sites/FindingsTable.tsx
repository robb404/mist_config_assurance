import { Finding, Standard } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  findings: Finding[]
  standards: Standard[]
}

export function FindingsTable({ findings, standards }: Props) {
  const stdMap = Object.fromEntries(standards.map(s => [s.id, s]))
  const active = findings.filter(f => f.status !== 'skip')

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Standard</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">SSID</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Actual Value</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {active.map(f => (
            <tr key={f.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
              <td className="px-4 py-3 font-medium">{stdMap[f.standard_id]?.name ?? f.standard_id}</td>
              <td className="px-4 py-3 text-on-surface/60">{f.ssid ?? '—'}</td>
              <td className="px-4 py-3 text-on-surface/60 font-mono text-xs">{f.actual_value ?? '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
