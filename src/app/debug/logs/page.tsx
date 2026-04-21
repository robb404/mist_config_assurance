import { DebugLogsPanel } from '@/components/settings/DebugLogsPanel'

export const metadata = { title: 'Debug Logs' }

export default function DebugLogsPage() {
  return (
    <div className="min-h-screen bg-surface p-4">
      <div className="h-[calc(100vh-2rem)]">
        <DebugLogsPanel standalone />
      </div>
    </div>
  )
}
