import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8001'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params
  const body = await req.text()
  const signature = req.headers.get('X-Mist-Signature-v2') ?? ''

  const res = await fetch(`${BACKEND}/api/webhooks/mist/${org_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mist-Signature-v2': signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  const data = await res.json().catch(() => null)
  return NextResponse.json(data ?? { ok: false }, { status: res.status })
}
