import type { Metadata } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })

export const metadata: Metadata = { title: 'Mist Config Assurance' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
        <body className="bg-surface font-sans text-on-surface antialiased">{children}</body>
      </html>
    </ClerkProvider>
  )
}
