import { PageShell } from '@/components/layout/PageShell'
import { OrgSetupForm } from '@/components/settings/OrgSetupForm'
import { AIProviderForm } from '@/components/settings/AIProviderForm'
import { Suspense } from 'react'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <div className="space-y-10 max-w-lg">
        <OrgSetupForm />
        <Suspense fallback={<div className="bg-surface-lowest rounded-lg p-6 animate-pulse h-48" />}>
          <AIProviderForm />
        </Suspense>
      </div>
    </PageShell>
  )
}
