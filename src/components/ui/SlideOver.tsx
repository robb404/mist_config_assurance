'use client'
import { Button } from './Button'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function SlideOver({ open, onClose, title, children }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-lowest shadow-ambient flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-base">
          <h2 className="font-display text-base font-semibold text-primary">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
