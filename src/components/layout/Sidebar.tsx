'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { Activity, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard',  label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/standards',  label: 'Standards', Icon: ShieldCheck },
  { href: '/activity',   label: 'Activity',  Icon: Activity },
  { href: '/settings',   label: 'Settings',  Icon: Settings },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen bg-surface-highest">
      {/* Header: logo + subtitle */}
      <div className="px-4 pt-6 pb-4 flex flex-col gap-0.5 items-start">
        <Image
          src="/juniper-mist-logo.svg"
          alt="Juniper Mist"
          width={152}
          height={44}
          className="h-10 w-auto"
          priority
        />
        <span className="w-[152px] -ml-[7px] text-center text-[10px] font-semibold text-on-surface/60 uppercase tracking-[0.14em]">
          Config Assurance
        </span>
      </div>

      {/* Org switcher */}
      <div className="px-3 mb-5">
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
          afterLeaveOrganizationUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: 'w-full',
              organizationSwitcherTrigger: 'w-full rounded-lg px-3 py-2 text-sm bg-surface-high',
            },
          }}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1.5">
        {nav.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
              path.startsWith(href)
                ? 'bg-signature-gradient text-on-primary font-medium'
                : 'text-on-surface hover:bg-surface-high',
            )}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
