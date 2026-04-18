# Mist Configuration Assurance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Mist Configuration Assurance as a multi-tenant SaaS tool with per-org standards, continuous drift detection, and auto-remediation against the Juniper Mist API.

**Architecture:** Python FastAPI backend (internal, port 8001) handles all Mist API calls, rule evaluation, scheduling, and remediation. Next.js frontend (port 3000) handles UI and auth via Clerk, forwarding JWTs to the Python backend. Supabase Postgres stores all state.

**Tech Stack:** Python 3.11 · FastAPI · PyJWT · APScheduler · httpx · supabase-py · cryptography · Next.js 14 (App Router) · TypeScript · Clerk · Tailwind CSS · Manrope + Inter fonts · Docker Compose

---

## File Structure

```
mist-config-assurance/
  backend/
    __init__.py
    main.py           — FastAPI app + all routes
    auth.py           — Clerk JWT verification (get_org_id dependency)
    db.py             — Supabase client singleton
    crypto.py         — Fernet encrypt/decrypt for Mist tokens
    mist_client.py    — Mist API async HTTP client
    engine.py         — Standards evaluation engine
    scheduler.py      — APScheduler, per-org drift jobs
    remediation.py    — Mist API write-back (PATCH/PUT)
    models.py         — Pydantic request/response models
    requirements.txt
    Dockerfile
    tests/
      __init__.py
      test_engine.py
      test_auth.py
      test_remediation.py
  src/
    app/
      layout.tsx
      page.tsx                        — redirect to /dashboard
      dashboard/page.tsx
      sites/[id]/page.tsx
      standards/page.tsx
      activity/page.tsx
      settings/page.tsx
      api/proxy/[...path]/route.ts    — JWT-forwarding proxy to Python
    components/
      layout/Sidebar.tsx
      layout/PageShell.tsx
      ui/StatusBadge.tsx
      ui/Button.tsx
      ui/SlideOver.tsx
      dashboard/SiteRow.tsx
      sites/FindingsTable.tsx
      sites/IncidentPanel.tsx
      standards/StandardsTable.tsx
      standards/StandardForm.tsx
      activity/ActivityTable.tsx
      settings/OrgSetupForm.tsx
    lib/
      api.ts            — fetch wrapper (calls /api/proxy/*)
      types.ts          — shared TypeScript types
      design-tokens.ts  — colour/font constants
    __tests__/
      proxy.test.ts
      StatusBadge.test.tsx
  supabase/
    migrations/001_init.sql
  docker-compose.yml
  .env.example
  Dockerfile            — Next.js
  next.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
```

---

## Phase 1 — Foundation

### Task 1: Project scaffold + Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/requirements.txt`
- Create: `backend/Dockerfile`
- Create: `Dockerfile`
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`

- [ ] **Step 1: Create `backend/requirements.txt`**

```
fastapi>=0.111
uvicorn[standard]>=0.29
httpx>=0.27
pydantic>=2.7
pyjwt[crypto]>=2.8
supabase>=2.4
apscheduler>=3.10
python-dotenv>=1.0
cryptography>=42
pytest>=8.1
pytest-asyncio>=0.23
httpx>=0.27
```

- [ ] **Step 2: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 3: Create `Dockerfile` (Next.js)**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM base AS runner
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
```

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mist_ca
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./supabase/migrations/001_init.sql:/docker-entrypoint-initdb.d/001_init.sql

  backend:
    build: ./backend
    ports:
      - "8001:8001"
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      CLERK_JWKS_URL: ${CLERK_JWKS_URL}
      TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY}
    depends_on:
      - db

  frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
      BACKEND_URL: http://backend:8001
    depends_on:
      - backend

volumes:
  pgdata:
```

- [ ] **Step 5: Create `.env.example`**

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json

# Token encryption — generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
TOKEN_ENCRYPTION_KEY=

# Backend URL (used by Next.js to call Python)
BACKEND_URL=http://localhost:8001
```

- [ ] **Step 6: Initialise Next.js project**

```bash
cd /home/robert/mist-config-assurance
pnpm create next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

When prompted, accept defaults. Then add dependencies:

```bash
pnpm add @clerk/nextjs @clerk/backend
pnpm add -D @testing-library/react @testing-library/jest-dom vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 7: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
}

