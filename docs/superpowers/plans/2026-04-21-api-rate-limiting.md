# API Rate Limiting & Call Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Mist API usage within the 5,000 calls/hour limit at any org scale by adding a staggered polling scheduler, a webhook mode for event-driven checks, live call budget transparency in the UI, and a minimum-safe-interval enforcer.

**Architecture:** Two operating modes stored in `org_config.mode`. Polling mode staggered checks evenly across the configured interval with a per-org call counter. Webhook mode pauses the polling scheduler, receives Mist audit events via a public Next.js route (forwarded to FastAPI), and keeps a daily safety-net scan. A `rate_limiter` module owns all budget math. A new `ApiUsagePanel` component surfaces usage live in Settings.

**Tech Stack:** FastAPI, APScheduler, Supabase, Next.js App Router (TypeScript)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/006_rate_limiting.sql` | Create | Add `mode`, `webhook_secret`, `calls_used_this_hour`, `calls_window_start` to `org_config` |
| `backend/rate_limiter.py` | Create | Budget math: `min_interval_mins`, `can_check`, `budget_summary`, `increment_calls` |
| `backend/tests/test_rate_limiter.py` | Create | Unit tests for rate_limiter |
| `backend/models.py` | Modify | Add `mode` field to `OrgSettingsRequest` |
| `backend/scheduler.py` | Modify | Staggered dispatch, webhook mode (daily scan at 02:00 UTC) |
| `backend/main.py` | Modify | New endpoints: webhook receiver, org usage, webhook setup; staggered drift loop; rate limiter wiring |
| `.env.example` | Modify | Add `APP_URL` (backend-facing public URL for webhook URL generation) |
| `backend/.env` | Modify | Add `APP_URL=http://localhost:3000` for local dev |
| `src/app/api/webhooks/mist/[org_id]/route.ts` | Create | Public Next.js route — proxies Mist webhook to FastAPI without Clerk auth |
| `src/lib/types.ts` | Modify | Extend `OrgConfig`; add `OrgUsage` interface |
| `src/lib/api.ts` | Modify | Add `getOrgUsage`, `setupWebhook`, `updateSettings` mode field |
| `src/components/settings/ApiUsagePanel.tsx` | Create | Call budget display, webhook setup UI, Mist instructions |
| `src/app/settings/page.tsx` | Modify | Mount `ApiUsagePanel` |
| `src/components/settings/OrgSetupForm.tsx` | Modify | Add mode toggle to Drift Settings form |

---

### Task 1: Supabase Migration 006

**Files:**
- Create: `supabase/migrations/006_rate_limiting.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/006_rate_limiting.sql
alter table org_config
  add column if not exists mode                 text not null default 'polling'
                                                  check (mode in ('polling','webhook')),
  add column if not exists webhook_secret       text,
  add column if not exists calls_used_this_hour integer not null default 0,
  add column if not exists calls_window_start   timestamptz;
```

- [ ] **Step 2: Apply in Supabase dashboard**

Open your Supabase project → SQL Editor → paste the migration → Run.

Verify: go to Table Editor → `org_config` → confirm the four new columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_rate_limiting.sql
git commit -m "feat: migration 006 — add rate limiting columns to org_config"
```

---

### Task 2: Backend Rate Limiter Module

**Files:**
- Create: `backend/rate_limiter.py`
- Create: `backend/tests/test_rate_limiter.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_rate_limiter.py
import math
import pytest
from backend.rate_limiter import (
    min_interval_mins, can_check, budget_summary,
    CHECK_BUDGET, CALLS_PER_SITE, LARGE_ORG_THRESHOLD,
)


def test_min_interval_100_sites():
    # 100 * 3 / 4000 * 60 = 4.5 -> ceil = 5
    assert min_interval_mins(100) == 5


def test_min_interval_1000_sites():
    # 1000 * 3 / 4000 * 60 = 45.0 -> 45
    assert min_interval_mins(1000) == 45


