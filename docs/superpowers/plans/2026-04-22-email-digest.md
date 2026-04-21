# Email Digest Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a daily or weekly email digest (via Resend) summarising drift-detection activity, with optional extra recipients and a "Send Test Digest" button in Settings.

**Architecture:** A dedicated `digest` module owns scheduling, window math, count aggregation, and Resend delivery — cleanly separated from drift detection. Scheduling mirrors the existing APScheduler per-org pattern. The Clerk user's email is fetched fresh at send time (not cached) from Clerk's Backend API using the stored `owner_user_id`.

**Tech Stack:** FastAPI, APScheduler, Supabase, Resend HTTP API, Clerk Backend API, Next.js App Router

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/007_digests.sql` | Create | Add digest columns + `owner_user_id` to `org_config` |
| `backend/auth.py` | Modify | Add `get_user_id` dependency |
| `backend/resend_client.py` | Create | Thin async HTTP client for Resend |
| `backend/tests/test_resend_client.py` | Create | Unit tests for Resend client |
| `backend/digest.py` | Create | Window math, count aggregation, `send_digest`, `register_digest_job` |
| `backend/tests/test_digest.py` | Create | Unit tests for digest module |
| `backend/models.py` | Modify | Add `DigestSettingsRequest` |
| `backend/main.py` | Modify | Extend `/api/org/connect` to persist `owner_user_id`; add 3 digest endpoints; register digest jobs in lifespan |
| `.env.example` | Modify | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `backend/.env` | Modify | Add both vars with placeholder values |
| `docker-compose.yml` | Modify | Forward both vars to the backend service |
| `src/lib/types.ts` | Modify | Add `DigestSettings` interface |
| `src/lib/api.ts` | Modify | Add `getDigestSettings`, `updateDigestSettings`, `sendTestDigest` |
| `src/components/settings/EmailDigestForm.tsx` | Create | Settings UI — frequency toggle, recipients, test button |
| `src/app/settings/page.tsx` | Modify | Mount `EmailDigestForm` |

---

### Task 1: Migration 007

**Files:**
- Create: `supabase/migrations/007_digests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/007_digests.sql
alter table org_config
  add column if not exists digest_frequency         text
    check (digest_frequency in ('daily','weekly')),
  add column if not exists digest_extra_recipients  text[] not null default '{}',
  add column if not exists digest_last_sent_at      timestamptz,
  add column if not exists digest_last_error        text,
  add column if not exists owner_user_id            text;
```

- [ ] **Step 2: Apply in Supabase dashboard**

Open Supabase → SQL Editor → paste and Run.

Verify: Table Editor → `org_config` shows the five new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_digests.sql
git commit -m "feat: migration 007 — add digest columns and owner_user_id to org_config"
```

---

### Task 2: Clerk user_id Plumbing

**Files:**
- Modify: `backend/auth.py`
- Modify: `backend/main.py` (connect endpoint)

- [ ] **Step 1: Add `get_user_id` dependency to auth.py**

Append to `backend/auth.py`:

```python
async def get_user_id(
    authorization: str = Header(...),
) -> str:
    """FastAPI dependency — verifies Clerk JWT and returns the Clerk user_id (`sub` claim)."""
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
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Missing sub claim")
    return user_id
```

- [ ] **Step 2: Update `/api/org/connect` endpoint to persist `owner_user_id`**

In `backend/main.py`, find the `connect` endpoint (around line 61) and update it:

```python
@app.post("/api/org/connect")
async def connect(
    req: ConnectRequest,
    org_id: str = Depends(get_org_id),
    user_id: str = Depends(get_user_id),
):
    base_url = mist.build_base_url(req.cloud_endpoint)
    try:
        info = await mist.get_org_info(req.mist_token, base_url, req.mist_org_id)
    except ValueError as exc:
        raise HTTPException(401, str(exc))
    except httpx.TimeoutException:
        raise HTTPException(504, f"Timed out connecting to {req.cloud_endpoint}. Check the endpoint and network.")
    except Exception as exc:
        raise HTTPException(502, f"Could not reach Mist: {exc}")

    db = get_client()
    db.table("org_config").upsert({
        "org_id": org_id,
        "mist_token": encrypt(req.mist_token),
        "cloud_endpoint": req.cloud_endpoint,
        "org_name": info["org_name"],
        "mist_org_id": info["org_id"],
        "owner_user_id": user_id,
    }).execute()
    return {"org_name": info["org_name"], "mist_org_id": info["org_id"]}
```

