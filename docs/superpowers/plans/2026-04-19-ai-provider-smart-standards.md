# AI Provider + Smart Standard Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-provider LLM support (Anthropic API key, OpenAI API key or OAuth 2.0, Ollama local) so users can create standards by pasting Mist JSON config and describing filters in plain English.

**Architecture:** AI config stored per-org in a new `ai_config` Supabase table with encrypted keys/tokens. A FastAPI `ai_provider` module abstracts all three providers behind a single `parse_filter(text, config, org_id)` async function. The frontend's new `QuickAddForm` derives check/remediation rules from pasted JSON deterministically, then calls the backend `POST /api/ai/parse-filter` to convert natural-language filter descriptions into structured filter arrays.

**Tech Stack:** Python `anthropic>=0.25` + `openai>=1.0` SDKs, `httpx` for Ollama, Next.js API routes for OpenAI OAuth dance, Clerk `auth()` for org identity in callback, Fernet encryption (already in `backend/crypto.py`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/003_ai_config.sql` | Create | ai_config table + indexes |
| `.env.example` | Modify | Add OPENAI_CLIENT_ID, OPENAI_CLIENT_SECRET, NEXT_PUBLIC_APP_URL |
| `backend/requirements.txt` | Modify | Add anthropic, openai |
| `backend/ai_provider.py` | Create | parse_filter abstraction + token refresh |
| `backend/tests/test_ai_provider.py` | Create | Unit tests for provider logic |
| `backend/models.py` | Modify | Add AIConfigSave, OAuthTokensRequest, ParseFilterRequest |
| `backend/main.py` | Modify | Add 4 new endpoints (ai-config CRUD + oauth + parse-filter) |
| `src/app/api/auth/openai/route.ts` | Create | OAuth initiation — redirect to OpenAI |
| `src/app/api/auth/openai/callback/route.ts` | Create | OAuth callback — exchange code, store tokens |
| `src/lib/types.ts` | Modify | Add AIConfig type |
| `src/lib/api.ts` | Modify | Add ai config + parseFilter API methods |
| `src/components/settings/AIProviderForm.tsx` | Create | Settings UI for AI provider |
| `src/app/settings/page.tsx` | Modify | Add AIProviderForm section |
| `src/components/standards/QuickAddForm.tsx` | Create | JSON-paste + NL filter standard creation |
| `src/app/standards/page.tsx` | Modify | Wire QuickAddForm into slide-over |

---

## Task 1: Supabase Migration — ai_config Table

**Files:**
- Create: `supabase/migrations/003_ai_config.sql`
- Modify: `.env.example`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/003_ai_config.sql`:

```sql
create table if not exists ai_config (
  org_id              text primary key references org_config(org_id) on delete cascade,
  provider            text not null check (provider in ('anthropic', 'openai', 'ollama')),
  openai_auth_method  text check (openai_auth_method in ('key', 'oauth')),
  api_key             text,
  oauth_access_token  text,
  oauth_refresh_token text,
  oauth_token_expiry  timestamptz,
  model               text not null default 'gpt-4o-mini',
  base_url            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_ai_config_org on ai_config(org_id);
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Open your Supabase project → SQL Editor → paste the contents of `003_ai_config.sql` → Run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Add new env vars to .env.example**

Open `.env.example` and append:

```
# OpenAI OAuth (only needed if using OpenAI OAuth auth method)
# Register your app at: https://platform.openai.com/docs/guides/authentication
OPENAI_CLIENT_ID=
OPENAI_CLIENT_SECRET=

# Public app URL — used as OAuth redirect_uri base (no trailing slash)
# Dev: http://localhost:3000  Prod: https://your-app.vercel.app
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_ai_config.sql .env.example
git commit -m "feat: add ai_config table migration and env var stubs"
```

---

## Task 2: Backend AI Provider Module

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/ai_provider.py`
- Create: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Add Python packages**

Edit `backend/requirements.txt` — append:

```
anthropic>=0.25
openai>=1.0
```

- [ ] **Step 2: Install the new packages**

Run: `pip install anthropic openai`

Expected: both packages install without error.

- [ ] **Step 3: Write the failing tests**

Create `backend/tests/test_ai_provider.py`:

```python
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ai_provider import _parse_raw, parse_filter


def test_parse_raw_null():
    assert _parse_raw("null") is None
    assert _parse_raw("NULL") is None


def test_parse_raw_array():
    raw = '[{"field":"auth.type","condition":"eq","value":"psk"}]'
    result = _parse_raw(raw)
    assert result == [{"field": "auth.type", "condition": "eq", "value": "psk"}]


def test_parse_raw_invalid_raises():
    with pytest.raises(ValueError):
        _parse_raw("not json at all")


def test_parse_filter_ollama():
    config = {
        "provider": "ollama",
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
    }
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "message": {"content": '[{"field":"auth.type","condition":"eq","value":"psk"}]'}
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = asyncio.run(parse_filter("PSK WLANs only", config, "org_1"))

    assert result == [{"field": "auth.type", "condition": "eq", "value": "psk"}]


def test_parse_filter_ollama_null_response():
    config = {
        "provider": "ollama",
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
    }
    mock_response = MagicMock()
    mock_response.json.return_value = {"message": {"content": "null"}}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = asyncio.run(parse_filter("all WLANs", config, "org_1"))

    assert result is None
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /home/robert/mist-config-assurance && python -m pytest backend/tests/test_ai_provider.py -v`

Expected: `ImportError` or `ModuleNotFoundError` — `ai_provider` does not exist yet.

- [ ] **Step 5: Implement backend/ai_provider.py**

Create `backend/ai_provider.py`:

```python
import json
import os
from datetime import datetime, timedelta, timezone

import httpx

from .crypto import decrypt, encrypt
from .db import get_client

_SYSTEM_PROMPT = """\
You are a filter parser for a WiFi configuration assurance tool.
Convert natural language into a JSON filter array or the word null.

Each filter object has these keys:
  "field"     — one of: auth.type, auth.owe, auth.pairwise, auth.enable_beacon_protection,
                roam_mode, arp_filter, limit_bcast, enable_wireless_bridging, isolation,
                band_steer, hide_ssid, no_static_ip, rogue.enabled, wifi.enable_arp_spoof_check
  "condition" — one of: eq, ne, truthy, falsy, contains_item, not_contains_item
  "value"     — string, number, or boolean matching the field

Filters use OR logic: the standard applies if ANY filter matches.

Examples:
  "PSK WLANs only"          → [{"field":"auth.type","condition":"eq","value":"psk"}]
  "PSK and Enterprise"       → [{"field":"auth.type","condition":"eq","value":"psk"},{"field":"auth.type","condition":"eq","value":"eap"}]
  "open WLANs only"         → [{"field":"auth.type","condition":"eq","value":"open"}]
  "all WLANs" / "no filter" → null

Respond with ONLY a valid JSON array or the single word null. No explanation, no markdown fences."""


def _parse_raw(raw: str) -> list | None:
    stripped = raw.strip()
    if stripped.lower() == "null":
        return None
    try:
        result = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {stripped!r}") from exc
    if not isinstance(result, list):
        raise ValueError(f"Expected JSON array, got: {type(result)}")
    return result


async def _get_openai_token(config: dict, org_id: str) -> str:
    """Return a valid OpenAI bearer token, refreshing via OAuth if needed."""
    if config.get("openai_auth_method") == "oauth":
        expiry = datetime.fromisoformat(config["oauth_token_expiry"])
        if datetime.now(timezone.utc) >= expiry - timedelta(minutes=5):
            # Refresh
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://auth.openai.com/oauth/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": os.environ["OPENAI_CLIENT_ID"],
                        "client_secret": os.environ["OPENAI_CLIENT_SECRET"],
                        "refresh_token": decrypt(config["oauth_refresh_token"]),
                    },
                )
            r.raise_for_status()
            data = r.json()
            new_expiry = datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
            db = get_client()
            db.table("ai_config").update({
                "oauth_access_token": encrypt(data["access_token"]),
                "oauth_refresh_token": encrypt(data.get("refresh_token", decrypt(config["oauth_refresh_token"]))),
                "oauth_token_expiry": new_expiry.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("org_id", org_id).execute()
            return data["access_token"]
        return decrypt(config["oauth_access_token"])
    # API key auth
    return decrypt(config["api_key"])


async def parse_filter(text: str, config: dict, org_id: str) -> list | None:
    """Call the configured LLM provider and return a filter array or None."""
    provider = config["provider"]
    model = config["model"]

    if provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=decrypt(config["api_key"]))
        msg = await client.messages.create(
            model=model,
            max_tokens=256,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
        )
        raw = msg.content[0].text

    elif provider == "openai":
        import openai
        token = await _get_openai_token(config, org_id)
        client = openai.AsyncOpenAI(api_key=token)
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=256,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
        )
        raw = resp.choices[0].message.content

    elif provider == "ollama":
        base_url = config.get("base_url") or "http://localhost:11434"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{base_url}/api/chat", json={
                "model": model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
            })
        r.raise_for_status()
        raw = r.json()["message"]["content"]

    else:
        raise ValueError(f"Unknown provider: {provider}")

    return _parse_raw(raw.strip())
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest backend/tests/test_ai_provider.py -v`

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add ai_provider module with anthropic/openai/ollama support"
```

---

## Task 3: Backend API Endpoints

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Add new Pydantic models**

Open `backend/models.py`. Add to the end of the file:

```python
class AIConfigSave(BaseModel):
    provider: str           # anthropic | openai | ollama
    openai_auth_method: str | None = None  # key | oauth (openai only)
    api_key: str | None = None  # new key — omit to keep existing
    model: str
    base_url: str | None = None  # ollama only


class OAuthTokensRequest(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int         # seconds until expiry


class ParseFilterRequest(BaseModel):
    text: str
```

- [ ] **Step 2: Write a test for the parse-filter endpoint (no-config path)**

Add to `backend/tests/test_ai_provider.py`:

```python
from unittest.mock import MagicMock, patch


def test_parse_filter_raises_when_no_config():
    """parse_filter is only called when config exists; test that missing config raises."""
    # This tests the contract: callers must check config before calling parse_filter
    import asyncio
    with pytest.raises(Exception):
        asyncio.run(parse_filter("PSK only", None, "org_1"))
```

Run: `python -m pytest backend/tests/test_ai_provider.py::test_parse_filter_raises_when_no_config -v`

Expected: FAIL (parse_filter with None config hits AttributeError, not our own exception yet — that's fine, the test just checks it raises).

- [ ] **Step 3: Add the four new endpoints to backend/main.py**

Open `backend/main.py`. Add these imports at the top (alongside existing imports):

```python
from .ai_provider import parse_filter as _ai_parse_filter
from .models import (
    AIConfigSave, ConnectRequest, OAuthTokensRequest, OrgSettingsRequest,
    ParseFilterRequest, RunRequest, StandardCreate, StandardUpdate,
)
```

Then add the four endpoints anywhere after the existing org endpoints (before the standards endpoints is a good spot):

```python
# ---------------------------------------------------------------------------
# AI Config
# ---------------------------------------------------------------------------

@app.get("/api/ai-config")
async def get_ai_config(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row or not row.data:
        return {"configured": False}
    data = row.data
    return {
        "configured": True,
        "provider": data["provider"],
        "openai_auth_method": data.get("openai_auth_method"),
        "model": data["model"],
        "base_url": data.get("base_url"),
        "has_key": bool(data.get("api_key")),
        "oauth_connected": bool(data.get("oauth_access_token")),
        "oauth_token_expiry": data.get("oauth_token_expiry"),
    }


@app.put("/api/ai-config")
async def save_ai_config(req: AIConfigSave, org_id: str = Depends(get_org_id)):
    db = get_client()
    payload: dict = {
        "org_id": org_id,
        "provider": req.provider,
        "openai_auth_method": req.openai_auth_method,
        "model": req.model,
        "base_url": req.base_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if req.api_key:
        payload["api_key"] = encrypt(req.api_key)
    db.table("ai_config").upsert(payload).execute()
    return {"ok": True}


@app.post("/api/ai-config/oauth")
async def store_oauth_tokens(req: OAuthTokensRequest, org_id: str = Depends(get_org_id)):
    from datetime import timedelta
    expiry = datetime.now(timezone.utc) + timedelta(seconds=req.expires_in)
    db = get_client()
    db.table("ai_config").upsert({
        "org_id": org_id,
        "provider": "openai",
        "openai_auth_method": "oauth",
        "oauth_access_token": encrypt(req.access_token),
        "oauth_refresh_token": encrypt(req.refresh_token),
        "oauth_token_expiry": expiry.isoformat(),
        "model": "gpt-4o-mini",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return {"ok": True}


@app.post("/api/ai/parse-filter")
async def parse_filter_endpoint(req: ParseFilterRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row or not row.data:
        raise HTTPException(400, "No AI provider configured. Visit Settings → AI Provider to set one up.")
    try:
        result = await _ai_parse_filter(req.text, row.data, org_id)
        return {"filter": result}
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        log.error("AI parse-filter error: %s", exc)
        raise HTTPException(502, f"AI provider error: {exc}")
```

- [ ] **Step 4: Verify the backend starts**

Run: `cd /home/robert/mist-config-assurance && uvicorn backend.main:app --port 8001 --reload`

Expected: starts without import errors. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/main.py backend/tests/test_ai_provider.py
git commit -m "feat: add ai-config and parse-filter backend endpoints"
```

---

## Task 4: Next.js OpenAI OAuth Routes

**Files:**
- Create: `src/app/api/auth/openai/route.ts`
- Create: `src/app/api/auth/openai/callback/route.ts`

**Prerequisite:** You must register your app at [platform.openai.com](https://platform.openai.com) to get `OPENAI_CLIENT_ID` and `OPENAI_CLIENT_SECRET`. Set redirect URI to `http://localhost:3000/api/auth/openai/callback` (and your production URL when deployed). Add the credentials to your local `.env.local`.

- [ ] **Step 1: Create the OAuth initiation route**

Create directory `src/app/api/auth/openai/` and file `route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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

  const cookieStore = await cookies()
  const response = NextResponse.redirect(
    `https://auth.openai.com/authorize?${params.toString()}`
  )
  response.cookies.set('openai_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  return response
}
```

- [ ] **Step 2: Create the OAuth callback route**

Create `src/app/api/auth/openai/callback/route.ts`:

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8001'

export async function GET(req: NextRequest) {
  const { getToken, orgId } = await auth()
  if (!orgId) {
    return NextResponse.redirect(new URL('/settings?ai_error=no_org', req.url))
  }

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/settings?ai_error=${error}`, req.url))
  }

  // CSRF check
  const storedState = req.cookies.get('openai_oauth_state')?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/settings?ai_error=state_mismatch', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?ai_error=no_code', req.url))
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.OPENAI_CLIENT_ID!,
      client_secret: process.env.OPENAI_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/openai/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/settings?ai_error=token_exchange_failed', req.url))
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()

  // Store tokens via backend
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

  const response = NextResponse.redirect(new URL('/settings?ai_connected=true', req.url))
  response.cookies.delete('openai_oauth_state')
  return response
}
```

- [ ] **Step 3: Verify routes compile**

Run: `cd /home/robert/mist-config-assurance && npx next build 2>&1 | tail -20`

Expected: build succeeds (or only pre-existing type errors — no new errors from these files).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/openai/route.ts src/app/api/auth/openai/callback/route.ts
git commit -m "feat: add OpenAI OAuth initiation and callback routes"
```

---

## Task 5: Frontend Types + API Client

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add AIConfig type**

Open `src/lib/types.ts`. Append:

```typescript
export interface AIConfig {
  configured: boolean
  provider?: 'anthropic' | 'openai' | 'ollama'
  openai_auth_method?: 'key' | 'oauth' | null
  model?: string
  base_url?: string | null
  has_key?: boolean
  oauth_connected?: boolean
  oauth_token_expiry?: string | null
}
```

- [ ] **Step 2: Add API methods**

Open `src/lib/api.ts`. Add these methods to the `api` object (after the existing `retryRemediation` line, before the closing `}`):

```typescript
  getAIConfig: () => request<import('./types').AIConfig>('api/ai-config'),
  saveAIConfig: (body: {
    provider: string
    openai_auth_method?: string | null
    api_key?: string | null
    model: string
    base_url?: string | null
  }) => request('api/ai-config', { method: 'PUT', body: JSON.stringify(body) }),
  parseFilter: (text: string) =>
    request<{ filter: Array<{field: string; condition: string; value?: unknown}> | null }>(
      'api/ai/parse-filter',
      { method: 'POST', body: JSON.stringify({ text }) }
    ),
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /home/robert/mist-config-assurance && npx tsc --noEmit 2>&1 | head -30`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat: add AIConfig type and API client methods"
```

---

## Task 6: AI Provider Settings UI

**Files:**
- Create: `src/components/settings/AIProviderForm.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create AIProviderForm component**

Create `src/components/settings/AIProviderForm.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AIConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

const ANTHROPIC_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']

export function AIProviderForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [config, setConfig] = useState<AIConfig | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'ollama'>('openai')
  const [openaiMethod, setOpenaiMethod] = useState<'key' | 'oauth'>('oauth')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getAIConfig().then(data => {
      setConfig(data)
      if (data.configured && data.provider) {
        setProvider(data.provider)
        setModel(data.model ?? 'gpt-4o-mini')
        setBaseUrl(data.base_url ?? 'http://localhost:11434')
        if (data.provider === 'openai' && data.openai_auth_method) {
          setOpenaiMethod(data.openai_auth_method as 'key' | 'oauth')
        }
      }
    }).catch(() => {})

    if (searchParams.get('ai_connected') === 'true') {
      setMsg('OpenAI connected successfully.')
      router.replace('/settings')
    }
    if (searchParams.get('ai_error')) {
      setMsg(`Connection failed: ${searchParams.get('ai_error')}`)
      router.replace('/settings')
    }
  }, [searchParams, router])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await api.saveAIConfig({
        provider,
        openai_auth_method: provider === 'openai' ? openaiMethod : null,
        api_key: apiKey || null,
        model,
        base_url: provider === 'ollama' ? baseUrl : null,
      })
      setMsg('AI provider saved.')
      setApiKey('')
      setConfig(await api.getAIConfig())
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  function formatExpiry(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    const h = Math.round((d.getTime() - Date.now()) / 3600000)
    if (h < 1) return 'expires soon'
    if (h < 24) return `expires in ${h}h`
    return `expires in ${Math.round(h / 24)}d`
  }

  return (
    <section className="bg-surface-lowest rounded-lg p-6">
      <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
        AI Provider
        {config?.configured && (
          <span className="text-healthy ml-2 normal-case font-normal">
            ✓ {config.provider} / {config.model}
          </span>
        )}
      </h2>

      <form onSubmit={save} className="space-y-4">
        {/* Provider picker */}
        <div>
          <label className={labelCls}>Provider</label>
          <div className="flex gap-2">
            {(['anthropic', 'openai', 'ollama'] as const).map(p => (
              <button key={p} type="button"
                onClick={() => {
                  setProvider(p)
                  setModel(p === 'anthropic' ? 'claude-haiku-4-5-20251001' : p === 'openai' ? 'gpt-4o-mini' : model)
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  provider === p
                    ? 'bg-primary text-white'
                    : 'bg-surface-low text-on-surface/70 hover:bg-surface-high'
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Anthropic */}
        {provider === 'anthropic' && (
          <>
            <div>
              <label className={labelCls}>
                API Key {config?.has_key && <span className="text-healthy">(key saved)</span>}
              </label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={config?.has_key ? 'Enter new key to replace' : 'sk-ant-...'}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
                {ANTHROPIC_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}

        {/* OpenAI */}
        {provider === 'openai' && (
          <>
            <div>
              <label className={labelCls}>Authentication</label>
              <div className="flex gap-2">
                {(['oauth', 'key'] as const).map(method => (
                  <button key={method} type="button"
                    onClick={() => setOpenaiMethod(method)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      openaiMethod === method
                        ? 'bg-primary text-white'
                        : 'bg-surface-low text-on-surface/70 hover:bg-surface-high'
                    }`}>
                    {method === 'oauth' ? 'Connect with OpenAI' : 'API Key'}
                  </button>
                ))}
              </div>
            </div>

            {openaiMethod === 'oauth' ? (
              <div>
                {config?.oauth_connected ? (
                  <p className="text-sm text-healthy">
                    ✓ Connected — {formatExpiry(config.oauth_token_expiry)}
                  </p>
                ) : (
                  <a href="/api/auth/openai"
                    className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    Connect with OpenAI →
                  </a>
                )}
              </div>
            ) : (
              <div>
                <label className={labelCls}>
                  API Key {config?.has_key && config?.openai_auth_method === 'key' && <span className="text-healthy">(key saved)</span>}
                </label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputCls} />
              </div>
            )}

            <div>
              <label className={labelCls}>Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
                {OPENAI_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Ollama */}
        {provider === 'ollama' && (
          <>
            <div>
              <label className={labelCls}>Base URL</label>
              <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model Name</label>
              <input type="text" value={model} onChange={e => setModel(e.target.value)}
                placeholder="llama3.2"
                className={inputCls} />
            </div>
          </>
        )}

        {/* Save — not shown for OAuth (already saved via callback) */}
        {!(provider === 'openai' && openaiMethod === 'oauth') && (
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        )}
        {provider === 'openai' && openaiMethod === 'oauth' && config?.oauth_connected && (
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update Model'}</Button>
        )}
      </form>

      {msg && <p className="text-sm text-on-surface/70 mt-3">{msg}</p>}
    </section>
  )
}
```

- [ ] **Step 2: Add AIProviderForm to the settings page**

Open `src/app/settings/page.tsx`. Replace entire file:

```tsx
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
        <Suspense>
          <AIProviderForm />
        </Suspense>
      </div>
    </PageShell>
  )
}
```

Note: `Suspense` is required because `AIProviderForm` uses `useSearchParams()` (Next.js App Router requirement).

- [ ] **Step 3: Test the settings page renders**

Start the dev server: `npm run dev`

Navigate to `http://localhost:3000/settings`. Verify the AI Provider section renders below the Mist Connection section. Select each provider tab and confirm the form fields change correctly. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/AIProviderForm.tsx src/app/settings/page.tsx
git commit -m "feat: add AI provider settings UI"
```

---

## Task 7: QuickAddForm — JSON Paste + Natural Language Filter

**Files:**
- Create: `src/components/standards/QuickAddForm.tsx`
- Modify: `src/app/standards/page.tsx`

- [ ] **Step 1: Create QuickAddForm**

Create `src/components/standards/QuickAddForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

