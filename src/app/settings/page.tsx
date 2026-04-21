import { PageShell } from '@/components/layout/PageShell'
import { OrgSetupForm } from '@/components/settings/OrgSetupForm'
import { AIProviderForm } from '@/components/settings/AIProviderForm'
import { ApiUsagePanel } from '@/components/settings/ApiUsagePanel'
import { EmailDigestForm } from '@/components/settings/EmailDigestForm'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <div className="space-y-10 max-w-lg">
        <OrgSetupForm />
        <ApiUsagePanel />
        <EmailDigestForm />
        <AIProviderForm />
      </div>
    </PageShell>
  )
}