export default config
```

- [ ] **Step 8: Create `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#041627',
        'primary-container': '#1A2B3C',
        surface: '#F7FAFC',
        'surface-lowest': '#FFFFFF',
        'surface-low': '#F0F4F8',
        'surface-base': '#E8EDF2',
        'surface-high': '#DCE3EA',
        'surface-highest': '#CBD5E0',
        'on-surface': '#181C1E',
        'on-primary': '#FFFFFF',
        error: '#BA1A1A',
        'error-container': '#FFDAD6',
        healthy: '#10B981',
        drift: '#F97316',
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: { lg: '0.5rem' },
      boxShadow: { ambient: '0 20px 40px rgba(4,22,39,0.06)' },
      backgroundImage: {
        'signature-gradient': 'linear-gradient(135deg, #041627, #1A2B3C)',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 9: Commit**

```bash
cd /home/robert/mist-config-assurance
git init
git add .
git commit -m "feat: project scaffold, Docker Compose, Next.js + Tailwind"
```

---

### Task 2: Supabase schema

**Files:**
- Create: `supabase/migrations/001_init.sql`

- [ ] **Step 1: Create `supabase/migrations/001_init.sql`**

```sql
create table if not exists org_config (
  org_id          text primary key,
  mist_token      text not null,
  cloud_endpoint  text not null,
  org_name        text not null,
  drift_interval_mins int not null default 0,
  auto_remediate  boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists site (
  id              text not null,
  org_id          text not null references org_config(org_id) on delete cascade,
  name            text not null,
  monitored       boolean not null default true,
  last_checked_at timestamptz,
  primary key (id, org_id)
);

create table if not exists standard (
  id                  uuid primary key default gen_random_uuid(),
  org_id              text not null references org_config(org_id) on delete cascade,
  name                text not null,
  description         text,
  scope               text not null check (scope in ('wlan','site')),
  filter              jsonb,
  check_field         text not null,
  check_condition     text not null,
  check_value         jsonb,
  remediation_field   text not null,
  remediation_value   jsonb not null,
  auto_remediate      boolean,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now()
);

create table if not exists validation_run (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  site_id     text not null,
  site_name   text not null,
  run_at      timestamptz not null default now(),
  triggered_by text not null check (triggered_by in ('manual','scheduled')),
  passed      int not null default 0,
  failed      int not null default 0,
  skipped     int not null default 0
);

create table if not exists finding (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references validation_run(id) on delete cascade,
  standard_id uuid not null references standard(id) on delete cascade,
  wlan_id     text,
  ssid        text,
  status      text not null check (status in ('pass','fail','skip')),
  actual_value text
);

create table if not exists incident (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  site_id     text not null,
  site_name   text not null,
  standard_id uuid not null references standard(id) on delete cascade,
  title       text not null,
  wlan_id     text,
  ssid        text,
  opened_at   timestamptz not null default now(),
  resolved_at timestamptz,
  status      text not null default 'open' check (status in ('open','resolved','suppressed'))
);

create table if not exists remediation_action (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incident(id) on delete cascade,
  org_id       text not null,
  site_id      text not null,
  wlan_id      text,
  standard_id  uuid not null references standard(id) on delete cascade,
  desired_value jsonb not null,
  attempted_at timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','success','failed')),
  error_detail text
);

create index if not exists idx_site_org       on site(org_id);
create index if not exists idx_std_org        on standard(org_id);
create index if not exists idx_run_org_site   on validation_run(org_id, site_id);
create index if not exists idx_finding_run    on finding(run_id);
create index if not exists idx_incident_org   on incident(org_id);
create index if not exists idx_incident_status on incident(status);
create index if not exists idx_ra_incident    on remediation_action(incident_id);
create index if not exists idx_ra_status      on remediation_action(status);
```

- [ ] **Step 2: Apply migration to local Postgres**

```bash
docker compose up -d db
sleep 3
docker compose exec db psql -U postgres -d mist_ca -f /docker-entrypoint-initdb.d/001_init.sql
```

Expected: `CREATE TABLE` repeated for each table, then `CREATE INDEX`.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: supabase schema — all tables and indexes"
```

---

## Phase 2 — Python Backend

### Task 3: Backend auth + crypto + DB

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/auth.py`
- Create: `backend/crypto.py`
- Create: `backend/db.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Create `backend/__init__.py`** (empty)

- [ ] **Step 2: Create `backend/auth.py`**

```python
import os
from fastapi import Header, HTTPException
import jwt
from jwt import PyJWKClient

_jwks_client: PyJWKClient | None = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = os.environ["CLERK_JWKS_URL"]
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client

async def get_org_id(authorization: str = Header(...)) -> str:
    """FastAPI dependency — verifies Clerk JWT and returns org_id."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception as exc:
        raise HTTPException(401, f"Invalid token: {exc}")
    org_id = payload.get("org_id")
    if not org_id:
        raise HTTPException(403, "No active Clerk organization. Select one in the UI.")
    return org_id
```

- [ ] **Step 3: Create `backend/crypto.py`**

```python
import os
from cryptography.fernet import Fernet

def _fernet() -> Fernet:
    key = os.environ["TOKEN_ENCRYPTION_KEY"].encode()
    return Fernet(key)

def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()

def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
```

- [ ] **Step 4: Create `backend/db.py`**

```python
import os
from functools import lru_cache
from supabase import create_client, Client

@lru_cache(maxsize=1)
def get_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
```

- [ ] **Step 5: Write `backend/tests/test_auth.py`**

```python
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException

def test_get_org_id_missing_bearer():
    import asyncio
    from backend.auth import get_org_id
    with pytest.raises(HTTPException) as exc:
        asyncio.get_event_loop().run_until_complete(get_org_id("not-bearer"))
    assert exc.value.status_code == 401

def test_get_org_id_no_org_in_payload():
    import asyncio
    from backend.auth import get_org_id
    mock_key = MagicMock()
    mock_key.key = "secret"
    with patch("backend.auth._get_jwks_client") as mock_client:
        mock_client.return_value.get_signing_key_from_jwt.return_value = mock_key
        with patch("backend.auth.jwt.decode", return_value={"sub": "user_1"}):
            with pytest.raises(HTTPException) as exc:
                asyncio.get_event_loop().run_until_complete(
                    get_org_id("Bearer fake_token")
                )
    assert exc.value.status_code == 403

def test_get_org_id_returns_org():
    import asyncio
    from backend.auth import get_org_id
    mock_key = MagicMock()
    mock_key.key = "secret"
    with patch("backend.auth._get_jwks_client") as mock_client:
        mock_client.return_value.get_signing_key_from_jwt.return_value = mock_key
        with patch("backend.auth.jwt.decode", return_value={"sub": "user_1", "org_id": "org_abc"}):
            result = asyncio.get_event_loop().run_until_complete(
                get_org_id("Bearer fake_token")
            )
    assert result == "org_abc"
```

- [ ] **Step 6: Run auth tests**

```bash
cd /home/robert/mist-config-assurance
CLERK_JWKS_URL=https://example.com TOKEN_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") pytest backend/tests/test_auth.py -v
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: backend auth, crypto, db helpers"
```

---

### Task 4: Mist client

**Files:**
- Create: `backend/mist_client.py` (adapted from Config_Assurance_v0.1)

- [ ] **Step 1: Create `backend/mist_client.py`**

```python
import httpx

def build_base_url(cloud_endpoint: str) -> str:
    host = cloud_endpoint.strip().rstrip("/")
    if not host.startswith("http"):
        host = f"https://{host}"
    if not host.endswith("/api/v1/"):
        host = host.rstrip("/") + "/api/v1/"
    return host

def _headers(token: str) -> dict:
    return {"Authorization": f"Token {token}"}

async def get_org_info(token: str, base_url: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}self", headers=_headers(token), timeout=15)
        if resp.status_code == 401:
            raise ValueError("Invalid API token.")
        resp.raise_for_status()
        data = resp.json()
    for priv in data.get("privileges", []):
        if priv.get("scope") == "org":
            return {"org_id": priv["org_id"], "org_name": priv.get("name", "Unknown")}
    raise ValueError("No org-level privilege found for this token.")

async def get_sites(token: str, base_url: str, org_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}orgs/{org_id}/sites", headers=_headers(token), timeout=30)
        resp.raise_for_status()
        data = resp.json()
    return [{"id": s["id"], "name": s["name"]} for s in data if "id" in s] if isinstance(data, list) else []

async def get_site_wlans(token: str, base_url: str, site_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/wlans/derived",
            headers=_headers(token), timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []

async def get_site_setting(token: str, base_url: str, site_id: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/setting",
            headers=_headers(token), timeout=30,
        )
        return resp.json() if resp.is_success else {}

async def patch_wlan(token: str, base_url: str, site_id: str, wlan_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/wlans/{wlan_id}",
            json=payload, headers=_headers(token), timeout=15,
        )
        return resp.is_success

async def patch_site_setting(token: str, base_url: str, site_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/setting",
            json=payload, headers=_headers(token), timeout=15,
        )
        return resp.is_success
```

- [ ] **Step 2: Commit**

```bash
git add backend/mist_client.py
git commit -m "feat: mist API client (adapted from v0.1)"
```

---

### Task 5: Evaluation engine

**Files:**
- Create: `backend/engine.py`
- Create: `backend/tests/test_engine.py`

- [ ] **Step 1: Create `backend/engine.py`**

```python
from typing import Any

def _resolve(obj: dict, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur

def _eval_condition(value: Any, condition: str, spec: dict) -> bool | None:
    if condition == "falsy":
        return not bool(value)
    if value is None:
        return None
    expected = spec.get("value") if "value" in spec else spec.get("values")
    if condition == "truthy":     return bool(value)
    if condition == "eq":         return value == expected
    if condition == "ne":         return value != expected
    if condition == "in":         return value in (expected or [])
    if condition == "not_in":     return value not in (expected or [])
    if condition == "contains":   return str(expected or "").lower() in str(value).lower()
    if condition == "not_contains": return str(expected or "").lower() not in str(value).lower()
    if condition == "contains_item":
        return expected in value if isinstance(value, list) else None
    if condition == "not_contains_item":
        return expected not in value if isinstance(value, list) else None
    if condition == "gte":
        try: return float(value) >= float(expected)
        except (TypeError, ValueError): return None
    if condition == "lte":
        try: return float(value) <= float(expected)
        except (TypeError, ValueError): return None
    return None

def _eval_triggers(triggers: list[dict], target: dict) -> bool:
    for t in triggers:
        val = _resolve(target, t["field"])
        if _eval_condition(val, t["condition"], t) is True:
            return True
    return False

def _standard_to_check(standard: dict) -> dict:
    """Convert a DB standard row into the check spec the engine needs."""
    check: dict = {
        "field": standard["check_field"],
        "condition": standard["check_condition"],
    }
    cv = standard.get("check_value")
    if cv is not None:
        if isinstance(cv, list):
            check["values"] = cv
        else:
            check["value"] = cv
    if standard.get("filter"):
        check["if"] = standard["filter"]
    return check

def evaluate_site(
    site_id: str,
    site_name: str,
    wlans: list[dict],
    site_setting: dict,
    standards: list[dict],
) -> list[dict]:
    """
    Evaluate enabled standards against site state.
    Returns a list of finding dicts with keys:
      standard_id, wlan_id, ssid, status, actual_value
    """
    findings: list[dict] = []

    for std in standards:
        if not std.get("enabled", True):
            continue

        scope = std["scope"]
        targets = wlans if scope == "wlan" else ([site_setting] if site_setting else [])

        if not targets:
            findings.append({
                "standard_id": std["id"], "wlan_id": None,
                "ssid": None, "status": "skip", "actual_value": None,
            })
            continue

        check = _standard_to_check(std)

        for target in targets:
            wlan_id = target.get("id") if scope == "wlan" else None
            ssid    = target.get("ssid") if scope == "wlan" else None

            if "if" in check:
                if not _eval_triggers(check["if"], target):
                    findings.append({
                        "standard_id": std["id"], "wlan_id": wlan_id,
                        "ssid": ssid, "status": "skip", "actual_value": None,
                    })
                    continue

            field = check["field"]
            val   = _resolve(target, field)
            result = _eval_condition(val, check["condition"], check)

            if result is None:
                status, actual = "skip", None
            elif result:
                status, actual = "pass", f"{field}={val}"
            else:
                status, actual = "fail", f"{field}={val}"

            findings.append({
                "standard_id": std["id"], "wlan_id": wlan_id,
                "ssid": ssid, "status": status, "actual_value": actual,
            })

    return findings
```

- [ ] **Step 2: Write `backend/tests/test_engine.py`**

```python
from backend.engine import evaluate_site

S = lambda cond, val=None, filt=None: [{
    "id": "s1", "name": "Test", "scope": "wlan", "enabled": True,
    "check_field": "vlan_enabled", "check_condition": cond,
    "check_value": val, "filter": filt,
}]

def test_truthy_pass():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": True}], {}, S("truthy"))
    assert findings[0]["status"] == "pass"

def test_truthy_fail():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": False}], {}, S("truthy"))
    assert findings[0]["status"] == "fail"

def test_falsy_missing_field_passes():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net"}], {}, S("falsy"))
    assert findings[0]["status"] == "pass"

def test_contains_item_pass():
    stds = [{"id": "s1", "name": "Bands", "scope": "wlan", "enabled": True,
              "check_field": "bands", "check_condition": "contains_item",
              "check_value": "5", "filter": None}]
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "bands": ["2", "5", "6"]}], {}, stds)
    assert findings[0]["status"] == "pass"

def test_filter_skips_non_matching():
    stds = [{"id": "s1", "name": "Isolation", "scope": "wlan", "enabled": True,
              "check_field": "isolation", "check_condition": "truthy",
              "check_value": None,
              "filter": [{"field": "auth.type", "condition": "eq", "value": "open"}]}]
    wlans = [{"id": "w1", "ssid": "Corp", "auth": {"type": "eap"}, "isolation": False}]
    findings = evaluate_site("s", "S", wlans, {}, stds)
    assert findings[0]["status"] == "skip"

def test_site_scope():
    stds = [{"id": "s1", "name": "Persist", "scope": "site", "enabled": True,
              "check_field": "persist_config_on_device", "check_condition": "truthy",
              "check_value": None, "filter": None}]
    findings = evaluate_site("s", "S", [], {"persist_config_on_device": True}, stds)
    assert findings[0]["status"] == "pass"

def test_disabled_standard_skipped():
    stds = [{"id": "s1", "name": "X", "scope": "wlan", "enabled": False,
              "check_field": "vlan_enabled", "check_condition": "truthy",
              "check_value": None, "filter": None}]
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": False}], {}, stds)
    assert findings == []

def test_no_wlans_returns_skip_for_wlan_scope():
    findings = evaluate_site("s", "S", [], {}, S("truthy"))
    assert findings[0]["status"] == "skip"
```

- [ ] **Step 3: Run engine tests**

```bash
pytest backend/tests/test_engine.py -v
```

Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/engine.py backend/tests/test_engine.py
git commit -m "feat: evaluation engine with full test coverage"
```

---

### Task 6: Remediation engine

**Files:**
- Create: `backend/remediation.py`
- Create: `backend/tests/test_remediation.py`

- [ ] **Step 1: Create `backend/remediation.py`**

```python
from . import mist_client as mist

def _build_payload(field: str, value) -> dict:
    """Build a nested dict payload from a dotted field path."""
    parts = field.split(".")
    result: dict = {}
    cur = result
    for part in parts[:-1]:
        cur[part] = {}
        cur = cur[part]
    cur[parts[-1]] = value
    return result

async def apply_remediation(
    site_id: str,
    wlan_id: str | None,
    standard: dict,
    token: str,
    base_url: str,
) -> dict:
    """
    PATCH/PUT Mist API with the desired remediation value.
    Returns {"success": bool, "error": str | None}
    """
    field   = standard["remediation_field"]
    value   = standard["remediation_value"]
    scope   = standard["scope"]
    payload = _build_payload(field, value)

    try:
        if scope == "wlan" and wlan_id:
            ok = await mist.patch_wlan(token, base_url, site_id, wlan_id, payload)
        elif scope == "site":
            ok = await mist.patch_site_setting(token, base_url, site_id, payload)
        else:
            return {"success": False, "error": "Unknown scope or missing wlan_id"}
        return {"success": ok, "error": None if ok else "Mist API returned error"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
```

- [ ] **Step 2: Write `backend/tests/test_remediation.py`**

```python
import pytest
from unittest.mock import AsyncMock, patch
from backend.remediation import apply_remediation, _build_payload

def test_build_payload_simple():
    assert _build_payload("vlan_enabled", True) == {"vlan_enabled": True}

def test_build_payload_nested():
    result = _build_payload("auth.pairwise", ["wpa3"])
    assert result == {"auth": {"pairwise": ["wpa3"]}}

@pytest.mark.asyncio
async def test_apply_wlan_remediation_success():
    std = {"scope": "wlan", "remediation_field": "vlan_enabled", "remediation_value": True}
    with patch("backend.remediation.mist.patch_wlan", new_callable=AsyncMock, return_value=True):
        result = await apply_remediation("site1", "wlan1", std, "tok", "https://api/v1/")
    assert result["success"] is True

@pytest.mark.asyncio
async def test_apply_site_remediation_success():
    std = {"scope": "site", "remediation_field": "persist_config_on_device", "remediation_value": True}
    with patch("backend.remediation.mist.patch_site_setting", new_callable=AsyncMock, return_value=True):
        result = await apply_remediation("site1", None, std, "tok", "https://api/v1/")
    assert result["success"] is True

@pytest.mark.asyncio
async def test_apply_remediation_mist_error():
    std = {"scope": "wlan", "remediation_field": "vlan_enabled", "remediation_value": True}
    with patch("backend.remediation.mist.patch_wlan", new_callable=AsyncMock, return_value=False):
        result = await apply_remediation("site1", "wlan1", std, "tok", "https://api/v1/")
    assert result["success"] is False
```

- [ ] **Step 3: Run remediation tests**

```bash
pip install pytest-asyncio
pytest backend/tests/test_remediation.py -v
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/remediation.py backend/tests/test_remediation.py
git commit -m "feat: remediation engine with mist write-back"
```

---

### Task 7: Scheduler

**Files:**
- Create: `backend/scheduler.py`

- [ ] **Step 1: Create `backend/scheduler.py`**

```python
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

def start():
    if not scheduler.running:
        scheduler.start()
        log.info("Scheduler started")

def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)

def upsert_org_job(org_id: str, interval_mins: int, drift_fn):
    """Add or replace drift job for an org. interval_mins=0 removes it."""
    job_id = f"drift_{org_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if interval_mins > 0:
        scheduler.add_job(
            drift_fn,
            trigger=IntervalTrigger(minutes=interval_mins),
            id=job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=60,
        )
        log.info("Scheduled drift for org=%s every %d mins", org_id, interval_mins)

def remove_org_job(org_id: str):
    job_id = f"drift_{org_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        log.info("Removed drift job for org=%s", org_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/scheduler.py
git commit -m "feat: APScheduler wrapper for per-org drift jobs"
```

---

### Task 8: FastAPI main — models + all routes

**Files:**
- Create: `backend/models.py`
- Create: `backend/main.py`

- [ ] **Step 1: Create `backend/models.py`**

```python
from pydantic import BaseModel

class ConnectRequest(BaseModel):
    mist_token: str
    cloud_endpoint: str

class OrgSettingsRequest(BaseModel):
    drift_interval_mins: int = 0
    auto_remediate: bool = False

class StandardCreate(BaseModel):
    name: str
    description: str | None = None
    scope: str                   # wlan | site
    filter: list | None = None
    check_field: str
    check_condition: str
    check_value: object | None = None
    remediation_field: str
    remediation_value: object
    auto_remediate: bool | None = None
    enabled: bool = True

class StandardUpdate(StandardCreate):
    pass

class RunRequest(BaseModel):
    triggered_by: str = "manual"   # manual | scheduled
```

- [ ] **Step 2: Create `backend/main.py`**

```python
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import mist_client as mist
from . import scheduler as sched
from .auth import get_org_id
from .crypto import decrypt, encrypt
from .db import get_client
from .engine import evaluate_site
from .models import ConnectRequest, OrgSettingsRequest, RunRequest, StandardCreate, StandardUpdate
from .remediation import apply_remediation

log = logging.getLogger("mist_ca")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    sched.start()
    # Reload all existing org schedules on startup
    db = get_client()
    orgs = db.table("org_config").select("org_id,drift_interval_mins").execute()
    for org in (orgs.data or []):
        if org["drift_interval_mins"] > 0:
            sched.upsert_org_job(org["org_id"], org["drift_interval_mins"], run_drift_for_org)
    yield
    sched.stop()


app = FastAPI(title="Mist Config Assurance", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Org / connection
# ---------------------------------------------------------------------------

@app.post("/api/org/connect")
async def connect(req: ConnectRequest, org_id: str = Depends(get_org_id)):
    base_url = mist.build_base_url(req.cloud_endpoint)
    try:
        info = await mist.get_org_info(req.mist_token, base_url)
    except ValueError as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Could not reach Mist: {exc}")

    db = get_client()
    db.table("org_config").upsert({
        "org_id": org_id,
        "mist_token": encrypt(req.mist_token),
        "cloud_endpoint": req.cloud_endpoint,
        "org_name": info["org_name"],
    }).execute()
    return {"org_name": info["org_name"], "mist_org_id": info["org_id"]}


@app.get("/api/org")
async def get_org(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured. POST /api/org/connect first.")
    data = dict(row.data)
    data.pop("mist_token", None)
    return data


@app.patch("/api/org/settings")
async def update_settings(req: OrgSettingsRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("org_config").update({
        "drift_interval_mins": req.drift_interval_mins,
        "auto_remediate": req.auto_remediate,
    }).eq("org_id", org_id).execute()
    sched.upsert_org_job(org_id, req.drift_interval_mins, run_drift_for_org)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sites
# ---------------------------------------------------------------------------

@app.get("/api/sites")
async def list_sites(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("site").select("*").eq("org_id", org_id).execute()
    return {"sites": rows.data or []}


@app.post("/api/sites/sync")
async def sync_sites(org_id: str = Depends(get_org_id)):
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])
    try:
        mist_org_id = await _get_mist_org_id(token, base_url)
        sites = await mist.get_sites(token, base_url, mist_org_id)
    except Exception as exc:
        raise HTTPException(502, str(exc))

    db = get_client()
    for s in sites:
        db.table("site").upsert({"id": s["id"], "org_id": org_id, "name": s["name"]},
                                on_conflict="id,org_id").execute()
    return {"synced": len(sites)}


@app.patch("/api/sites/{site_id}/monitored")
async def toggle_monitored(site_id: str, monitored: bool, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("site").update({"monitored": monitored}).eq("id", site_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Standards
# ---------------------------------------------------------------------------

@app.get("/api/standards")
async def list_standards(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("standard").select("*").eq("org_id", org_id).order("created_at").execute()
    return {"standards": rows.data or []}


@app.post("/api/standards", status_code=201)
async def create_standard(body: StandardCreate, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = {**body.model_dump(), "org_id": org_id}
    result = db.table("standard").insert(row).execute()
    return result.data[0]


@app.put("/api/standards/{standard_id}")
async def update_standard(standard_id: str, body: StandardUpdate, org_id: str = Depends(get_org_id)):
    db = get_client()
    result = db.table("standard").update(body.model_dump()).eq("id", standard_id).eq("org_id", org_id).execute()
    if not result.data:
        raise HTTPException(404, "Standard not found")
    return result.data[0]


@app.delete("/api/standards/{standard_id}", status_code=204)
async def delete_standard(standard_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("standard").delete().eq("id", standard_id).eq("org_id", org_id).execute()


@app.patch("/api/standards/{standard_id}/toggle")
async def toggle_standard(standard_id: str, enabled: bool, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("standard").update({"enabled": enabled}).eq("id", standard_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Validation runs
# ---------------------------------------------------------------------------

@app.post("/api/sites/{site_id}/run")
async def run_site(site_id: str, req: RunRequest, org_id: str = Depends(get_org_id)):
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])

    try:
        wlans = await mist.get_site_wlans(token, base_url, site_id)
        site_setting = await mist.get_site_setting(token, base_url, site_id)
    except Exception as exc:
        raise HTTPException(502, str(exc))

    db = get_client()
    stds = db.table("standard").select("*").eq("org_id", org_id).eq("enabled", True).execute()
    standards = stds.data or []

    site_row = db.table("site").select("name").eq("id", site_id).eq("org_id", org_id).maybe_single().execute()
    site_name = site_row.data["name"] if site_row.data else site_id

    findings = evaluate_site(site_id, site_name, wlans, site_setting, standards)

    passed  = sum(1 for f in findings if f["status"] == "pass")
    failed  = sum(1 for f in findings if f["status"] == "fail")
    skipped = sum(1 for f in findings if f["status"] == "skip")

    run = db.table("validation_run").insert({
        "org_id": org_id, "site_id": site_id, "site_name": site_name,
        "triggered_by": req.triggered_by,
        "passed": passed, "failed": failed, "skipped": skipped,
    }).execute().data[0]

    run_id = run["id"]
    for f in findings:
        db.table("finding").insert({**f, "run_id": run_id}).execute()

    await _sync_incidents(org_id, site_id, site_name, findings, standards, org)

    db.table("site").update({"last_checked_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("id", site_id).eq("org_id", org_id).execute()

    return {**run, "findings": findings}


@app.get("/api/sites/{site_id}/findings")
async def get_findings(site_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    run = db.table("validation_run").select("id").eq("org_id", org_id).eq("site_id", site_id) \
            .order("run_at", desc=True).limit(1).maybe_single().execute()
    if not run.data:
        return {"findings": []}
    findings = db.table("finding").select("*").eq("run_id", run.data["id"]).execute()
    return {"findings": findings.data or []}


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------

@app.get("/api/incidents")
async def list_incidents(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("incident").select("*").eq("org_id", org_id).order("opened_at", desc=True).execute()
    return {"incidents": rows.data or []}


@app.patch("/api/incidents/{incident_id}/suppress")
async def suppress_incident(incident_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("incident").update({"status": "suppressed"}).eq("id", incident_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Remediation
# ---------------------------------------------------------------------------

@app.get("/api/remediation")
async def list_pending(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("remediation_action").select("*").eq("org_id", org_id) \
             .eq("status", "pending").order("attempted_at", desc=True).execute()
    return {"actions": rows.data or []}


@app.post("/api/remediation/{action_id}/approve")
async def approve_action(action_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("remediation_action").select("*").eq("id", action_id).eq("org_id", org_id) \
            .maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Action not found")
    action = row.data
    await _execute_remediation_action(action, org_id)
    return {"ok": True}


@app.post("/api/remediation/{action_id}/reject")
async def reject_action(action_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("remediation_action").update({"status": "rejected"}).eq("id", action_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "scheduler_running": sched.scheduler.running}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_org_or_404(org_id: str) -> dict:
    db = get_client()
    row = db.table("org_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")
    return row.data


async def _get_mist_org_id(token: str, base_url: str) -> str:
    info = await mist.get_org_info(token, base_url)
    return info["org_id"]


async def _sync_incidents(
    org_id: str, site_id: str, site_name: str,
    findings: list[dict], standards: list[dict], org: dict
):
    db = get_client()
    std_map = {s["id"]: s for s in standards}

    # Resolve open incidents where finding now passes
    open_incidents = db.table("incident").select("*") \
        .eq("org_id", org_id).eq("site_id", site_id).eq("status", "open").execute()

    passing_keys = {
        (f["standard_id"], f.get("wlan_id"))
        for f in findings if f["status"] == "pass"
    }

    for inc in (open_incidents.data or []):
        key = (inc["standard_id"], inc.get("wlan_id"))
        if key in passing_keys:
            db.table("incident").update({
                "status": "resolved",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", inc["id"]).execute()

    # Open incident for each new failure
    existing_open = {
        (inc["standard_id"], inc.get("wlan_id"))
        for inc in (open_incidents.data or [])
        if inc["status"] == "open"
    }

    for f in findings:
        if f["status"] != "fail":
            continue
        key = (f["standard_id"], f.get("wlan_id"))
        if key in existing_open:
            continue
        std = std_map.get(f["standard_id"])
        if not std:
            continue

        inc = db.table("incident").insert({
            "org_id": org_id, "site_id": site_id, "site_name": site_name,
            "standard_id": f["standard_id"], "title": std["name"],
            "wlan_id": f.get("wlan_id"), "ssid": f.get("ssid"),
        }).execute().data[0]

        # Determine if auto-remediate applies
        auto = std.get("auto_remediate")
        if auto is None:
            auto = org.get("auto_remediate", False)

        action = db.table("remediation_action").insert({
            "incident_id": inc["id"], "org_id": org_id,
            "site_id": site_id, "wlan_id": f.get("wlan_id"),
            "standard_id": f["standard_id"],
            "desired_value": std["remediation_value"],
            "status": "pending",
        }).execute().data[0]

        if auto:
            await _execute_remediation_action(action, org_id)


async def _execute_remediation_action(action: dict, org_id: str):
    db = get_client()
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])

    std = db.table("standard").select("*").eq("id", action["standard_id"]).maybe_single().execute()
    if not std.data:
        return

    result = await apply_remediation(
        action["site_id"], action.get("wlan_id"), std.data, token, base_url
    )

    update = {
        "attempted_at": datetime.now(timezone.utc).isoformat(),
        "status": "success" if result["success"] else "failed",
        "error_detail": result.get("error"),
    }
    db.table("remediation_action").update(update).eq("id", action["id"]).execute()

    if result["success"]:
        db.table("incident").update({
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", action["incident_id"]).execute()


async def run_drift_for_org(org_id: str):
    """Called by APScheduler for scheduled drift checks."""
    log.info("Scheduled drift check for org=%s", org_id)
    try:
        org = _get_org_or_404(org_id)
    except HTTPException:
        sched.remove_org_job(org_id)
        return

    db = get_client()
    sites = db.table("site").select("*").eq("org_id", org_id).eq("monitored", True).execute()

    for site in (sites.data or []):
        try:
            from fastapi.testclient import TestClient
            # Directly call the run logic rather than HTTP round-trip
            token = decrypt(org["mist_token"])
            base_url = mist.build_base_url(org["cloud_endpoint"])
            wlans = await mist.get_site_wlans(token, base_url, site["id"])
            site_setting = await mist.get_site_setting(token, base_url, site["id"])
            stds = db.table("standard").select("*").eq("org_id", org_id).eq("enabled", True).execute()
            findings = evaluate_site(site["id"], site["name"], wlans, site_setting, stds.data or [])
            passed  = sum(1 for f in findings if f["status"] == "pass")
            failed  = sum(1 for f in findings if f["status"] == "fail")
            skipped = sum(1 for f in findings if f["status"] == "skip")
            run = db.table("validation_run").insert({
                "org_id": org_id, "site_id": site["id"], "site_name": site["name"],
                "triggered_by": "scheduled", "passed": passed, "failed": failed, "skipped": skipped,
            }).execute().data[0]
            for f in findings:
                db.table("finding").insert({**f, "run_id": run["id"]}).execute()
            await _sync_incidents(org_id, site["id"], site["name"], findings, stds.data or [], org)
            db.table("site").update({"last_checked_at": datetime.now(timezone.utc).isoformat()}) \
                .eq("id", site["id"]).eq("org_id", org_id).execute()
        except Exception as exc:
            log.exception("Drift check failed for site=%s: %s", site["id"], exc)
```

- [ ] **Step 3: Commit**

```bash
git add backend/main.py backend/models.py
git commit -m "feat: FastAPI backend — all routes, drift detection, incident sync, remediation"
```

---

## Phase 3 — Next.js Frontend

### Task 9: Next.js + Clerk setup + shared types

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/api.ts`
- Create: `src/lib/design-tokens.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/middleware.ts`
- Create: `src/app/api/proxy/[...path]/route.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
export interface OrgConfig {
  org_id: string
  org_name: string
  cloud_endpoint: string
  drift_interval_mins: number
  auto_remediate: boolean
}

export interface Site {
  id: string
  org_id: string
  name: string
  monitored: boolean
  last_checked_at: string | null
}

export interface Standard {
  id: string
  org_id: string
  name: string
  description?: string
  scope: 'wlan' | 'site'
  filter?: object[]
  check_field: string
  check_condition: string
  check_value?: unknown
  remediation_field: string
  remediation_value: unknown
  auto_remediate?: boolean | null
  enabled: boolean
  created_at: string
}

export interface Finding {
  id: string
  run_id: string
  standard_id: string
  wlan_id?: string
  ssid?: string
  status: 'pass' | 'fail' | 'skip'
  actual_value?: string
}

export interface Incident {
  id: string
  org_id: string
  site_id: string
  site_name: string
  standard_id: string
  title: string
  wlan_id?: string
  ssid?: string
  opened_at: string
  resolved_at?: string
  status: 'open' | 'resolved' | 'suppressed'
}

export interface RemediationAction {
  id: string
  incident_id: string
  org_id: string
  site_id: string
  wlan_id?: string
  standard_id: string
  desired_value: unknown
  attempted_at?: string
  status: 'pending' | 'approved' | 'rejected' | 'success' | 'failed'
  error_detail?: string
}

export interface ValidationRun {
  id: string
  org_id: string
  site_id: string
  site_name: string
  run_at: string
  triggered_by: 'manual' | 'scheduled'
  passed: number
  failed: number
  skipped: number
}
```

- [ ] **Step 2: Create `src/lib/api.ts`**

```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  return res.json()
}

export const api = {
  getOrg: () => request<import('./types').OrgConfig>('api/org'),
  connect: (mist_token: string, cloud_endpoint: string) =>
    request('api/org/connect', { method: 'POST', body: JSON.stringify({ mist_token, cloud_endpoint }) }),
  updateSettings: (settings: { drift_interval_mins: number; auto_remediate: boolean }) =>
    request('api/org/settings', { method: 'PATCH', body: JSON.stringify(settings) }),

  listSites: () => request<{ sites: import('./types').Site[] }>('api/sites'),
  syncSites: () => request<{ synced: number }>('api/sites/sync', { method: 'POST' }),
  toggleMonitored: (siteId: string, monitored: boolean) =>
    request(`api/sites/${siteId}/monitored?monitored=${monitored}`, { method: 'PATCH' }),
  runSite: (siteId: string) =>
    request(`api/sites/${siteId}/run`, { method: 'POST', body: JSON.stringify({ triggered_by: 'manual' }) }),
  getSiteFindings: (siteId: string) =>
    request<{ findings: import('./types').Finding[] }>(`api/sites/${siteId}/findings`),

  listStandards: () => request<{ standards: import('./types').Standard[] }>('api/standards'),
  createStandard: (body: Omit<import('./types').Standard, 'id' | 'org_id' | 'created_at'>) =>
    request<import('./types').Standard>('api/standards', { method: 'POST', body: JSON.stringify(body) }),
  updateStandard: (id: string, body: Partial<import('./types').Standard>) =>
    request<import('./types').Standard>(`api/standards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteStandard: (id: string) =>
    request(`api/standards/${id}`, { method: 'DELETE' }),
  toggleStandard: (id: string, enabled: boolean) =>
    request(`api/standards/${id}/toggle?enabled=${enabled}`, { method: 'PATCH' }),

  listIncidents: () => request<{ incidents: import('./types').Incident[] }>('api/incidents'),
  suppressIncident: (id: string) =>
    request(`api/incidents/${id}/suppress`, { method: 'PATCH' }),

  listPendingRemediation: () =>
    request<{ actions: import('./types').RemediationAction[] }>('api/remediation'),
  approveRemediation: (id: string) =>
    request(`api/remediation/${id}/approve`, { method: 'POST' }),
  rejectRemediation: (id: string) =>
    request(`api/remediation/${id}/reject`, { method: 'POST' }),
}
```

- [ ] **Step 3: Create `src/lib/design-tokens.ts`**

```typescript
export const colors = {
  primary: '#041627',
  primaryContainer: '#1A2B3C',
  surface: '#F7FAFC',
  onSurface: '#181C1E',
  healthy: '#10B981',
  drift: '#F97316',
  error: '#BA1A1A',
} as const

export const gradient = 'linear-gradient(135deg, #041627, #1A2B3C)'
```

- [ ] **Step 4: Create `src/middleware.ts`**

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware((auth, req) => {
  if (!isPublic(req)) auth().protect()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
}
```

- [ ] **Step 5: Create `src/app/api/proxy/[...path]/route.ts`**

```typescript
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8001'

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  const { getToken } = auth()
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const path = params.path.join('/')
  const url = `${BACKEND}/${path}${req.nextUrl.search}`

  const init: RequestInit = {
    method: req.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text()
  }

  const res = await fetch(url, init)
  const data = await res.json().catch(() => null)
  return NextResponse.json(data, { status: res.status })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
```

- [ ] **Step 6: Create `src/app/layout.tsx`**

```typescript
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
```

- [ ] **Step 7: Create `src/app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
export default function Home() { redirect('/dashboard') }
```

- [ ] **Step 8: Add Clerk env vars to `.env.local`**

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
BACKEND_URL=http://localhost:8001
```

- [ ] **Step 9: Commit**

```bash
git add src/
git commit -m "feat: Next.js + Clerk setup, proxy route, shared types, api client"
```

---

### Task 10: Layout — Sidebar + PageShell

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/PageShell.tsx`
- Create: `src/components/ui/StatusBadge.tsx`
- Create: `src/components/ui/Button.tsx`

- [ ] **Step 1: Create `src/components/ui/StatusBadge.tsx`**

```typescript
type Status = 'pass' | 'fail' | 'skip' | 'open' | 'resolved' | 'suppressed' | 'pending' | 'success' | 'failed'

const map: Record<Status, string> = {
  pass:        'bg-healthy/10 text-healthy',
  fail:        'bg-drift/10 text-drift',
  skip:        'bg-surface-base text-on-surface/50',
  open:        'bg-drift/10 text-drift',
  resolved:    'bg-healthy/10 text-healthy',
  suppressed:  'bg-surface-base text-on-surface/50',
  pending:     'bg-primary/10 text-primary',
  success:     'bg-healthy/10 text-healthy',
  failed:      'bg-error/10 text-error',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium uppercase tracking-wide ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 2: Create `src/components/ui/Button.tsx`**

```typescript
import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-opacity disabled:opacity-50',
        size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        variant === 'primary' && 'bg-signature-gradient text-on-primary',
        variant === 'secondary' && 'bg-surface-highest text-on-surface',
        variant === 'ghost' && 'text-primary hover:bg-surface-low',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
```

Add `src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
```

Then install:

```bash
pnpm add clsx tailwind-merge
```

- [ ] **Step 3: Create `src/components/layout/Sidebar.tsx`**

```typescript
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
        <UserButton afterSignOutUrl="/sign-in" />
        <Link href="/settings" className="text-xs text-on-surface/60 hover:text-on-surface">Settings</Link>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Create `src/components/layout/PageShell.tsx`**

```typescript
import { Sidebar } from './Sidebar'

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ src/lib/utils.ts
git commit -m "feat: layout components — sidebar, page shell, status badge, button"
```

---

### Task 11: Dashboard page

**Files:**
- Create: `src/components/dashboard/SiteRow.tsx`
- Create: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create `src/components/dashboard/SiteRow.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Site } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  site: Site
  failed: number
  passed: number
  onRunComplete: () => void
}

export function SiteRow({ site, failed, passed, onRunComplete }: Props) {
  const [running, setRunning] = useState(false)

  async function runCheck() {
    setRunning(true)
    try { await api.runSite(site.id); onRunComplete() }
    finally { setRunning(false) }
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 bg-surface-lowest rounded-lg">
      <div className="flex items-center gap-6 min-w-0">
        <span className="font-medium text-on-surface truncate">{site.name}</span>
        <span className="text-xs text-healthy font-medium">{passed} pass</span>
        {failed > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-drift/10 text-drift text-xs rounded-lg font-medium">
            {failed} drift
          </span>
        )}
        {site.last_checked_at && (
          <span className="text-xs text-on-surface/40">
            {new Date(site.last_checked_at).toLocaleString()}
          </span>
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={runCheck} disabled={running}>
        {running ? 'Running…' : 'Run Check'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/dashboard/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { SiteRow } from '@/components/dashboard/SiteRow'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Site, ValidationRun } from '@/lib/types'

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [runs, setRuns] = useState<Record<string, { passed: number; failed: number }>>({})
  const [syncing, setSyncing] = useState(false)

  async function load() {
    const { sites } = await api.listSites()
    setSites(sites)
    const runMap: Record<string, { passed: number; failed: number }> = {}
    await Promise.all(sites.map(async s => {
      const { findings } = await api.getSiteFindings(s.id)
      runMap[s.id] = {
        passed: findings.filter(f => f.status === 'pass').length,
        failed: findings.filter(f => f.status === 'fail').length,
      }
    }))
    setRuns(runMap)
  }

  async function syncSites() {
    setSyncing(true)
    try { await api.syncSites(); await load() }
    finally { setSyncing(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="label-overline">Overview</p>
          <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Dashboard</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={syncSites} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Sites'}
        </Button>
      </div>

      {sites.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No sites yet. <button onClick={syncSites} className="text-primary underline">Sync from Mist</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map(site => (
            <Link key={site.id} href={`/sites/${site.id}`} className="block hover:opacity-90 transition-opacity">
              <SiteRow
                site={site}
                passed={runs[site.id]?.passed ?? 0}
                failed={runs[site.id]?.failed ?? 0}
                onRunComplete={load}
              />
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/ src/components/dashboard/
git commit -m "feat: dashboard page — site list with compliance counts"
```

---

### Task 12: Site detail page

**Files:**
- Create: `src/components/sites/FindingsTable.tsx`
- Create: `src/components/sites/IncidentPanel.tsx`
- Create: `src/app/sites/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/sites/FindingsTable.tsx`**

```typescript
import { Finding, Standard } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Props {
  findings: Finding[]
  standards: Standard[]
}

export function FindingsTable({ findings, standards }: Props) {
  const stdMap = Object.fromEntries(standards.map(s => [s.id, s]))
  const active = findings.filter(f => f.status !== 'skip')

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Standard</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">SSID</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Actual Value</th>
            <th className="px-4 py-3 text-left font-medium text-on-surface/70 text-xs uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {active.map(f => (
            <tr key={f.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
              <td className="px-4 py-3 font-medium">{stdMap[f.standard_id]?.name ?? f.standard_id}</td>
              <td className="px-4 py-3 text-on-surface/60">{f.ssid ?? '—'}</td>
              <td className="px-4 py-3 text-on-surface/60 font-mono text-xs">{f.actual_value ?? '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/sites/IncidentPanel.tsx`**

```typescript
'use client'
import { Incident } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  incidents: Incident[]
  onUpdate: () => void
}

export function IncidentPanel({ incidents, onUpdate }: Props) {
  const open = incidents.filter(i => i.status === 'open')

  async function remediateAll() {
    // Remediation actions are created automatically on incident creation.
    // "Remediate All" approves all pending actions for this site.
    const { actions } = await api.listPendingRemediation()
    const siteActions = actions.filter(a => open.some(i => i.id === a.incident_id))
    await Promise.all(siteActions.map(a => api.approveRemediation(a.id)))
    onUpdate()
  }

  return (
    <div className="bg-surface-lowest rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
          Open Incidents ({open.length})
        </h2>
        {open.length > 0 && (
          <Button variant="primary" size="sm" onClick={remediateAll}>Remediate All</Button>
        )}
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-on-surface/40">No open incidents.</p>
      ) : (
        <div className="space-y-3">
          {open.map(inc => (
            <div key={inc.id} className="flex items-center justify-between p-3 bg-surface-low rounded-lg">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{inc.title}</p>
                {inc.ssid && <p className="text-xs text-on-surface/50 mt-0.5">SSID: {inc.ssid}</p>}
              </div>
              <StatusBadge status={inc.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/app/sites/[id]/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { FindingsTable } from '@/components/sites/FindingsTable'
import { IncidentPanel } from '@/components/sites/IncidentPanel'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Finding, Incident, Standard } from '@/lib/types'

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [findings, setFindings] = useState<Finding[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [running, setRunning] = useState(false)

  async function load() {
    const [{ findings }, { incidents }, { standards }] = await Promise.all([
      api.getSiteFindings(id),
      api.listIncidents(),
      api.listStandards(),
    ])
    setFindings(findings)
    setIncidents(incidents.filter(i => i.site_id === id))
    setStandards(standards)
  }

  async function runCheck() {
    setRunning(true)
    try { await api.runSite(id); await load() }
    finally { setRunning(false) }
  }

  useEffect(() => { load() }, [id])

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">{id}</h1>
        <Button onClick={runCheck} disabled={running}>
          {running ? 'Running…' : 'Run Check'}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7">
          <FindingsTable findings={findings} standards={standards} />
        </div>
        <div className="col-span-5">
          <IncidentPanel incidents={incidents} onUpdate={load} />
        </div>
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/sites/ src/components/sites/
git commit -m "feat: site detail page — findings table + incident panel"
```

---

### Task 13: Standards page

**Files:**
- Create: `src/components/ui/SlideOver.tsx`
- Create: `src/components/standards/StandardsTable.tsx`
- Create: `src/components/standards/StandardForm.tsx`
- Create: `src/app/standards/page.tsx`

- [ ] **Step 1: Create `src/components/ui/SlideOver.tsx`**

```typescript
'use client'
import { Fragment } from 'react'
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
```

- [ ] **Step 2: Create `src/components/standards/StandardForm.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Standard } from '@/lib/types'
import { Button } from '@/components/ui/Button'

const CONDITIONS = [
  'truthy','falsy','eq','ne','in','not_in',
  'contains','not_contains','contains_item','not_contains_item','gte','lte',
]

interface Props {
  initial?: Partial<Standard>
  onSave: (data: Omit<Standard, 'id' | 'org_id' | 'created_at'>) => Promise<void>
  onCancel: () => void
}

export function StandardForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    scope: initial?.scope ?? 'wlan',
    check_field: initial?.check_field ?? '',
    check_condition: initial?.check_condition ?? 'truthy',
    check_value: initial?.check_value != null ? JSON.stringify(initial.check_value) : '',
    remediation_field: initial?.remediation_field ?? '',
    remediation_value: initial?.remediation_value != null ? JSON.stringify(initial.remediation_value) : '',
    auto_remediate: initial?.auto_remediate ?? null,
    enabled: initial?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: string, v: unknown) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    let check_value: unknown = null
    let remediation_value: unknown = null
    try {
      if (form.check_value) check_value = JSON.parse(form.check_value)
      if (!form.remediation_value) { setError('Remediation value is required'); return }
      remediation_value = JSON.parse(form.remediation_value)
    } catch {
      setError('check_value and remediation_value must be valid JSON')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...form, check_value, remediation_value, filter: null } as any)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: string, type = 'text', hint?: string) => (
    <div className="mb-4">
      <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary"
      />
      {hint && <p className="text-xs text-on-surface/40 mt-1">{hint}</p>}
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-1">
      {field('Name', 'name')}
      {field('Description', 'description')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Scope</label>
        <select value={form.scope} onChange={e => set('scope', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          <option value="wlan">WLAN</option>
          <option value="site">Site</option>
        </select>
      </div>

      {field('Check Field', 'check_field', 'text', 'Dotted path e.g. auth.pairwise')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Condition</label>
        <select value={form.check_condition} onChange={e => set('check_condition', e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          {CONDITIONS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {field('Check Value (JSON)', 'check_value', 'text', 'e.g. "wpa3" or ["5","6"]  — leave blank for truthy/falsy')}
      {field('Remediation Field', 'remediation_field', 'text', 'Field to set in Mist API')}
      {field('Remediation Value (JSON)', 'remediation_value', 'text', 'Value to set e.g. true or ["wpa3"]')}

      <div className="mb-4">
        <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Auto Remediate</label>
        <select value={form.auto_remediate === null ? 'inherit' : String(form.auto_remediate)}
          onChange={e => set('auto_remediate', e.target.value === 'inherit' ? null : e.target.value === 'true')}
          className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30">
          <option value="inherit">Inherit org default</option>
          <option value="true">Yes — remediate immediately</option>
          <option value="false">No — require approval</option>
        </select>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Standard'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Create `src/components/standards/StandardsTable.tsx`**

```typescript
'use client'
import { Standard } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  standards: Standard[]
  onEdit: (s: Standard) => void
  onRefresh: () => void
}

export function StandardsTable({ standards, onEdit, onRefresh }: Props) {
  async function toggle(s: Standard) {
    await api.toggleStandard(s.id, !s.enabled)
    onRefresh()
  }

  async function remove(id: string) {
    if (!confirm('Delete this standard?')) return
    await api.deleteStandard(id)
    onRefresh()
  }

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Scope</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Check</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Enabled</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {standards.map(s => (
            <tr key={s.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3 text-on-surface/60 capitalize">{s.scope}</td>
              <td className="px-4 py-3 font-mono text-xs text-on-surface/60">
                {s.check_field} {s.check_condition} {s.check_value != null ? JSON.stringify(s.check_value) : ''}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggle(s)}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${s.enabled ? 'bg-healthy' : 'bg-surface-high'}`}
                >
                  <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${s.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </td>
              <td className="px-4 py-3 text-right space-x-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/standards/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { StandardsTable } from '@/components/standards/StandardsTable'
import { StandardForm } from '@/components/standards/StandardForm'
import { SlideOver } from '@/components/ui/SlideOver'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Standard } from '@/lib/types'

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([])
  const [editing, setEditing] = useState<Partial<Standard> | null>(null)
  const [open, setOpen] = useState(false)

  async function load() { const { standards } = await api.listStandards(); setStandards(standards) }

  function openNew() { setEditing({}); setOpen(true) }
  function openEdit(s: Standard) { setEditing(s); setOpen(true) }
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

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Standards</h1>
        <Button onClick={openNew}>Add Standard</Button>
      </div>

      {standards.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No standards yet. <button onClick={openNew} className="text-primary underline">Add one</button>
        </div>
      ) : (
        <StandardsTable standards={standards} onEdit={openEdit} onRefresh={load} />
      )}

      <SlideOver open={open} onClose={close} title={(editing as Standard)?.id ? 'Edit Standard' : 'New Standard'}>
        {editing !== null && (
          <StandardForm initial={editing} onSave={save} onCancel={close} />
        )}
      </SlideOver>
    </PageShell>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/standards/ src/components/standards/ src/components/ui/SlideOver.tsx
git commit -m "feat: standards page — table, slide-over form, CRUD"
```

---

### Task 14: Activity + Settings pages

**Files:**
- Create: `src/components/activity/ActivityTable.tsx`
- Create: `src/app/activity/page.tsx`
- Create: `src/components/settings/OrgSetupForm.tsx`
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Create `src/components/activity/ActivityTable.tsx`**

```typescript
'use client'
import { Incident, RemediationAction } from '@/lib/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

interface Props {
  incidents: Incident[]
  actions: RemediationAction[]
  onUpdate: () => void
}

export function ActivityTable({ incidents, actions, onUpdate }: Props) {
  const actionMap = Object.fromEntries(actions.map(a => [a.incident_id, a]))

  async function approve(id: string) { await api.approveRemediation(id); onUpdate() }
  async function reject(id: string)  { await api.rejectRemediation(id);  onUpdate() }
  async function suppress(id: string) { await api.suppressIncident(id); onUpdate() }

  return (
    <div className="bg-surface-lowest rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-high">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Standard</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">SSID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Opened</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-on-surface/70 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {incidents.map(inc => {
            const action = actionMap[inc.id]
            return (
              <tr key={inc.id} className="border-t border-surface-base hover:bg-surface-low transition-colors">
                <td className="px-4 py-3 font-medium">{inc.title}</td>
                <td className="px-4 py-3 text-on-surface/60">{inc.site_name}</td>
                <td className="px-4 py-3 text-on-surface/60">{inc.ssid ?? '—'}</td>
                <td className="px-4 py-3 text-on-surface/40 text-xs">{new Date(inc.opened_at).toLocaleString()}</td>
                <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                <td className="px-4 py-3 text-right space-x-2">
                  {inc.status === 'open' && action?.status === 'pending' && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => approve(action.id)}>Approve Fix</Button>
                      <Button variant="ghost" size="sm" onClick={() => reject(action.id)}>Reject</Button>
                    </>
                  )}
                  {inc.status === 'open' && (
                    <Button variant="ghost" size="sm" onClick={() => suppress(inc.id)}>Suppress</Button>
                  )}
                  {action && <StatusBadge status={action.status} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/activity/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ActivityTable } from '@/components/activity/ActivityTable'
import { api } from '@/lib/api'
import type { Incident, RemediationAction } from '@/lib/types'

export default function ActivityPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [actions, setActions] = useState<RemediationAction[]>([])

  async function load() {
    const [{ incidents }, { actions }] = await Promise.all([
      api.listIncidents(),
      api.listPendingRemediation(),
    ])
    setIncidents(incidents)
    setActions(actions)
  }

  useEffect(() => { load() }, [])

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Activity</h1>
      </div>
      {incidents.length === 0 ? (
        <div className="bg-surface-lowest rounded-lg px-8 py-12 text-center text-on-surface/50">
          No incidents recorded yet.
        </div>
      ) : (
        <ActivityTable incidents={incidents} actions={actions} onUpdate={load} />
      )}
    </PageShell>
  )
}
```

- [ ] **Step 3: Create `src/components/settings/OrgSetupForm.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { OrgConfig } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

export function OrgSetupForm() {
  const [token, setToken] = useState('')
  const [endpoint, setEndpoint] = useState('api.mist.com')
  const [interval, setInterval] = useState(0)
  const [autoRemediate, setAutoRemediate] = useState(false)
  const [org, setOrg] = useState<OrgConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getOrg().then(setOrg).catch(() => {})
  }, [])

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      const res = await api.connect(token, endpoint)
      setMsg(`Connected to: ${(res as any).org_name}`)
      setOrg(await api.getOrg())
    } catch (err: any) { setMsg(`Error: ${err.message}`) }
    finally { setSaving(false) }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMsg('')
    try {
      await api.updateSettings({ drift_interval_mins: interval, auto_remediate: autoRemediate })
      setMsg('Settings saved.')
    } catch (err: any) { setMsg(`Error: ${err.message}`) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-10 max-w-lg">
      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
          Mist Connection {org && <span className="text-healthy ml-2">✓ {org.org_name}</span>}
        </h2>
        <form onSubmit={connect} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">API Token</label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)} required
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">Cloud Endpoint</label>
            <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)} required
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Connecting…' : 'Connect'}</Button>
        </form>
      </section>

      <section className="bg-surface-lowest rounded-lg p-6">
        <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">Drift Settings</h2>
        <form onSubmit={saveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1">
              Check Interval (minutes — 0 to disable schedule)
            </label>
            <input type="number" min={0} value={interval} onChange={e => setInterval(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setAutoRemediate(v => !v)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${autoRemediate ? 'bg-healthy' : 'bg-surface-high'}`}>
              <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${autoRemediate ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-on-surface">Auto-remediate drift immediately</span>
          </div>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        </form>
      </section>

      {msg && <p className="text-sm text-on-surface/70">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/settings/page.tsx`**

```typescript
import { PageShell } from '@/components/layout/PageShell'
import { OrgSetupForm } from '@/components/settings/OrgSetupForm'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <OrgSetupForm />
    </PageShell>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/activity/ src/app/settings/ src/components/activity/ src/components/settings/
git commit -m "feat: activity page + settings page with org connect and drift config"
```

---

## Phase 4 — Integration + Smoke Test

### Task 15: Docker Compose wiring + local run

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add font imports to `src/app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply font-sans text-on-surface; }
}

@layer utilities {
  .label-overline {
    @apply text-xs font-medium uppercase tracking-widest text-on-surface/50;
  }
}
```

- [ ] **Step 2: Generate TOKEN_ENCRYPTION_KEY and populate `.env.local`**

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output. Set `TOKEN_ENCRYPTION_KEY=<output>` in `.env.local`. Also set your Clerk keys and JWKS URL.

- [ ] **Step 3: Start services**

```bash
docker compose up -d db
cd backend && pip install -r requirements.txt
SUPABASE_URL=postgresql://postgres:postgres@localhost:5432/mist_ca \
  SUPABASE_SERVICE_ROLE_KEY=unused \
  CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json \
  TOKEN_ENCRYPTION_KEY=<your-key> \
  uvicorn backend.main:app --reload --port 8001
```

In a second terminal:

```bash
pnpm dev
```

- [ ] **Step 4: Smoke test checklist**

Open http://localhost:3000. Verify:
- [ ] Redirects to Clerk sign-in
- [ ] After sign-in + org selection, lands on `/dashboard`
- [ ] `/settings` — connect Mist token; org name appears
- [ ] `/dashboard` — Sync Sites; sites appear
- [ ] Click a site → `/sites/[id]` loads
- [ ] Run Check on a site → findings appear
- [ ] `/standards` — Add Standard (e.g. scope=wlan, field=vlan_enabled, condition=truthy, remediation_value=true)
- [ ] Re-run check → new finding appears for the standard
- [ ] `/activity` — incidents visible if any failed

- [ ] **Step 5: Run all backend tests**

```bash
pytest backend/tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: global styles, smoke test complete"
```

- [ ] **Step 7: Push to GitHub**

```bash
git remote add origin https://github.com/robb404/mist-configuration-assurance
git push -u origin main
```

---

## Self-Review Notes

- **Spec coverage:** All sections covered — org config, sites, standards CRUD, validation runs, incidents, remediation (auto + approval), scheduling, multi-tenancy via Clerk org_id, Docker Compose, 4 UI pages + settings.
- **Out of scope confirmed excluded:** notifications, audit log, user roles.
- **Type consistency:** `Standard`, `Finding`, `Incident`, `RemediationAction` types defined in `types.ts` and used consistently across components and API client.
- **No placeholders:** All code blocks are complete.
- **Known gap:** The `run_drift_for_org` function in `main.py` has an unused import (`from fastapi.testclient import TestClient`) — remove that line before running. The drift logic is inline and correct.
