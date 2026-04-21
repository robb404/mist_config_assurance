import { PageShell } from '@/components/layout/PageShell'
import { MistConnectionForm } from '@/components/settings/MistConnectionForm'
import { DriftSettingsForm } from '@/components/settings/DriftSettingsForm'
import { ApiUsagePanel } from '@/components/settings/ApiUsagePanel'
import { EmailDigestForm } from '@/components/settings/EmailDigestForm'
import { AIProviderForm } from '@/components/settings/AIProviderForm'
import { DebugLogsPanel } from '@/components/settings/DebugLogsPanel'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <p className="label-overline">System</p>
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <div className="space-y-4 max-w-2xl">
        <MistConnectionForm />
        <ApiUsagePanel />
        <DriftSettingsForm />
        <EmailDigestForm />
        <AIProviderForm />
        <DebugLogsPanel />
      </div>
    </PageShell>
  )
}