// Fields that live on WLAN objects — everything else is site scope
const WLAN_FIELDS = new Set([
  'auth.type', 'auth.owe', 'auth.pairwise', 'auth.enable_beacon_protection',
  'auth.eap_reauth', 'auth.multi_psk_only', 'auth.anticlog_threshold',
  'auth.enable_gcmp256', 'auth.enable_mac_auth', 'auth.force_lookup',
  'roam_mode', 'arp_filter', 'limit_bcast', 'allow_mdns', 'allow_ssdp',
  'allow_ipv6_ndp', 'enable_wireless_bridging', 'isolation', 'l2_isolation',
  'no_static_ip', 'no_static_dns', 'block_blacklist_clients',
  'band_steer', 'band_steer_force_band5', 'bands',
  'disable_ht_vht_rates', 'disable_11ax', 'disable_11be',
  'rateset.24.template', 'rateset.5.template', 'rateset.6.template',
  'rateset.24.min_rssi', 'rateset.5.min_rssi',
  'wlan_limit_up_enabled', 'wlan_limit_up', 'wlan_limit_down_enabled', 'wlan_limit_down',
  'client_limit_up_enabled', 'client_limit_up', 'client_limit_down_enabled', 'client_limit_down',
  'hide_ssid', 'vlan_enabled', 'vlan_id', 'dynamic_vlan.enabled',
  'max_num_clients', 'max_idletime', 'disable_wmm', 'disable_uapsd',
  'qos.class', 'limit_probe_response',
])

