import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  const { orgId } = await auth()
  if (!orgId) {
    return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  }

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: process.env.OPENAI_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/openai/callback`,
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(
    `https://auth.openai.com/authorize?${params.toString()}`
  )
  response.cookies.set('openai_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
