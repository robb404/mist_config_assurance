import { UserButton } from '@clerk/nextjs'
import { BookOpen, Github, LifeBuoy } from 'lucide-react'

// TODO: swap placeholders for the real repo URL once the new project is published on GitHub
const REPO_URL = '#'
const DOCS_URL = '#'
const SUPPORT_URL = '#'

const links = [
  { href: DOCS_URL,    label: 'Docs',    Icon: BookOpen },
  { href: SUPPORT_URL, label: 'Support', Icon: LifeBuoy },
  { href: REPO_URL,    label: 'GitHub',  Icon: Github },
]

export function TopBar() {
  return (
    <header className="h-14 px-6 flex items-center justify-end gap-6 bg-surface">
      <nav className="flex items-center gap-5">
        {links.map(({ href, label, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-on-surface/60 hover:text-on-surface transition-colors"
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {label}
          </a>
        ))}
      </nav>
      <UserButton />
    </header>
  )
}