type Filter = Array<{ field: string; condition: string; value?: unknown }>

interface DerivedStandard {
  field: string
  scope: 'wlan' | 'site'
  name: string
  check_condition: string
  check_value: unknown
  remediation_value: unknown
  filter: Filter | null
  filterText: string
  filterParsing: boolean
  filterError: string
}

function deriveFromEntry(field: string, value: unknown): DerivedStandard {
  const scope = WLAN_FIELDS.has(field) ? 'wlan' : 'site'
  const name = field
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  let check_condition: string
  let check_value: unknown

  if (value === true) {
    check_condition = 'truthy'; check_value = null
  } else if (value === false) {
    check_condition = 'falsy'; check_value = null
  } else if (Array.isArray(value)) {
    if (value.length === 1) {
      check_condition = 'contains_item'; check_value = value[0]
    } else {
      check_condition = 'eq'; check_value = value
    }
  } else {
    check_condition = 'eq'; check_value = value
  }

  return {
    field, scope, name, check_condition, check_value,
    remediation_value: value,
    filter: null, filterText: '', filterParsing: false, filterError: '',
  }
}

function filterToHuman(filter: Filter | null): string {
  if (!filter || filter.length === 0) return 'All WLANs / sites'
  return filter.map(f => `${f.field} ${f.condition}${f.value != null ? ` "${f.value}"` : ''}`).join(' OR ')
}