def test_min_interval_1500_sites():
    # 1500 * 3 / 4000 * 60 = 67.5 -> ceil = 68
    assert min_interval_mins(1500) == 68


def test_min_interval_zero_sites():
    assert min_interval_mins(0) == 1


def test_can_check_under_budget():
    # 3997 + 3 = 4000 <= 4000 — exactly at limit, allowed
    assert can_check(3997) is True


def test_can_check_over_budget():
    # 3998 + 3 = 4001 > 4000 — blocked
    assert can_check(3998) is False


def test_can_check_zero():
    assert can_check(0) is True


def test_budget_summary_safe():
    result = budget_summary(100, 15)
    # 100 sites * 3 calls * (60/15 cycles) = 1200 calls/hr
    assert result["calls_per_hour"] == 1200
    assert result["interval_safe"] is True
    assert result["recommend_webhooks"] is False


def test_budget_summary_unsafe():
    result = budget_summary(1000, 5)
    # 1000 * 3 * 12 = 36000 > 4000
    assert result["interval_safe"] is False


def test_budget_summary_recommends_webhooks():
    result = budget_summary(1500, 70)
    assert result["recommend_webhooks"] is True


def test_budget_summary_disabled_interval():
    result = budget_summary(500, 0)
    assert result["calls_per_hour"] == 0
    assert result["interval_safe"] is True


def test_budget_summary_min_interval():
    result = budget_summary(200, 10)
    # min = ceil(200*3/4000*60) = ceil(9) = 9
    assert result["min_interval_mins"] == 9
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/robert/mist-config-assurance
python -m pytest backend/tests/test_rate_limiter.py -v
```

Expected: `ModuleNotFoundError: No module named 'backend.rate_limiter'`

- [ ] **Step 3: Write the implementation**

```python
# backend/rate_limiter.py
import math
import logging
from datetime import datetime, timezone

log = logging.getLogger("mist_ca")

CALL_BUDGET_TOTAL  = 5_000
REMEDIATION_RESERVE = 1_000
CHECK_BUDGET        = CALL_BUDGET_TOTAL - REMEDIATION_RESERVE  # 4,000
CALLS_PER_SITE      = 3
LARGE_ORG_THRESHOLD = 1_500  # sites; above this, recommend webhook mode


def min_interval_mins(site_count: int) -> int:
    """Minimum safe polling interval in minutes for a given monitored site count."""
    if site_count == 0:
        return 1
    return math.ceil(site_count * CALLS_PER_SITE / CHECK_BUDGET * 60)


def can_check(calls_used: int) -> bool:
    """True if a new site check (CALLS_PER_SITE calls) fits within the check budget."""
    return calls_used + CALLS_PER_SITE <= CHECK_BUDGET


def budget_summary(site_count: int, interval_mins: int) -> dict:
    """
    Return call rate stats and advisories for a given org configuration.
    Used by GET /api/org/usage and to populate the UI.
    """
    min_interval = min_interval_mins(site_count)
    recommend_webhooks = site_count >= LARGE_ORG_THRESHOLD

    if interval_mins == 0:
        return {
            "calls_per_hour": 0,
            "min_interval_mins": min_interval,
            "interval_safe": True,
            "recommend_webhooks": recommend_webhooks,
        }

    cycles_per_hour = 60 / interval_mins
    calls_per_hour = round(site_count * CALLS_PER_SITE * cycles_per_hour)
    return {
        "calls_per_hour": calls_per_hour,
        "min_interval_mins": min_interval,
        "interval_safe": calls_per_hour <= CHECK_BUDGET,
        "recommend_webhooks": recommend_webhooks,
    }


def _reset_window_if_needed(org_data: dict) -> tuple[int, str]:
    """
    Return (calls_used, window_start_iso).
    Resets calls_used to 0 if the current hour window has expired.
    """
    now = datetime.now(timezone.utc)
    window_start_iso = org_data.get("calls_window_start")
    calls_used = org_data.get("calls_used_this_hour", 0) or 0

    if window_start_iso:
        window_start = datetime.fromisoformat(window_start_iso)
        if (now - window_start).total_seconds() >= 3600:
            calls_used = 0
            window_start_iso = now.isoformat()
    else:
        window_start_iso = now.isoformat()

    return calls_used, window_start_iso