- [ ] **Step 3: Add `get_user_id` import**

In `backend/main.py`, find the existing auth import:

```python
from .auth import get_org_id
```

Replace with:

```python
from .auth import get_org_id, get_user_id
```

- [ ] **Step 4: Verify server still starts**

```bash
uvicorn backend.main:app --port 8001 --reload
```

Expected: Application startup complete; no import errors.

- [ ] **Step 5: Commit**

```bash
git add backend/auth.py backend/main.py
git commit -m "feat: persist Clerk owner_user_id on org connect"
```

---

### Task 3: Resend Client Module

**Files:**
- Create: `backend/resend_client.py`
- Create: `backend/tests/test_resend_client.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_resend_client.py
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from backend.resend_client import send_email


async def test_send_email_success(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    mock_response = MagicMock()
    mock_response.is_success = True

    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(return_value=mock_response)) as mock_post:
        ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is True
    assert err is None
    mock_post.assert_called_once()


async def test_send_email_http_error_returns_body(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.text = '{"message":"Invalid from address"}'

    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(return_value=mock_response)):
        ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert "Invalid from address" in err


async def test_send_email_missing_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert err == "Resend not configured"


async def test_send_email_missing_from(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.delenv("RESEND_FROM_EMAIL", raising=False)

    ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert err == "Resend not configured"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/robert/mist-config-assurance
python -m pytest backend/tests/test_resend_client.py -v
```

Expected: `ModuleNotFoundError: No module named 'backend.resend_client'`

- [ ] **Step 3: Write the implementation**

```python
# backend/resend_client.py
import logging
import os

import httpx

log = logging.getLogger("mist_ca")

TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=2.0)


async def send_email(to: list[str], subject: str, text: str) -> tuple[bool, str | None]:
    """
    Send a plain-text email via the Resend HTTP API.
    Returns (True, None) on 2xx; (False, error_message) on any failure.
    When RESEND_API_KEY or RESEND_FROM_EMAIL are unset, returns (False, "Resend not configured")
    without making an HTTP call.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = os.environ.get("RESEND_FROM_EMAIL")
    if not api_key or not from_addr:
        return False, "Resend not configured"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": from_addr, "to": to, "subject": subject, "text": text},
                timeout=TIMEOUT,
            )
    except Exception as exc:
        log.warning("Resend HTTP error: %s", exc)
        return False, str(exc)

    if resp.is_success:
        return True, None
    return False, (resp.text or "")[:500]
```

- [ ] **Step 4: Run tests — all pass**

```bash
python -m pytest backend/tests/test_resend_client.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/resend_client.py backend/tests/test_resend_client.py
git commit -m "feat: add resend_client module for email delivery"
```

---

### Task 4: Digest Module

**Files:**
- Create: `backend/digest.py`
- Create: `backend/tests/test_digest.py`

This module owns the scheduling API (`register_digest_job`) and the send logic (`send_digest`). Unit tests focus on the pure helpers — window math, content formatting, and the high-level flow with DB + Resend mocked.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_digest.py
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.digest import (
    _window_start, _format_body, _build_subject, send_digest,
)


def test_window_start_first_run_daily():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=None, frequency="daily", now=now)
    assert start == now - timedelta(hours=24)


def test_window_start_first_run_weekly():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=None, frequency="weekly", now=now)
    assert start == now - timedelta(days=7)


def test_window_start_uses_last_sent_at():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    last = datetime(2026, 4, 21, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=last, frequency="daily", now=now)
    assert start == last


def test_format_body_daily():
    body = _format_body(
        frequency="daily",
        new_incidents=5,
        remediation_success=12,
        remediation_failed=2,
        app_url="https://example.com",
    )
    assert "In the last 24 hours" in body
    assert "5 new incidents" in body
    assert "12 auto-remediations succeeded" in body
    assert "2 auto-remediations failed" in body
    assert "https://example.com/activity" in body


