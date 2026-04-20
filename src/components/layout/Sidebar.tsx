'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard',  label: 'Dashboard' },
  { href: '/standards',  label: 'Standards' },
  { href: '/activity',   label: 'Activity' },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen bg-surface-highest">
      <div className="px-5 py-6">
        <span className="font-display text-sm font-bold tracking-tight text-primary uppercase">
          Mist CA
        </span>
      </div>

      <div className="px-3 mb-4">
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          afterLeaveOrganizationUrl="/dashboard"
          appearance={{ elements: { rootBox: 'w-full', organizationSwitcherTrigger: 'w-full rounded-lg px-3 py-2 text-sm bg-surface-high' } }}
        />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {nav.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center px-3 py-2 rounded-lg text-sm transition-colors',
              path.startsWith(href)
                ? 'bg-signature-gradient text-on-primary font-medium'
                : 'text-on-surface hover:bg-surface-high',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-5 border-t border-surface-high flex items-center gap-3">
        <UserButton />
        <Link href="/settings" className="text-xs text-on-surface/60 hover:text-on-surface">Settings</Link>
      </div>
    </aside>
  )
}