function checkSummary(s: DerivedStandard): string {
  if (s.check_condition === 'truthy') return `${s.field} is enabled`
  if (s.check_condition === 'falsy') return `${s.field} is disabled`
  if (s.check_condition === 'contains_item') return `${s.field} contains "${s.check_value}"`
  return `${s.field} = ${JSON.stringify(s.check_value)}`
}

interface Props {
  existingNames: string[]
  onAdded: () => void
  onCancel: () => void
}

export function QuickAddForm({ existingNames, onAdded, onCancel }: Props) {
  const [jsonText, setJsonText] = useState('')
  const [parseError, setParseError] = useState('')
  const [standards, setStandards] = useState<DerivedStandard[]>([])
  const [addingAll, setAddingAll] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  function parseJson() {
    setParseError('')
    setStandards([])
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setParseError('Invalid JSON — paste a Mist config object like {"arp_filter": true}')
      return
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      setParseError('Expected a JSON object (key-value pairs), not an array or primitive')
      return
    }
    const derived = Object.entries(parsed).map(([k, v]) => deriveFromEntry(k, v))
    setStandards(derived)
  }

  function updateStd(idx: number, patch: Partial<DerivedStandard>) {
    setStandards(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
  }

  async function parseFilterForStd(idx: number) {
    const text = standards[idx].filterText.trim()
    if (!text) { updateStd(idx, { filter: null }); return }
    updateStd(idx, { filterParsing: true, filterError: '' })
    try {
      const res = await api.parseFilter(text)
      updateStd(idx, { filter: res.filter, filterParsing: false })
    } catch (err: unknown) {
      updateStd(idx, {
        filterParsing: false,
        filterError: err instanceof Error ? err.message : 'AI error',
      })
    }
  }

  async function addOne(idx: number) {
    const s = standards[idx]
    const key = s.field
    setAddingId(key)
    try {
      await api.createStandard({
        name: s.name,
        scope: s.scope,
        filter: s.filter ?? undefined,
        check_field: s.field,
        check_condition: s.check_condition,
        check_value: s.check_value ?? null,
        remediation_field: s.field,
        remediation_value: s.remediation_value,
        enabled: true,
        auto_remediate: null,
      })
      setAdded(prev => new Set([...prev, key]))
      onAdded()
    } finally {
      setAddingId(null)
    }
  }

  async function addAll() {
    setAddingAll(true)
    try {
      for (let i = 0; i < standards.length; i++) {
        const s = standards[i]
        if (added.has(s.field) || existingNames.includes(s.name)) continue
        await addOne(i)
      }
    } finally {
      setAddingAll(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'
  const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'

  return (
    <div className="space-y-6">
      {/* JSON Input */}
      <div>
        <label className={labelCls}>Paste Mist Config JSON</label>
        <textarea
          rows={6}
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          placeholder={'{\n  "arp_filter": true,\n  "roam_mode": "11r"\n}'}
          className={`${inputCls} font-mono text-xs resize-none`}
        />
        {parseError && <p className="text-xs text-error mt-1">{parseError}</p>}
        <div className="flex gap-3 mt-3">
          <Button type="button" onClick={parseJson}>Parse Config</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {/* Derived standards */}
      {standards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-on-surface/50 uppercase tracking-wide">
              {standards.length} standard{standards.length !== 1 ? 's' : ''} derived
            </p>
            <Button type="button" onClick={addAll} disabled={addingAll}>
              {addingAll ? 'Adding…' : 'Add All'}
            </Button>
          </div>

          {standards.map((s, idx) => {
            const alreadyAdded = added.has(s.field) || existingNames.includes(s.name)
            return (
              <div key={s.field} className="bg-surface-lowest rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Name */}
                    <input
                      type="text"
                      value={s.name}
                      onChange={e => updateStd(idx, { name: e.target.value })}
                      className={`${inputCls} font-medium mb-1`}
                    />
                    {/* Summary */}
                    <p className="text-xs text-on-surface/50">
                      <span className="text-primary/70 uppercase tracking-wide text-[10px] font-semibold mr-1">{s.scope}</span>
                      Check: {checkSummary(s)} · Fix: {s.field} → {JSON.stringify(s.remediation_value)}
                    </p>
                  </div>
                  <button
                    disabled={alreadyAdded || addingId === s.field}
                    onClick={() => addOne(idx)}
                    className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      alreadyAdded
                        ? 'bg-surface-high text-on-surface/40 cursor-default'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}>
                    {alreadyAdded ? 'Added' : addingId === s.field ? 'Adding…' : 'Add'}
                  </button>
                </div>

                {/* NL Filter */}
                <div>
                  <label className={labelCls}>
                    Applies to <span className="normal-case font-normal opacity-60">(optional — describe which WLANs/sites)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={s.filterText}
                      onChange={e => updateStd(idx, { filterText: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), parseFilterForStd(idx))}
                      placeholder="e.g. PSK and Enterprise WLANs only"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => parseFilterForStd(idx)}
                      disabled={s.filterParsing || !s.filterText.trim()}
                      className="shrink-0 px-3 py-2 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-40 transition-colors">
                      {s.filterParsing ? '…' : '✦ AI'}
                    </button>
                  </div>
                  {s.filterError && <p className="text-xs text-error mt-1">{s.filterError}</p>}
                  {s.filter !== null && !s.filterError && (
                    <p className="text-xs text-on-surface/50 mt-1">
                      → {filterToHuman(s.filter)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire QuickAddForm into the standards page**

Open `src/app/standards/page.tsx`. Replace the entire file:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { StandardsTable } from '@/components/standards/StandardsTable'
import { StandardForm } from '@/components/standards/StandardForm'
import { QuickAddForm } from '@/components/standards/QuickAddForm'
import { TemplateLibrary } from '@/components/standards/TemplateLibrary'
import { SlideOver } from '@/components/ui/SlideOver'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Standard } from '@/lib/types'

type FormMode = 'quick' | 'advanced'

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([])
  const [editing, setEditing] = useState<Partial<Standard> | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('quick')

  async function load() { const { standards } = await api.listStandards(); setStandards(standards) }

  function openNew(m: FormMode = 'quick') { setMode(m); setEditing({}); setOpen(true) }
  function openEdit(s: Standard) { setMode('advanced'); setEditing(s); setOpen(true) }
  function close() { setOpen(false); setEditing(null) }

  async function save(data: Omit<Standard, 'id' | 'org_id' | 'created_at'>) {
    if ((editing as Standard)?.id) {
      await api.updateStandard((editing as Standard).id, data)
    } else {
      await api.createStandard(data)
    }
    close()
    load()
  }

  useEffect(() => { load() }, [])

  const isEditing = !!(editing as Standard)?.id

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Standards</h1>
        <div className="flex gap-2">
          <Button onClick={() => openNew('quick')}>Quick Add</Button>
          <Button variant="ghost" onClick={() => openNew('advanced')}>Advanced</Button>
        </div>
      </div>

      <TemplateLibrary existingNames={standards.map(s => s.name)} onAdded={load} />

      {standards.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No standards yet. <button onClick={() => openNew('quick')} className="text-primary underline">Add one</button>
        </div>
      ) : (
        <StandardsTable standards={standards} onEdit={openEdit} onRefresh={load} />
      )}

      <SlideOver
        open={open}
        onClose={close}
        title={isEditing ? 'Edit Standard' : mode === 'quick' ? 'Quick Add Standards' : 'New Standard'}>
        {editing !== null && (
          isEditing || mode === 'advanced' ? (
            <StandardForm initial={editing} onSave={save} onCancel={close} />
          ) : (
            <QuickAddForm
              existingNames={standards.map(s => s.name)}
              onAdded={load}
              onCancel={close}
            />
          )
        )}
      </SlideOver>
    </PageShell>
  )
}
```

- [ ] **Step 3: Test the full flow**

Start `npm run dev`. Navigate to `/standards`.

1. Click **Quick Add** — slide-over opens with JSON textarea
2. Paste: `{"arp_filter": true, "roam_mode": "11r", "auth.enable_beacon_protection": true}`
3. Click **Parse Config** — three standard cards appear
4. For "Roam Mode", type "PSK and Enterprise WLANs only" → click ✦ AI
5. Verify filter result shows: `auth.type eq "psk" OR auth.type eq "eap"`
6. Click **Add All** — standards are saved and table updates

- [ ] **Step 4: Commit**

```bash
git add src/components/standards/QuickAddForm.tsx src/app/standards/page.tsx
git commit -m "feat: add QuickAddForm with JSON parsing and AI-powered filter generation"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Supabase ai_config table | Task 1 |
| Anthropic API key auth | Task 2 (ai_provider.py), Task 6 (UI) |
| OpenAI API key auth | Task 2, Task 6 |
| OpenAI OAuth 2.0 | Task 3 (backend store endpoint), Task 4 (Next.js routes), Task 6 (Connect button) |
| Token refresh for OAuth | Task 2 (`_get_openai_token`) |
| Ollama local | Task 2, Task 6 |
| API keys never returned to frontend | Task 3 (`GET /api/ai-config` returns `has_key` bool, never the key) |
| OAuth tokens never sent to frontend | Task 3, Task 4 (callback stores direct to backend) |
| POST /api/ai/parse-filter | Task 3 |
| JSON → standard derivation | Task 7 (`deriveFromEntry`) |
| NL filter → AI parse | Task 7 (`parseFilterForStd` calls `api.parseFilter`) |
| Scope auto-detection | Task 7 (`WLAN_FIELDS` set) |
| Settings UI | Task 6 |
| Standards page wired | Task 7 |
| env vars documented | Task 1 |

**No placeholders found.**

**Type consistency:** `AIConfig` defined in Task 5, used in Task 6. `api.parseFilter` returns `{ filter: Filter | null }` defined in Task 5, consumed in Task 7 `parseFilterForStd`. All consistent.