def test_format_body_weekly():
    body = _format_body(
        frequency="weekly",
        new_incidents=1,
        remediation_success=0,
        remediation_failed=0,
        app_url="https://example.com",
    )
    assert "In the last 7 days" in body


def test_build_subject_daily():
    now = datetime(2026, 4, 22, tzinfo=timezone.utc)
    assert _build_subject("daily", now) == "Mist Config Assurance — daily digest (2026-04-22)"


def test_build_subject_weekly():
    now = datetime(2026, 4, 22, tzinfo=timezone.utc)
    assert _build_subject("weekly", now) == "Mist Config Assurance — weekly digest (2026-04-22)"


async def test_send_digest_skips_when_empty_window(monkeypatch):
    """Empty-window case: counts are zero → skip send, update last_sent_at."""
    fake_org = {
        "org_id": "o1",
        "digest_frequency": "daily",
        "digest_last_sent_at": None,
        "digest_extra_recipients": ["extra@example.com"],
        "owner_user_id": None,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=fake_org)
    db.table.return_value.select.return_value.eq.return_value.gt.return_value.execute.return_value = MagicMock(count=0, data=[])
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = None

    send_mock = AsyncMock(return_value=(True, None))

    with patch("backend.digest.get_client", return_value=db), \
         patch("backend.digest.send_email", new=send_mock):
        result = await send_digest("o1", trigger_source="scheduled")

    assert result["ok"] is True
    assert result["skipped"] is True
    send_mock.assert_not_called()


async def test_send_digest_no_recipients_short_circuits(monkeypatch):
    """No Clerk user + no extras → error, no Resend call."""
    fake_org = {
        "org_id": "o1",
        "digest_frequency": "daily",
        "digest_last_sent_at": None,
        "digest_extra_recipients": [],
        "owner_user_id": None,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=fake_org)
    # Fake non-empty window so we get past the empty-skip
    db.table.return_value.select.return_value.eq.return_value.gt.return_value.execute.return_value = MagicMock(count=1, data=[{"id": "i1"}])

    send_mock = AsyncMock()

    with patch("backend.digest.get_client", return_value=db), \
         patch("backend.digest.send_email", new=send_mock):
        result = await send_digest("o1", trigger_source="manual")

    assert result["ok"] is False
    assert result["error"] == "no recipients configured"
    send_mock.assert_not_called()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest backend/tests/test_digest.py -v
```

Expected: `ModuleNotFoundError: No module named 'backend.digest'`

- [ ] **Step 3: Write the implementation**

```python
# backend/digest.py
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from apscheduler.triggers.cron import CronTrigger

from .db import get_client
from .resend_client import send_email
from . import scheduler as sched

log = logging.getLogger("mist_ca")

CLERK_API = "https://api.clerk.com/v1"


# ---------------------------------------------------------------------------
# Pure helpers (tested directly)
# ---------------------------------------------------------------------------

def _window_start(last_sent_at: datetime | None, frequency: str, now: datetime) -> datetime:
    """Return the start of the digest window. Falls back to now-24h (daily) or now-7d (weekly)."""
    if last_sent_at is not None:
        return last_sent_at
    delta = timedelta(hours=24) if frequency == "daily" else timedelta(days=7)
    return now - delta


def _build_subject(frequency: str, now: datetime) -> str:
    date_s = now.strftime("%Y-%m-%d")
    return f"Mist Config Assurance — {frequency} digest ({date_s})"


def _format_body(frequency: str, new_incidents: int, remediation_success: int,
                 remediation_failed: int, app_url: str) -> str:
    window_label = "the last 24 hours" if frequency == "daily" else "the last 7 days"
    link = f"{app_url.rstrip('/')}/activity" if app_url else "(APP_URL not configured)"
    return (
        f"In {window_label}:\n\n"
        f"  • {new_incidents} new incidents\n"
        f"  • {remediation_success} auto-remediations succeeded\n"
        f"  • {remediation_failed} auto-remediations failed\n\n"
        f"View details: {link}\n"
    )


# ---------------------------------------------------------------------------
# Scheduler API
# ---------------------------------------------------------------------------

