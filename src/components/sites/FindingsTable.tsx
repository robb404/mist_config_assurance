'use client'
import { useState } from 'react'
import { ChevronDown, Wifi, Settings } from 'lucide-react'
import { Finding, Incident, RemediationAction, Standard } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  findings: Finding[]
  standards: Standard[]
  incidents: Incident[]
  actions: RemediationAction[]
  onUpdate: () => void
}

type Tone = 'healthy' | 'drift' | 'error' | 'neutral'

export function FindingsTable({ findings, standards, incidents, actions, onUpdate }: Props) {
  const stdMap = Object.fromEntries(standards.map(s => [s.id, s]))

  if (findings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-on-surface/60 mb-1">This site hasn't been scanned yet.</p>
        <p className="text-xs text-on-surface/40">
          Click <strong className="text-on-surface/70">Check</strong> in the page header to run the first drift check.
        </p>
      </div>
    )
  }

  // Group WLAN findings by wlan_id; site findings are collected separately
  type WlanGroup = { wlan_id: string; ssid: string; findings: Finding[] }
  const wlanMap = new Map<string, WlanGroup>()
  const siteFindings: Finding[] = []

  for (const f of findings) {
    if (f.wlan_id) {
      if (!wlanMap.has(f.wlan_id)) {
        wlanMap.set(f.wlan_id, { wlan_id: f.wlan_id, ssid: f.ssid || f.wlan_id, findings: [] })
      }
      wlanMap.get(f.wlan_id)!.findings.push(f)
    } else {
      siteFindings.push(f)
    }
  }

  // Drifting WLANs first (by tone weight), then alphabetical
  const toneWeight: Record<Tone, number> = { error: 0, drift: 1, healthy: 2, neutral: 3 }
  const wlanGroups = [...wlanMap.values()].sort((a, b) => {
    const aTone = computeTone(a, incidents, actions)
    const bTone = computeTone(b, incidents, actions)
    if (aTone !== bTone) return toneWeight[aTone] - toneWeight[bTone]
    return a.ssid.localeCompare(b.ssid)
  })

  return (
    <div className="space-y-6">
      {wlanGroups.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-on-surface/60 uppercase tracking-[0.1em] mb-2">
            WLANs ({wlanGroups.length})
          </p>
          <div className="space-y-2">
            {wlanGroups.map(g => (
              <WlanCard
                key={g.wlan_id}
                group={g}
                stdMap={stdMap}
                incidents={incidents.filter(i => i.wlan_id === g.wlan_id)}
                actions={actions.filter(a => a.wlan_id === g.wlan_id)}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {siteFindings.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-on-surface/60 uppercase tracking-[0.1em] mb-2">
            Site Settings ({siteFindings.length})
          </p>
          <SiteSection
            findings={siteFindings}
            stdMap={stdMap}
            incidents={incidents.filter(i => !i.wlan_id)}
            actions={actions.filter(a => !a.wlan_id)}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function computeTone(
  group: { findings: Finding[] },
  allIncidents: Incident[],
  allActions: RemediationAction[],
): Tone {
  const wlanId = group.findings[0]?.wlan_id
  const myIncidents = allIncidents.filter(i => i.wlan_id === wlanId && i.status === 'open')
  const myActions   = allActions.filter(a => a.wlan_id === wlanId)
  const hasFailedAction = myActions.some(a => a.status === 'failed')
  const hasFail         = group.findings.some(f => f.status === 'fail')
  const hasOpen         = myIncidents.length > 0
  if (hasFailedAction) return 'error'
  if (hasFail || hasOpen) return 'drift'
  return 'healthy'
}

// -------------------------------------------------------------------------
// WLAN Card
// -------------------------------------------------------------------------

function WlanCard({
  group,
  stdMap,
  incidents,
  actions,
  onUpdate,
}: {
  group: { wlan_id: string; ssid: string; findings: Finding[] }
  stdMap: Record<string, Standard>
  incidents: Incident[]
  actions: RemediationAction[]
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [remediating, setRemediating] = useState(false)

  const pass = group.findings.filter(f => f.status === 'pass').length
  const fail = group.findings.filter(f => f.status === 'fail').length
  const skip = group.findings.filter(f => f.status === 'skip').length
  const open = incidents.filter(i => i.status === 'open').length

  const pendingActions = actions.filter(a => a.status === 'pending')
  const failedActions  = actions.filter(a => a.status === 'failed')
  const tone: Tone =
    failedActions.length > 0 ? 'error'
    : (fail > 0 || open > 0) ? 'drift'
    : 'healthy'

  async function remediateAll(e: React.MouseEvent) {
    e.stopPropagation()
    if (pendingActions.length === 0) return
    setRemediating(true)
    try {
      await Promise.all(pendingActions.map(a => api.approveRemediation(a.id)))
      onUpdate()
    } finally {
      setRemediating(false)
    }
  }

  const toneBg: Record<Tone, string> = {
    healthy: 'bg-surface-container-low',
    drift:   'bg-drift-container',
    error:   'bg-danger/10',
    neutral: 'bg-surface-container-low',
  }
  const toneIcon: Record<Tone, string> = {
    healthy: 'text-healthy',
    drift:   'text-drift',
    error:   'text-danger',
    neutral: 'text-on-surface/40',
  }

  return (
    <div className={cn('rounded-lg', toneBg[tone])}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left"
      >
        <Wifi className={cn('w-5 h-5 shrink-0', toneIcon[tone])} strokeWidth={2} />
        <span className="font-medium text-on-surface truncate min-w-0 max-w-[14rem]">{group.ssid}</span>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatPill count={pass} label="pass" tone="healthy" />
          <StatPill count={fail} label="fail" tone="drift" />
          <StatPill count={skip} label="skip" tone="neutral" />
          <StatPill count={open} label="open" tone="error" />
        </div>

        <div className="flex-1" />

        {pendingActions.length > 0 && (
          <button
            type="button"
            onClick={remediateAll}
            disabled={remediating}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {remediating ? 'Remediating…' : `Remediate (${pendingActions.length})`}
          </button>
        )}

        <ChevronDown
          className={cn('w-4 h-4 text-on-surface/40 shrink-0 transition-transform', expanded && 'rotate-180')}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1">
          {group.findings.map(f => (
            <FindingRow
              key={f.id}
              finding={f}
              standard={stdMap[f.standard_id]}
              pendingAction={actions.find(a => a.standard_id === f.standard_id && a.status === 'pending')}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Site Settings Section
// -------------------------------------------------------------------------

function SiteSection({
  findings,
  stdMap,
  incidents,
  actions,
  onUpdate,
}: {
  findings: Finding[]
  stdMap: Record<string, Standard>
  incidents: Incident[]
  actions: RemediationAction[]
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [remediating, setRemediating] = useState(false)

  const pass = findings.filter(f => f.status === 'pass').length
  const fail = findings.filter(f => f.status === 'fail').length
  const skip = findings.filter(f => f.status === 'skip').length
  const open = incidents.filter(i => i.status === 'open').length

  const pendingActions = actions.filter(a => a.status === 'pending')
  const failedActions  = actions.filter(a => a.status === 'failed')
  const tone: Tone =
    failedActions.length > 0 ? 'error'
    : (fail > 0 || open > 0) ? 'drift'
    : 'healthy'

  async function remediateAll(e: React.MouseEvent) {
    e.stopPropagation()
    if (pendingActions.length === 0) return
    setRemediating(true)
    try {
      await Promise.all(pendingActions.map(a => api.approveRemediation(a.id)))
      onUpdate()
    } finally {
      setRemediating(false)
    }
  }

  const toneBg: Record<Tone, string> = {
    healthy: 'bg-surface-container-low',
    drift:   'bg-drift-container',
    error:   'bg-danger/10',
    neutral: 'bg-surface-container-low',
  }
  const toneIcon: Record<Tone, string> = {
    healthy: 'text-healthy',
    drift:   'text-drift',
    error:   'text-danger',
    neutral: 'text-on-surface/40',
  }

  return (
    <div className={cn('rounded-lg', toneBg[tone])}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left"
      >
        <Settings className={cn('w-5 h-5 shrink-0', toneIcon[tone])} strokeWidth={2} />
        <span className="font-medium text-on-surface truncate min-w-0 max-w-[14rem]">Site settings</span>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatPill count={pass} label="pass" tone="healthy" />
          <StatPill count={fail} label="fail" tone="drift" />
          <StatPill count={skip} label="skip" tone="neutral" />
          <StatPill count={open} label="open" tone="error" />
        </div>

        <div className="flex-1" />

        {pendingActions.length > 0 && (
          <button
            type="button"
            onClick={remediateAll}
            disabled={remediating}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {remediating ? 'Remediating…' : `Remediate (${pendingActions.length})`}
          </button>
        )}

        <ChevronDown
          className={cn('w-4 h-4 text-on-surface/40 shrink-0 transition-transform', expanded && 'rotate-180')}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-1">
          {findings.map(f => (
            <FindingRow
              key={f.id}
              finding={f}
              standard={stdMap[f.standard_id]}
              pendingAction={actions.find(a => a.standard_id === f.standard_id && a.status === 'pending')}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------
// Building blocks
// -------------------------------------------------------------------------

function StatPill({
  count,
  label,
  tone,
}: {
  count: number
  label: string
  tone: 'healthy' | 'drift' | 'neutral' | 'error'
}) {
  const toneClass: Record<typeof tone, string> = {
    healthy: 'text-healthy',
    drift:   'text-drift',
    neutral: 'text-on-surface/60',
    error:   'text-danger',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-lowest text-[10px] font-semibold tracking-wide uppercase',
        count === 0 ? 'opacity-40' : '',
        toneClass[tone],
      )}
    >
      {count} {label}
    </span>
  )
}

function FindingRow({
  finding,
  standard,
  pendingAction,
  onUpdate,
}: {
  finding: Finding
  standard: Standard | undefined
  pendingAction: RemediationAction | undefined
  onUpdate: () => void
}) {
  const [remediating, setRemediating] = useState(false)

  async function remediate(e: React.MouseEvent) {
    e.stopPropagation()
    if (!pendingAction) return
    setRemediating(true)
    try {
      await api.approveRemediation(pendingAction.id)
      onUpdate()
    } finally {
      setRemediating(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-lowest">
      <span className="flex-1 text-sm text-on-surface truncate min-w-0">
        {standard?.name ?? finding.standard_id}
      </span>
      {finding.actual_value && (
        <span className="text-xs text-on-surface-variant font-mono truncate max-w-[12rem] shrink-0">
          {finding.actual_value}
        </span>
      )}
      <StatusBadge status={finding.status} />
      {pendingAction && (
        <button
          type="button"
          onClick={remediate}
          disabled={remediating}
          className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {remediating ? '…' : 'Fix'}
        </button>
      )}
    </div>
  )
}