def increment_calls(org_id: str, n: int = CALLS_PER_SITE) -> int:
    """
    Increment the hourly call counter for an org by n.
    Resets the counter if the hour window has expired.
    Returns the new call count.
    """
    from .db import get_client
    db = get_client()
    row = db.table("org_config").select("calls_used_this_hour,calls_window_start") \
        .eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        return 0
    calls_used, window_start_iso = _reset_window_if_needed(row.data)
    new_count = calls_used + n
    db.table("org_config").update({
        "calls_used_this_hour": new_count,
        "calls_window_start": window_start_iso,
    }).eq("org_id", org_id).execute()
    log.debug("call counter org=%s used=%d", org_id, new_count)
    return new_count
```

- [ ] **Step 4: Run tests — all must pass**

```bash
python -m pytest backend/tests/test_rate_limiter.py -v
```

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/rate_limiter.py backend/tests/test_rate_limiter.py
git commit -m "feat: add rate_limiter module with budget math and call tracking"
```

---

### Task 3: Extend Models + Update Scheduler

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/scheduler.py`

- [ ] **Step 1: Add `mode` to OrgSettingsRequest in models.py**

In `backend/models.py`, replace:

```python
class OrgSettingsRequest(BaseModel):
    drift_interval_mins: int = 0
    auto_remediate: bool = False
```

With:

```python
class OrgSettingsRequest(BaseModel):
    drift_interval_mins: int = 0
    auto_remediate: bool = False
    mode: Literal["polling", "webhook"] = "polling"
```

The `Literal` import is already at the top of the file.

- [ ] **Step 2: Rewrite scheduler.py with staggered + webhook support**

Replace the entire contents of `backend/scheduler.py`:

```python
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
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


def upsert_org_job(org_id: str, interval_mins: int, drift_fn, mode: str = "polling"):
    """
    Register or update the drift job for an org.

    polling mode: fires drift_fn every interval_mins minutes (0 = remove job).
    webhook mode: removes polling job, schedules a daily safety-net scan at 02:00 UTC.

    In both cases the previous job of the other type is removed to avoid duplicates.
    """
    polling_job_id = f"drift_{org_id}"
    daily_job_id   = f"daily_scan_{org_id}"

    # Remove both existing jobs before re-adding the correct one
    for jid in (polling_job_id, daily_job_id):
        if scheduler.get_job(jid):
            scheduler.remove_job(jid)

    if mode == "webhook":
        scheduler.add_job(
            drift_fn,
            trigger=CronTrigger(hour=2, minute=0),
            id=daily_job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=600,
            max_instances=1,
        )
        log.info("Webhook mode: daily scan registered for org=%s at 02:00 UTC", org_id)

    elif interval_mins > 0:
        scheduler.add_job(
            drift_fn,
            trigger=IntervalTrigger(minutes=interval_mins),
            id=polling_job_id,
            kwargs={"org_id": org_id},
            replace_existing=True,
            misfire_grace_time=60,
            max_instances=1,
        )
        log.info("Polling mode: drift scheduled for org=%s every %d mins", org_id, interval_mins)

    else:
        log.info("Drift disabled for org=%s", org_id)


def remove_org_job(org_id: str):
    for jid in (f"drift_{org_id}", f"daily_scan_{org_id}"):
        if scheduler.get_job(jid):
            scheduler.remove_job(jid)
            log.info("Removed job %s", jid)