def register_digest_job(org_id: str, frequency: str | None) -> None:
    """
    Register or replace the digest job for an org.
    frequency='daily'  -> CronTrigger(hour=8, minute=0) UTC
    frequency='weekly' -> CronTrigger(day_of_week='mon', hour=8, minute=0) UTC
    frequency=None     -> remove existing job
    """
    job_id = f"digest_{org_id}"

    if sched.scheduler.get_job(job_id):
        sched.scheduler.remove_job(job_id)

    if frequency == "daily":
        trigger = CronTrigger(hour=8, minute=0)
    elif frequency == "weekly":
        trigger = CronTrigger(day_of_week="mon", hour=8, minute=0)
    else:
        log.info("Digest disabled for org=%s", org_id)
        return

    sched.scheduler.add_job(
        send_digest,
        trigger=trigger,
        id=job_id,
        kwargs={"org_id": org_id, "trigger_source": "scheduled"},
        replace_existing=True,
        misfire_grace_time=600,
        max_instances=1,
    )
    log.info("Digest %s job registered for org=%s", frequency, org_id)


# ---------------------------------------------------------------------------
# Clerk email lookup
# ---------------------------------------------------------------------------

async def _fetch_clerk_email(user_id: str) -> str | None:
    """Fetch the primary email for a Clerk user. Returns None on any failure."""
    secret = os.environ.get("CLERK_SECRET_KEY")
    if not secret:
        log.warning("CLERK_SECRET_KEY not set — cannot look up digest recipient email")
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CLERK_API}/users/{user_id}",
                headers={"Authorization": f"Bearer {secret}"},
                timeout=10.0,
            )
    except Exception as exc:
        log.warning("Clerk user lookup failed for user=%s: %s", user_id, exc)
        return None

    if not resp.is_success:
        log.warning("Clerk user lookup returned %d for user=%s", resp.status_code, user_id)
        return None

    data = resp.json()
    primary_id = data.get("primary_email_address_id")
    for addr in data.get("email_addresses", []):
        if addr.get("id") == primary_id:
            return addr.get("email_address")
    return None


# ---------------------------------------------------------------------------
# Main entry: send_digest
# ---------------------------------------------------------------------------

async def send_digest(org_id: str, trigger_source: str) -> dict:
    """
    Compute counts, call Resend, persist last_sent_at / last_error.
    trigger_source: 'scheduled' | 'manual'
    Returns {"ok": bool, "skipped": bool, "error": str | None}
    """
    db = get_client()
    row = db.table("org_config").select(
        "org_id,digest_frequency,digest_last_sent_at,digest_extra_recipients,owner_user_id"
    ).eq("org_id", org_id).maybe_single().execute()

    if not row.data:
        return {"ok": False, "skipped": False, "error": "org not found"}

    org = row.data
    frequency = org.get("digest_frequency")
    if frequency not in ("daily", "weekly"):
        return {"ok": False, "skipped": False, "error": "digest not enabled"}

    now = datetime.now(timezone.utc)
    last_sent_raw = org.get("digest_last_sent_at")
    last_sent_at = datetime.fromisoformat(last_sent_raw) if last_sent_raw else None
    window_start_at = _window_start(last_sent_at, frequency, now)

    # Count events in the window
    incidents = db.table("incident").select("id", count="exact") \
        .eq("org_id", org_id).gt("opened_at", window_start_at.isoformat()).execute()
    new_incidents = incidents.count or 0

    remediations = db.table("remediation_action").select("status") \
        .eq("org_id", org_id).gt("attempted_at", window_start_at.isoformat()).execute()
    rem_rows = remediations.data or []
    remediation_success = sum(1 for r in rem_rows if r.get("status") == "success")
    remediation_failed  = sum(1 for r in rem_rows if r.get("status") == "failed")

    total = new_incidents + remediation_success + remediation_failed
    if total == 0:
        db.table("org_config").update({
            "digest_last_sent_at": now.isoformat(),
            "digest_last_error": None,
        }).eq("org_id", org_id).execute()
        log.info("digest skipped (empty window) org=%s trigger=%s", org_id, trigger_source)
        return {"ok": True, "skipped": True, "error": None}

    # Build recipient list
    recipients: list[str] = []
    owner_user_id = org.get("owner_user_id")
    if owner_user_id:
        owner_email = await _fetch_clerk_email(owner_user_id)
        if owner_email:
            recipients.append(owner_email)
    for r in (org.get("digest_extra_recipients") or []):
        if r and r not in recipients:
            recipients.append(r)

    # Dedupe case-insensitively
    seen: set[str] = set()
    deduped: list[str] = []
    for r in recipients:
        key = r.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    recipients = deduped

    if not recipients:
        db.table("org_config").update({"digest_last_error": "no recipients configured"}) \
            .eq("org_id", org_id).execute()
        log.warning("digest has no recipients org=%s", org_id)
        return {"ok": False, "skipped": False, "error": "no recipients configured"}

    # Build and send
    subject = _build_subject(frequency, now)
    body = _format_body(
        frequency=frequency,
        new_incidents=new_incidents,
        remediation_success=remediation_success,
        remediation_failed=remediation_failed,
        app_url=os.environ.get("APP_URL", ""),
    )

    ok, err = await send_email(recipients, subject, body)

    if ok:
        db.table("org_config").update({
            "digest_last_sent_at": now.isoformat(),
            "digest_last_error": None,
        }).eq("org_id", org_id).execute()
        log.info("digest sent org=%s recipients=%d trigger=%s", org_id, len(recipients), trigger_source)
        return {"ok": True, "skipped": False, "error": None}

    db.table("org_config").update({"digest_last_error": err}) \
        .eq("org_id", org_id).execute()
    log.error("digest send failed org=%s error=%s", org_id, err)
    return {"ok": False, "skipped": False, "error": err}
