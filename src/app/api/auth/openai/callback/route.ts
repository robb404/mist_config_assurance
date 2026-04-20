import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8001'

export async function GET(req: NextRequest) {
  const clientId = process.env.OPENAI_CLIENT_ID
  const clientSecret = process.env.OPENAI_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.redirect(new URL('/settings?ai_error=store_failed', req.url))
  }

  const { getToken, orgId } = await auth()
  if (!orgId) {
    return NextResponse.redirect(new URL('/settings?ai_error=no_org', req.url))
  }

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/settings?ai_error=${encodeURIComponent(error)}`, req.url))
  }

  const storedState = req.cookies.get('openai_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/settings?ai_error=state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?ai_error=no_code', req.url))
  }

  const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appUrl}/api/auth/openai/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings?ai_error=token_exchange_failed', req.url))
  }

  let access_token: string, refresh_token: string, expires_in: number
  try {
    const tokenData = await tokenRes.json()
    access_token = tokenData.access_token
    refresh_token = tokenData.refresh_token
    expires_in = tokenData.expires_in
  } catch {
    return NextResponse.redirect(new URL('/settings?ai_error=token_exchange_failed', req.url))
  }

  try {
    const clerkToken = await getToken()
    const storeRes = await fetch(`${BACKEND}/api/ai-config/oauth`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clerkToken}`,
        'Content-Type': 'application/json',
        'X-Org-Id': orgId,
      },
      body: JSON.stringify({ access_token, refresh_token, expires_in }),
    })

    if (!storeRes.ok) {
      return NextResponse.redirect(new URL('/settings?ai_error=store_failed', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/settings?ai_error=store_failed', req.url))
  }

  const response = NextResponse.redirect(new URL('/settings?ai_connected=true', req.url))
  response.cookies.delete('openai_oauth_state')
  return response
}