```

- [ ] **Step 3: Verify the app still starts**

```bash
cd /home/robert/mist-config-assurance
uvicorn backend.main:app --port 8001 --reload
```

Expected: server starts, no import errors.

- [ ] **Step 4: Commit**

```bash
git add backend/models.py backend/scheduler.py
git commit -m "feat: extend OrgSettingsRequest with mode; scheduler supports staggered + webhook"
```

---

### Task 4: New Backend Endpoints + Env Vars

**Files:**
- Modify: `backend/main.py`
- Modify: `.env.example`
- Modify: `backend/.env`

This task adds three new endpoints to `main.py`:
1. `POST /api/webhooks/mist/{org_id}` — receive Mist audit webhooks
2. `GET /api/org/usage` — return call budget stats
3. `POST /api/org/webhook/setup` — generate/regenerate webhook secret

- [ ] **Step 1: Add env vars to .env.example**

Add to the bottom of `.env.example`:

```
# Public app URL — used to build the Mist webhook URL shown in Settings
# Dev: http://localhost:3000  Prod: https://your-app.vercel.app
APP_URL=http://localhost:3000
```

- [ ] **Step 2: Add APP_URL to backend/.env**

Add to the bottom of `backend/.env`:

```
APP_URL=http://localhost:3000
```

- [ ] **Step 3: Add imports to main.py**

At the top of `backend/main.py`, add to the existing imports:

```python
import hashlib
import hmac
import os
import secrets
```

And add this to the module-level imports from the backend package:

```python
from .rate_limiter import (
    budget_summary, can_check, increment_calls, min_interval_mins, _reset_window_if_needed,
)
```

- [ ] **Step 4: Add the three new endpoints to main.py**

Add after the `@app.patch("/api/org/settings")` endpoint (around line 93):

```python
@app.get("/api/org/usage")
async def get_org_usage(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "mode,calls_used_this_hour,calls_window_start,drift_interval_mins,webhook_secret"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")

    site_count = (
        db.table("site").select("id", count="exact")
        .eq("org_id", org_id).eq("monitored", True).execute().count or 0
    )

    data = row.data
    summary = budget_summary(site_count, data.get("drift_interval_mins", 0))
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    webhook_url = f"{app_url}/api/webhooks/mist/{org_id}" if app_url else None

    return {
        "mode": data.get("mode", "polling"),
        "calls_used_this_hour": data.get("calls_used_this_hour", 0) or 0,
        "calls_window_start": data.get("calls_window_start"),
        "site_count": site_count,
        "webhook_url": webhook_url,
        "webhook_configured": bool(data.get("webhook_secret")),
        **summary,
    }


@app.post("/api/org/webhook/setup")
async def setup_webhook(org_id: str = Depends(get_org_id)):
    """Generate (or regenerate) the webhook secret for this org. Returns the plaintext secret once."""
    secret = secrets.token_hex(32)
    db = get_client()
    db.table("org_config").update({"webhook_secret": encrypt(secret)}) \
        .eq("org_id", org_id).execute()
    return {"webhook_secret": secret}


@app.post("/api/webhooks/mist/{org_id}", status_code=200)
async def mist_webhook(org_id: str, request: Request):
    """
    Public endpoint — no Clerk auth. Mist POSTs audit events here.
    Validates HMAC-SHA256 signature, then triggers a check for each affected site.
    """
    body = await request.body()
    signature = request.headers.get("X-Mist-Signature", "")

    db = get_client()
    row = db.table("org_config").select("webhook_secret,mode") \
        .eq("org_id", org_id).maybe_single().execute()
    if not row.data or row.data.get("mode") != "webhook":
        raise HTTPException(404, "Webhook not configured for this org")

    secret_enc = row.data.get("webhook_secret")
    if not secret_enc:
        raise HTTPException(400, "Webhook secret not set — run setup first")

    secret = decrypt(secret_enc)
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Invalid webhook signature")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    events = payload.get("events", [])
    site_ids = {e["site_id"] for e in events if e.get("site_id")}
    if not site_ids:
        return {"ok": True, "sites_triggered": 0}

    org = _get_org_or_404(org_id)
    for site_id in site_ids:
        asyncio.create_task(_rerun_site(org_id, site_id, org))

    log.info("Mist webhook: org=%s triggered check for %d sites", org_id, len(site_ids))
    return {"ok": True, "sites_triggered": len(site_ids)}
```

- [ ] **Step 5: Add `Request` to FastAPI imports**

In the imports at the top of `main.py`, ensure `Request` is imported:

```python
from fastapi import Depends, FastAPI, Header, HTTPException, Request
```

- [ ] **Step 6: Update `update_settings` endpoint to persist `mode` and pass it to scheduler**

Find the existing `update_settings` endpoint and replace it:

```python
@app.patch("/api/org/settings")
async def update_settings(req: OrgSettingsRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("org_config").update({
        "drift_interval_mins": req.drift_interval_mins,
        "auto_remediate": req.auto_remediate,
        "mode": req.mode,
    }).eq("org_id", org_id).execute()
    sched.upsert_org_job(org_id, req.drift_interval_mins, run_drift_for_org, mode=req.mode)
    return {"ok": True}
```

- [ ] **Step 7: Update lifespan to pass mode when reloading jobs on startup**

Find the `lifespan` function and replace:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    sched.start()
    db = get_client()
    orgs = db.table("org_config").select("org_id,drift_interval_mins,mode").execute()
    for org in (orgs.data or []):
        sched.upsert_org_job(
            org["org_id"],
            org["drift_interval_mins"],
            run_drift_for_org,
            mode=org.get("mode", "polling"),
        )
    yield
    sched.stop()
```

- [ ] **Step 8: Verify server starts and endpoints exist**

```bash
uvicorn backend.main:app --port 8001 --reload
```

In a second terminal:
```bash
curl -s http://localhost:8001/health
```
Expected: `{"status":"ok","scheduler_running":true}`

- [ ] **Step 9: Commit**

```bash
git add backend/main.py .env.example backend/.env
git commit -m "feat: add org usage, webhook setup, and Mist webhook receiver endpoints"
```

---

### Task 5: Staggered Drift Loop + Rate Limiter Wiring

**Files:**
- Modify: `backend/main.py`

Wire `increment_calls` into the drift loop and add staggered sleep between site checks.

- [ ] **Step 1: Replace `run_drift_for_org` with the staggered version**

Find `run_drift_for_org` in `main.py` (currently starts around line 609) and replace the entire function:

```python
async def run_drift_for_org(org_id: str):
    """Called by APScheduler for scheduled drift checks (polling and daily webhook safety scan)."""
    log.info("Drift check starting for org=%s", org_id)
    try:
        org = _get_org_or_404(org_id)
    except HTTPException:
        sched.remove_org_job(org_id)
        return

    db = get_client()
    sites = db.table("site").select("*").eq("org_id", org_id).eq("monitored", True).execute()
    site_list = sites.data or []
    if not site_list:
        return

    interval_mins = org.get("drift_interval_mins", 5) or 5
    sleep_secs = (interval_mins * 60) / len(site_list) if len(site_list) > 1 else 0

    for i, site in enumerate(site_list):
        # Stagger: sleep before each site after the first
        if i > 0 and sleep_secs > 0:
            await asyncio.sleep(sleep_secs)

        # Rate limit: skip this site if check budget is exhausted
        org_fresh = db.table("org_config").select("calls_used_this_hour,calls_window_start") \
            .eq("org_id", org_id).maybe_single().execute()
        if org_fresh.data:
            calls_used, _ = _reset_window_if_needed(org_fresh.data)
            if not can_check(calls_used):
                log.warning("Rate budget exhausted: skipping site=%s (calls_used=%d)", site["id"], calls_used)
                continue

        check_error: str | None = None
        try:
            token = decrypt(org["mist_token"])
            base_url = mist.build_base_url(org["cloud_endpoint"])
            wlans = await mist.get_site_wlans(token, base_url, site["id"])
            site_setting = await mist.get_site_setting(token, base_url, site["id"])
            site_entity = await mist.get_site(token, base_url, site["id"])
            site_setting = {**site_setting, **{k: site_entity.get(k) for k in remediation._SITE_ENTITY_FIELDS}}

            # Count the 3 API calls we just made
            increment_calls(org_id)

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
            await _sync_incidents(org_id, site["id"], site["name"], findings, stds.data or [], org, org.get("mist_org_id"), wlans=wlans)
        except Exception as exc:
            log.exception("Drift check failed for site=%s: %s", site["id"], exc)
            check_error = str(exc)
        finally:
            db.table("site").update({
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
                "check_error": check_error,
            }).eq("id", site["id"]).eq("org_id", org_id).execute()

    log.info("Drift check complete for org=%s (%d sites)", org_id, len(site_list))
```

- [ ] **Step 2: Verify tests still pass**

```bash
python -m pytest backend/tests/ -v
```

Expected: all existing tests + the 12 rate_limiter tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: staggered drift loop with rate limiter budget enforcement"
```

---

### Task 6: Next.js Webhook Proxy Route

**Files:**
- Create: `src/app/api/webhooks/mist/[org_id]/route.ts`

This route is public (no Clerk auth) — Mist calls it directly. It forwards the raw body and signature header to FastAPI.

- [ ] **Step 1: Create the directory and route file**

```typescript
// src/app/api/webhooks/mist/[org_id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8001'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org_id: string }> },
) {
  const { org_id } = await params
  const body = await req.text()
  const signature = req.headers.get('X-Mist-Signature') ?? ''

  const res = await fetch(`${BACKEND}/api/webhooks/mist/${org_id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Mist-Signature': signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })

  const data = await res.json().catch(() => null)
  return NextResponse.json(data ?? { ok: false }, { status: res.status })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/robert/mist-config-assurance
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/mist/
git commit -m "feat: public Next.js webhook proxy route for Mist audit events"
```

---

### Task 7: Frontend Types + API Client

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Extend types.ts**

Add `mode` to `OrgConfig` and add the new `OrgUsage` interface. Replace the existing `OrgConfig` interface and add `OrgUsage` after it:

```typescript
export interface OrgConfig {
  org_id: string
  org_name: string
  cloud_endpoint: string
  drift_interval_mins: number
  auto_remediate: boolean
  mode: 'polling' | 'webhook'
}

export interface OrgUsage {
  mode: 'polling' | 'webhook'
  calls_used_this_hour: number
  calls_window_start: string | null
  site_count: number
  webhook_url: string | null
  webhook_configured: boolean
  calls_per_hour: number
  min_interval_mins: number
  interval_safe: boolean
  recommend_webhooks: boolean
}
```

- [ ] **Step 2: Extend api.ts**

Update `updateSettings` to include `mode`, and add `getOrgUsage` and `setupWebhook`:

Replace the `updateSettings` line:
```typescript
  updateSettings: (settings: { drift_interval_mins: number; auto_remediate: boolean; mode: 'polling' | 'webhook' }) =>
    request('api/org/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
```

Add after `updateSettings`:
```typescript
  getOrgUsage: () => request<import('./types').OrgUsage>('api/org/usage'),
  setupWebhook: () => request<{ webhook_secret: string }>('api/org/webhook/setup', { method: 'POST' }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat: extend OrgConfig type; add OrgUsage interface and api.getOrgUsage/setupWebhook"
```

---

### Task 8: ApiUsagePanel Component + Settings Page Wiring

**Files:**
- Create: `src/components/settings/ApiUsagePanel.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/components/settings/OrgSetupForm.tsx`

- [ ] **Step 1: Create ApiUsagePanel.tsx**

```typescript
// src/components/settings/ApiUsagePanel.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { OrgUsage } from '@/lib/types'

const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'
const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30'

export function ApiUsagePanel() {
  const [usage, setUsage] = useState<OrgUsage | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getOrgUsage().then(setUsage).catch(() => {})
  }, [])

  async function generateSecret() {
    setGenerating(true)
    setError('')
    try {
      const res = await api.setupWebhook()
      setSecret(res.webhook_secret)
      setUsage(await api.getOrgUsage())
    } catch {
      setError('Failed to generate secret.')
    } finally {
      setGenerating(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  if (!usage) return null

  const usedPct   = Math.min(100, Math.round(usage.calls_used_this_hour / 5000 * 100))
  const checkPct  = Math.min(100, Math.round(usage.calls_per_hour / 5000 * 100))

  return (
    <section className="bg-surface-lowest rounded-lg p-6 space-y-5">
      <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide">
        API Usage
      </h2>

      {/* Live counter */}
      <div>
        <p className="text-xs text-on-surface/60 mb-1">
          Calls used this hour
        </p>
        <p className="text-sm font-medium text-on-surface">
          {usage.calls_used_this_hour.toLocaleString()} / 5,000
        </p>
        <div className="mt-2 h-2 bg-surface-high rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-danger' : 'bg-primary'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Polling mode stats */}
      {usage.mode === 'polling' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-on-surface/60 mb-1">Estimated check calls / hour</p>
            <p className={`text-sm font-medium ${usage.interval_safe ? 'text-on-surface' : 'text-danger'}`}>
              {usage.calls_per_hour.toLocaleString()} / 4,000 check budget
            </p>
            {/* Budget bar: checks + remediation reserve + headroom */}
            <div className="mt-2 h-2 bg-surface-high rounded-full overflow-hidden flex">
              <div
                className={`h-full ${usage.interval_safe ? 'bg-primary' : 'bg-danger'}`}
                style={{ width: `${checkPct}%` }}
              />
              <div className="h-full bg-warning/60" style={{ width: '20%' }} />
            </div>
            <div className="flex text-xs text-on-surface/40 mt-1 gap-3">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-primary" /> Checks</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-warning/60" /> Remediation reserve</span>
            </div>
          </div>

          {!usage.interval_safe && (
            <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
              Current interval is too short for {usage.site_count} sites.
              Minimum safe interval: <strong>{usage.min_interval_mins} min</strong>.
            </div>
          )}

          {usage.recommend_webhooks && (
            <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              At {usage.site_count} sites, webhook mode is recommended for reliable drift detection
              without long polling intervals.
            </div>
          )}

          <p className="text-xs text-on-surface/50">
            Minimum safe interval for {usage.site_count} monitored sites:{' '}
            <strong>{usage.min_interval_mins} min</strong>
          </p>
        </div>
      )}

      {/* Webhook mode stats + setup */}
      {usage.mode === 'webhook' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${usage.webhook_configured ? 'bg-healthy' : 'bg-on-surface/30'}`} />
            <span className="text-sm text-on-surface">
              {usage.webhook_configured ? 'Webhook secret configured' : 'Webhook not set up yet'}
            </span>
          </div>

          {usage.webhook_url && (
            <div>
              <label className={labelCls}>Webhook URL (paste into Mist)</label>
              <div className="flex gap-2">
                <input readOnly value={usage.webhook_url} className={inputCls} />
                <button
                  onClick={() => copyToClipboard(usage.webhook_url!)}
                  className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap"
                >
                  {copying ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Webhook Secret</label>
            {secret ? (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input readOnly value={secret} className={`${inputCls} font-mono text-xs`} />
                  <button
                    onClick={() => copyToClipboard(secret)}
                    className="text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 whitespace-nowrap"
                  >
                    {copying ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-on-surface/50">Save this now — it won't be shown again.</p>
              </div>
            ) : (
              <button
                onClick={generateSecret}
                disabled={generating}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {generating ? 'Generating…' : usage.webhook_configured ? 'Regenerate Secret' : 'Generate Secret'}
              </button>
            )}
          </div>

          {/* Mist setup instructions */}
          <div className="bg-surface-low rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-on-surface/70 uppercase tracking-wide">Mist Setup Steps</p>
            <ol className="text-xs text-on-surface/70 space-y-1 list-decimal list-inside">
              <li>In Mist portal: <strong>Organization → Webhooks → Add Webhook</strong></li>
              <li>URL: paste the Webhook URL above</li>
              <li>Secret Token: paste the Webhook Secret above</li>
              <li>Topics: enable <strong>audits</strong></li>
              <li>Toggle <strong>Enabled</strong> on → Save</li>
            </ol>
          </div>

          <p className="text-xs text-on-surface/50">
            Daily safety-net scan runs at 02:00 UTC to catch any missed events.
          </p>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Add mode toggle to OrgSetupForm.tsx**

In `OrgSetupForm.tsx`, add `mode` state after `autoRemediate`:

```typescript
const [mode, setMode] = useState<'polling' | 'webhook'>('polling')
```

In the `useEffect` that loads org data, add:
```typescript
setMode((data as OrgConfig).mode ?? 'polling')
```

In `saveSettings`, update the call to include mode:
```typescript
await api.updateSettings({ drift_interval_mins: interval, auto_remediate: autoRemediate, mode })
```

In the Drift Settings form, add the mode toggle between the interval input and auto-remediate toggle:

```tsx
<div>
  <label className={labelCls}>Detection Mode</label>
  <div className="flex gap-3">
    {(['polling', 'webhook'] as const).map(m => (
      <button
        key={m}
        type="button"
        onClick={() => setMode(m)}
        className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
          mode === m
            ? 'bg-primary text-white border-primary'
            : 'bg-surface border-border text-on-surface/60 hover:text-on-surface'
        }`}
      >
        {m === 'polling' ? 'Polling' : 'Webhook'}
      </button>
    ))}
  </div>
  {mode === 'polling' && (
    <p className="text-xs text-on-surface/50 mt-1">
      Mist API is polled on the interval below.
    </p>
  )}
  {mode === 'webhook' && (
    <p className="text-xs text-on-surface/50 mt-1">
      Mist pushes config changes to your webhook URL. See API Usage panel below.
    </p>
  )}
</div>
```

- [ ] **Step 3: Mount ApiUsagePanel in settings/page.tsx**

Replace the contents of `src/app/settings/page.tsx`:

```typescript
import { PageShell } from '@/components/layout/PageShell'
import { OrgSetupForm } from '@/components/settings/OrgSetupForm'
import { AIProviderForm } from '@/components/settings/AIProviderForm'
import { ApiUsagePanel } from '@/components/settings/ApiUsagePanel'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <div className="space-y-10 max-w-lg">
        <OrgSetupForm />
        <ApiUsagePanel />
        <AIProviderForm />
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start dev server and verify the Settings page loads**

```bash
npm run dev
```

Open `http://localhost:3000/settings`. Expected:
- Drift Settings section shows Polling / Webhook mode buttons
- API Usage panel shows below (may show nothing if no usage data yet)
- No console errors

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/ApiUsagePanel.tsx src/app/settings/page.tsx src/components/settings/OrgSetupForm.tsx
git commit -m "feat: ApiUsagePanel with call budget display, webhook setup UI, and mode toggle"
```

---

## Verification Checklist

After all tasks complete:

**Backend:**
```bash
python -m pytest backend/tests/ -v
```
Expected: all tests pass including the 12 new rate_limiter tests.

**Frontend:**
```bash
npx tsc --noEmit
npm run dev
```
Open Settings → confirm:
- Mode toggle switches between Polling and Webhook
- API Usage panel shows call budget bar in polling mode
- Switching to Webhook mode and saving shows webhook URL + secret generation
- Mist setup steps are visible in webhook mode

**End-to-end polling math:**
1. Set mode to Polling, interval to 5 minutes with 1,000+ monitored sites
2. API Usage panel should show an `interval_safe: false` warning and display the minimum safe interval

**End-to-end webhook:**
1. Switch to Webhook mode, save settings
2. API Usage panel shows webhook URL
3. Click Generate Secret — secret appears, copy button works
4. Mist setup instructions are visible