```

- [ ] **Step 4: Run tests — all pass**

```bash
python -m pytest backend/tests/test_digest.py -v
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/digest.py backend/tests/test_digest.py
git commit -m "feat: add digest module with window math, count aggregation, and send flow"
```

---

### Task 5: Backend Endpoints + Lifespan + Env Vars

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/main.py`
- Modify: `.env.example`
- Modify: `backend/.env`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add `DigestSettingsRequest` to models.py**

In `backend/models.py`, add to the existing models:

```python
class DigestSettingsRequest(BaseModel):
    frequency: Literal["daily", "weekly"] | None = None
    extra_recipients: list[str] = []
```

- [ ] **Step 2: Add env vars to .env.example**

Append to `.env.example`:

```
# Resend email delivery
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

- [ ] **Step 3: Add env vars to backend/.env**

Append to `backend/.env` (replace placeholders with real values when ready):

```
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

- [ ] **Step 4: Forward env vars in docker-compose.yml**

In `docker-compose.yml`, find the backend service's `environment:` block and add:

```yaml
      RESEND_API_KEY: ${RESEND_API_KEY}
      RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
```

(`CLERK_SECRET_KEY` is already listed in `.env.example` from the Clerk auth setup; digest.py needs it in the backend container too.)

- [ ] **Step 5: Update main.py imports**

At the top of `backend/main.py`, add `DigestSettingsRequest` to the models import:

```python
from .models import (
    AIConfigSave, ConnectRequest, DigestSettingsRequest, OrgSettingsRequest,
    ParseFilterRequest, RunRequest, StandardCreate, StandardUpdate,
)
```

And add the digest import (place near other local imports):

```python
from . import digest
```

- [ ] **Step 6: Register digest jobs on startup (lifespan)**

In `backend/main.py`, find the existing `lifespan` function and extend it to also register digest jobs:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    sched.start()
    db = get_client()
    orgs = db.table("org_config").select("org_id,drift_interval_mins,mode,digest_frequency").execute()
    for org in (orgs.data or []):
        sched.upsert_org_job(
            org["org_id"],
            org["drift_interval_mins"],
            run_drift_for_org,
            mode=org.get("mode", "polling"),
        )
        digest.register_digest_job(org["org_id"], org.get("digest_frequency"))
    yield
    sched.stop()
