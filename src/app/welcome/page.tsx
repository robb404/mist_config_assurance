'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { UserButton } from '@clerk/nextjs'
import { WelcomeConnect } from '@/components/welcome/WelcomeConnect'
import { WelcomeStandards } from '@/components/welcome/WelcomeStandards'
import { WelcomeCheck } from '@/components/welcome/WelcomeCheck'
import { cn } from '@/lib/utils'

type Step = 1 | 2 | 3

export default function WelcomePage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)

  function skip() {
    router.push('/dashboard')
  }

  function finish() {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <Image
            src="/juniper-mist-logo.svg"
            alt="Juniper Mist"
            width={152}
            height={44}
            className="h-9 w-auto"
            priority
          />
          <span className="text-[10px] font-semibold text-on-surface/60 uppercase tracking-[0.14em]">
            Config Assurance
          </span>
        </div>
        <div className="flex items-center gap-4">
          {step < 3 && (
            <button
              type="button"
              onClick={skip}
              className="text-xs text-on-surface/60 hover:text-on-surface transition-colors"
            >
              Skip for now →
            </button>
          )}
          <UserButton />
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-8 pt-6 pb-16">
        <div className="w-full max-w-2xl">
          <div className="flex gap-2 mb-8">
            {[1, 2, 3].map(n => (
              <div
                key={n}
                className={cn(
                  'flex-1 h-1.5 rounded-full transition-colors',
                  step >= (n as Step) ? 'bg-signature-gradient' : 'bg-surface-container-high',
                )}
              />
            ))}
          </div>

          <p className="label-overline mb-1">Step {step} of 3</p>

          {step === 1 && <WelcomeConnect onDone={() => setStep(2)} />}
          {step === 2 && <WelcomeStandards onDone={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <WelcomeCheck onDone={finish} onBack={() => setStep(2)} />}
        </div>
      </main>
    </div>
  )
}
