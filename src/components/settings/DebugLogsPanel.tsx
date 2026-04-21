'use client'
import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink, Pause, Play, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { DebugLogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from './CollapsibleSection'

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
type Level = typeof LEVELS[number]

const levelClass: Record<DebugLogEntry['level'], string> = {
  DEBUG:    'text-white/40',
  INFO:     'text-white/80',
  WARNING:  'text-[#F97316]',
  ERROR:    'text-[#FFB4AB]',
  CRITICAL: 'text-[#FFB4AB] font-semibold',
}

interface Props {
  /** When true, hides the Pop out button and fills its container height. */
  standalone?: boolean
}

export function DebugLogsPanel({ standalone = false }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [entries, setEntries] = useState<DebugLogEntry[]>([])
  const [minLevel, setMinLevel] = useState<Level>('INFO')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const lastIdRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getDebugStatus()
      .then(r => setEnabled(r.enabled))
      .catch(() => setEnabled(false))
  }, [])

  useEffect(() => {
    if (!streaming) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const r = await api.getDebugLogs(lastIdRef.current, minLevel)
        if (cancelled) return
        if (r.entries.length > 0) {
          lastIdRef.current = r.last_id
          setEntries(prev => {
            const next = [...prev, ...r.entries]
            return next.length > 1000 ? next.slice(-1000) : next
          })
        }
      } catch { /* ignore transient errors */ }
      if (!cancelled) timer = setTimeout(tick, 2000)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [streaming, minLevel])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  function changeLevel(next: Level) {
    lastIdRef.current = 0
    setEntries([])
    setMinLevel(next)
  }

  const q = search.trim().toLowerCase()
  const visible = q
    ? entries.filter(e => e.message.toLowerCase().includes(q) || e.logger.toLowerCase().includes(q))
    : entries

  function openPopout() {
    window.open('/debug/logs', 'debug-logs', 'width=1000,height=700,resizable=yes,scrollbars=yes')
  }

  async function copyLines() {
    const text = visible.map(e => {
      const t = new Date(e.timestamp * 1000).toLocaleTimeString(undefined, { hour12: false })
      return `${t}  ${e.level.padEnd(8)} ${e.logger}  ${e.message}`
    }).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard API may be blocked — no-op */ }
  }

  if (enabled === null) return null
  if (!enabled) {
    return (
      <CollapsibleSection title="Debug Logs">
        <p className="text-xs text-on-surface/60">
          Live log streaming is disabled. Set <code className="bg-surface-container px-1 py-0.5 rounded">ENABLE_DEBUG_LOGS=true</code>{' '}
          in <code className="bg-surface-container px-1 py-0.5 rounded">backend/.env</code> and restart the backend to enable.
        </p>
      </CollapsibleSection>
    )
  }

  const body = (
    <div className={cn('flex flex-col', standalone && 'h-full')}>
      <div className="flex items-center justify-end gap-2 mb-3 flex-wrap">
        <select
          value={minLevel}
          onChange={e => changeLevel(e.target.value as Level)}
          className="text-xs bg-surface-lowest rounded-md px-2 py-1 outline outline-1 outline-surface-container-high"
        >
          {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0) + l.slice(1).toLowerCase()}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setStreaming(v => !v)}
          className={cn(
            'text-xs px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
            streaming
              ? 'bg-drift/10 text-drift hover:bg-drift/20'
              : 'bg-healthy/10 text-healthy hover:bg-healthy/20',
          )}
        >
          {streaming
            ? <><Pause className="w-3 h-3" strokeWidth={2.5} /> Stop</>
            : <><Play  className="w-3 h-3" strokeWidth={2.5} /> Start</>}
        </button>
        <IconBtn title="Copy visible lines" onClick={copyLines}>
          <Copy className="w-3.5 h-3.5" strokeWidth={2} />
        </IconBtn>
        {!standalone && (
          <IconBtn title="Pop out into its own window" onClick={openPopout}>
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
          </IconBtn>
        )}
        <IconBtn title="Clear displayed logs" onClick={() => setEntries([])}>
          <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
        </IconBtn>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter lines…"
        className="w-full text-xs bg-surface-container-low rounded-md px-3 py-1.5 outline outline-1 outline-surface-container-high focus:outline-primary mb-3"
      />

      <div
        ref={scrollRef}
        className={cn(
          'bg-primary rounded-md p-3 overflow-y-auto font-mono text-[11px] leading-relaxed',
          standalone ? 'flex-1 min-h-0' : 'h-80',
        )}
      >
        {visible.length === 0 ? (
          <p className="text-white/40 italic">
            {streaming ? 'Waiting for log entries…' : 'Click Start to stream logs.'}
          </p>
        ) : (
          visible.map(e => (
            <div key={e.id} className={cn('whitespace-pre-wrap break-words', levelClass[e.level])}>
              <span className="text-white/30">
                {new Date(e.timestamp * 1000).toLocaleTimeString(undefined, { hour12: false })}{' '}
              </span>
              <span className="inline-block w-16">{e.level}</span>
              <span className="text-white/40">{e.logger} </span>
              {e.message}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-on-surface/40 mt-2">
        {q
          ? `${visible.length} of ${entries.length} lines`
          : `${entries.length} ${entries.length === 1 ? 'line' : 'lines'} buffered`}
        {streaming && <span className="ml-2">· polling every 2s</span>}
        {copied && <span className="ml-2 text-healthy">· copied!</span>}
      </p>
    </div>
  )

  if (standalone) {
    return (
      <section className="bg-surface-lowest rounded-lg p-6 flex flex-col h-full">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
          Debug Logs
        </h2>
        {body}
      </section>
    )
  }

  return (
    <CollapsibleSection title="Debug Logs" defaultOpen={false}>
      {body}
    </CollapsibleSection>
  )
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="p-1.5 rounded-md text-on-surface/60 hover:bg-surface-container-high hover:text-on-surface transition-colors"
    >
      {children}
    </button>
  )
}