```

- [ ] **Step 7: Add the three digest endpoints**

In `backend/main.py`, add these endpoints after the existing `/api/org/webhook/setup` endpoint (approximately line 145):

```python
@app.get("/api/org/digest-settings")
async def get_digest_settings(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "digest_frequency,digest_extra_recipients,digest_last_sent_at,digest_last_error"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")
    return {
        "frequency": row.data.get("digest_frequency"),
        "extra_recipients": row.data.get("digest_extra_recipients") or [],
        "last_sent_at": row.data.get("digest_last_sent_at"),
        "last_error": row.data.get("digest_last_error"),
        "resend_configured": bool(os.environ.get("RESEND_API_KEY") and os.environ.get("RESEND_FROM_EMAIL")),
    }


@app.patch("/api/org/digest-settings")
async def update_digest_settings(req: DigestSettingsRequest, org_id: str = Depends(get_org_id)):
    _get_org_or_404(org_id)
    db = get_client()
    db.table("org_config").update({
        "digest_frequency": req.frequency,
        "digest_extra_recipients": req.extra_recipients,
    }).eq("org_id", org_id).execute()
    digest.register_digest_job(org_id, req.frequency)
    return {"ok": True}


@app.post("/api/digest/test")
async def send_test_digest(org_id: str = Depends(get_org_id)):
    result = await digest.send_digest(org_id, trigger_source="manual")
    return result
```

- [ ] **Step 8: Verify server starts and new endpoints resolve**

```bash
uvicorn backend.main:app --port 8001 --reload
```

Expected: startup log shows digest jobs registered (if any orgs have `digest_frequency` set). Endpoints `/api/org/digest-settings` and `/api/digest/test` resolve (will need Clerk auth to hit them from outside).

- [ ] **Step 9: Commit**

```bash
git add backend/main.py backend/models.py .env.example backend/.env docker-compose.yml
git commit -m "feat: digest settings endpoints, lifespan registration, env var wiring"
```

---

### Task 6: Frontend Types + API Client

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add `DigestSettings` interface to types.ts**

Append after the existing `OrgUsage` interface:

```typescript
export interface DigestSettings {
  frequency: 'daily' | 'weekly' | null
  extra_recipients: string[]
  last_sent_at: string | null
  last_error: string | null
  resend_configured: boolean
}

export interface DigestTestResult {
  ok: boolean
  skipped: boolean
  error: string | null
}
```

- [ ] **Step 2: Extend api.ts**

In `src/lib/api.ts`, add after the existing `setupWebhook` line:

```typescript
  getDigestSettings: () => request<import('./types').DigestSettings>('api/org/digest-settings'),
  updateDigestSettings: (settings: { frequency: 'daily' | 'weekly' | null; extra_recipients: string[] }) =>
    request('api/org/digest-settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  sendTestDigest: () =>
    request<import('./types').DigestTestResult>('api/digest/test', { method: 'POST' }),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat: add DigestSettings types and api client methods"
```

---

### Task 7: EmailDigestForm + Settings Page Mount

**Files:**
- Create: `src/components/settings/EmailDigestForm.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create EmailDigestForm.tsx**

```typescript
// src/components/settings/EmailDigestForm.tsx
'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DigestSettings, DigestTestResult } from '@/lib/types'

const labelCls = 'block text-xs font-medium text-on-surface/70 uppercase tracking-wide mb-1'
const inputCls = 'w-full px-3 py-2 text-sm bg-surface-low rounded-lg outline outline-1 outline-surface-highest/30 focus:outline-primary'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailDigestForm() {
  const [settings, setSettings] = useState<DigestSettings | null>(null)
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | null>(null)
  const [recipientsText, setRecipientsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')
  const [testResult, setTestResult] = useState<DigestTestResult | null>(null)

  useEffect(() => {
    api.getDigestSettings().then(data => {
      setSettings(data)
      setFrequency(data.frequency)
      setRecipientsText((data.extra_recipients ?? []).join('\n'))
    }).catch(() => {})
  }, [])

  function parseRecipients(): { list: string[]; invalid: string[] } {
    const lines = recipientsText.split('\n').map(s => s.trim()).filter(Boolean)
    const invalid = lines.filter(l => !EMAIL_RE.test(l))
    return { list: lines, invalid }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const { list, invalid } = parseRecipients()
    if (invalid.length > 0) {
      setMsg(`Invalid email(s): ${invalid.join(', ')}`)
      return
    }
    setSaving(true)
    try {
      await api.updateDigestSettings({ frequency, extra_recipients: list })
      setMsg('Saved.')
      setSettings(await api.getDigestSettings())
    } catch (err) {
      setMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.sendTestDigest()
      setTestResult(result)
      setSettings(await api.getDigestSettings())
    } catch (err) {
      setTestResult({ ok: false, skipped: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!settings) return null

  const testEnabled = frequency !== null && settings.resend_configured

  return (
    <section className="bg-surface-lowest rounded-lg p-6">
      <h2 className="font-display text-sm font-semibold text-primary uppercase tracking-wide mb-4">
        Email Digest
      </h2>

      {!settings.resend_configured && (
        <div className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2 mb-4">
          Resend is not configured on the backend. Set <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> to enable.
        </div>
      )}

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className={labelCls}>Frequency</label>
          <div className="flex gap-3">
            {([null, 'daily', 'weekly'] as const).map(f => (
              <button
                key={f ?? 'off'}
                type="button"
                onClick={() => setFrequency(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  frequency === f
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface border-border text-on-surface/60 hover:text-on-surface'
                }`}
              >
                {f === null ? 'Off' : f === 'daily' ? 'Daily' : 'Weekly'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Extra Recipients (one per line)</label>
          <textarea
            value={recipientsText}
            onChange={e => setRecipientsText(e.target.value)}
            rows={3}
            placeholder="team@example.com"
            className={`${inputCls} font-mono resize-none`}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={!testEnabled || testing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? 'Sending…' : 'Send Test Digest'}
          </button>
        </div>

        {msg && <p className="text-xs text-on-surface/70">{msg}</p>}

        {testResult && (
          <p className={`text-xs ${testResult.ok ? 'text-healthy' : 'text-danger'}`}>
            {testResult.ok
              ? (testResult.skipped ? 'Sent (skipped — no activity in window)' : 'Sent!')
              : `Failed: ${testResult.error ?? 'unknown error'}`}
          </p>
        )}

        <div className="border-t border-border pt-3 space-y-1 text-xs text-on-surface/60">
          <p>Last sent: <strong>{settings.last_sent_at ?? 'Never'}</strong></p>
          {settings.last_error && (
            <p className="text-danger">Last error: {settings.last_error}</p>
          )}
        </div>
      </form>
    </section>
  )
}
```

- [ ] **Step 2: Mount EmailDigestForm in settings/page.tsx**

Replace `src/app/settings/page.tsx`:

```typescript
import { PageShell } from '@/components/layout/PageShell'
import { OrgSetupForm } from '@/components/settings/OrgSetupForm'
import { AIProviderForm } from '@/components/settings/AIProviderForm'
import { ApiUsagePanel } from '@/components/settings/ApiUsagePanel'
import { EmailDigestForm } from '@/components/settings/EmailDigestForm'

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-primary tracking-tight">Settings</h1>
      </div>
      <div className="space-y-10 max-w-lg">
        <OrgSetupForm />
        <ApiUsagePanel />
        <EmailDigestForm />
        <AIProviderForm />
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 3: Start dev server and verify Settings renders**

```bash
npm run dev
```

Open `http://localhost:3000/settings`. Expected:
- Email Digest section appears between API Usage and AI Provider
- Frequency buttons (Off / Daily / Weekly) are clickable
- If Resend is not configured: warning banner shows
- Extra Recipients textarea accepts multi-line input
- Save button persists, Send Test button is enabled only when frequency ≠ Off AND Resend is configured

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/EmailDigestForm.tsx src/app/settings/page.tsx
git commit -m "feat: EmailDigestForm with frequency toggle, recipients, and test button"
```

---

## Verification Checklist

**After all tasks complete — backend:**

```bash
python -m pytest backend/tests/ -v
```

Expected: all existing tests pass plus 4 new `test_resend_client` + 9 new `test_digest` tests.

**Frontend:**

```bash
npx tsc --noEmit
npm run dev
```

Expected: no new TypeScript errors; Settings page renders Email Digest section.

**End-to-end smoke test (manual):**

1. Apply migration 007 in Supabase.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `backend/.env` (verified from-address in Resend dashboard).
3. Restart backend.
4. Open Settings → Email Digest → set Frequency = Daily → add an extra recipient → Save.
5. Trigger a failing drift check (so there's at least one new incident).
6. Click Send Test Digest → email arrives; response shows `Sent!`.
7. Click Send Test Digest again immediately with no new activity → response shows `Sent (skipped — no activity in window)`.
