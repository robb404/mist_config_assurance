# Email Digest Notifications Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Send a scheduled daily or weekly digest email summarising drift-detection activity (new incidents, remediation outcomes) to the org's Clerk user and any additional recipients the admin configures.

**Architecture:** A dedicated `digest` module owns scheduling, window math, and Resend delivery — cleanly separated from drift detection. Scheduling mirrors the existing APScheduler per-org pattern. A "Send Test Digest" button in Settings lets admins verify Resend + recipients without waiting a full cycle.

**Tech Stack:** FastAPI (backend), APScheduler (scheduler), Supabase (storage), Resend (email delivery), Clerk Backend API (owner email lookup), Next.js (settings UI)

---

## Scope

- **Frequency:** digest only — no real-time per-event emails.
- **Granularity:** organization-level setting — daily, weekly, or off.
- **Content:** minimal headline counts (new incidents, successful remediations, failed remediations).
- **Empty-window behaviour:** skip send entirely if no activity in the window.
- **Recipients:** the Clerk user who connected the org + any admin-configured extra emails.

Out of scope for this phase: per-user digest preferences, HTML email templates, unsubscribe links, per-site breakdown, individual incident alerts.

---

## Data Model

New migration `007_digests.sql` adds four columns to `org_config`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `digest_frequency` | `text` | `null` | `'daily'`, `'weekly'`, or `null` (disabled) |
| `digest_extra_recipients` | `text[]` | `'{}'` | Optional extra email addresses entered in Settings |
| `digest_last_sent_at` | `timestamptz` | `null` | Anchor for the next digest window; also displayed in Settings |
| `digest_last_error` | `text` | `null` | Last Resend/Clerk failure message, displayed in Settings |
| `owner_user_id` | `text` | `null` | Clerk user id who first connected the org — used to look up the digest recipient's email |

A check constraint enforces `digest_frequency in ('daily','weekly')` when non-null.

The Clerk user's email is **not** persisted. It is fetched fresh at send time so a later Clerk email change flows through automatically.

---

## Scheduler + Digest Module

New module `backend/digest.py`:

### Exports

```python
def register_digest_job(org_id: str, frequency: str | None) -> None:
    """
    Register or replace the digest job for an org.
    frequency='daily'  -> CronTrigger(hour=8, minute=0) UTC
    frequency='weekly' -> CronTrigger(day_of_week='mon', hour=8, minute=0) UTC
    frequency=None     -> remove existing job
    """

async def send_digest(org_id: str, trigger_source: str) -> dict:
    """
    Compute the digest, send via Resend, update last_sent_at / last_error.
    trigger_source: 'scheduled' | 'manual'
    Returns {"ok": bool, "skipped": bool, "error": str | None}
    """
```

### Window computation

Digest counts events opened in the interval `(digest_last_sent_at, now]`.

- If `digest_last_sent_at` is null: window falls back to `now - 24h` (daily) or `now - 7d` (weekly).
- On a successful send (including empty-skip): `digest_last_sent_at` is set to `now`.
- On a Resend failure: `digest_last_sent_at` is **not** updated; the window grows until the next successful run.

### Counts queried

- `new_incidents` — `incident` rows where `opened_at` is in the window
- `remediation_success` — `remediation_action` rows where `attempted_at` is in the window and `status = 'success'`
- `remediation_failed` — `remediation_action` rows where `attempted_at` is in the window and `status = 'failed'`

### Startup

The existing `lifespan` function loops over `org_config` and calls `register_digest_job(org_id, row['digest_frequency'])` alongside the existing `upsert_org_job` call.

---

## Resend Integration

New module `backend/resend_client.py`:

```python
async def send_email(to: list[str], subject: str, text: str) -> tuple[bool, str | None]:
    """POST https://api.resend.com/emails. Returns (success, error_message)."""
```

**New env vars** (added to `.env.example` and `backend/.env`):

```
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

`RESEND_FROM_EMAIL` must be a verified sender domain in the Resend dashboard. Without it configured, `send_digest` skips early and writes `"Resend not configured"` to `digest_last_error`.

### Request shape

```json
POST https://api.resend.com/emails
Authorization: Bearer ${RESEND_API_KEY}
Content-Type: application/json

{
  "from": "<RESEND_FROM_EMAIL>",
  "to": ["user@example.com", "team@example.com"],
  "subject": "Mist Config Assurance — daily digest (2026-04-22)",
  "text": "<plain text body>"
}
```

### Email body template

Plain text. Daily example:

```
In the last 24 hours:

  • 5 new incidents
  • 12 auto-remediations succeeded
  • 2 auto-remediations failed

View details: https://your-app.vercel.app/activity
```

Weekly version substitutes "In the last 7 days" and the subject swaps `daily` → `weekly`. The link is built from the existing `APP_URL` env var (same one used for the Mist webhook URL).

---

## Recipients

Built at send time by `send_digest`:

1. **Clerk user email** — `GET https://api.clerk.com/v1/users/{owner_user_id}` with `Authorization: Bearer ${CLERK_SECRET_KEY}`. The `email_addresses` array is scanned; the entry matching `primary_email_address_id` is used. If the call fails or returns no primary email, the lookup is skipped with a WARN log — the send continues with extras only.
2. **Extra recipients** — `digest_extra_recipients` array.

The combined list is deduplicated (case-insensitive). If the resulting list is empty, `send_digest` sets `digest_last_error = "no recipients configured"` and returns without calling Resend.

`CLERK_SECRET_KEY` is already present in `.env.example`. The Clerk Backend API URL is `https://api.clerk.com/v1`.

---

## Empty-window Behaviour

After counting, if `new_incidents + remediation_success + remediation_failed == 0`:
- Do not send email.
- Set `digest_last_sent_at = now` and `digest_last_error = null`.
- Log at INFO level: `"digest skipped (empty window) org=%s"`.

This matches the "skip if zero activity" decision and avoids retrying the same empty window repeatedly.

---

## Settings UI

New component `src/components/settings/EmailDigestForm.tsx`, mounted on `/settings` below `ApiUsagePanel`.

### Fields

- **Frequency toggle** — three buttons: `Off` / `Daily` / `Weekly`. Selecting `Off` removes the scheduled job and clears `digest_frequency`.
- **Extra recipients** — multi-line textarea, one email per line. Validated client-side (rudimentary regex); rejected lines are highlighted before save.
- **Status rows** (read-only):
  - `Last sent: <ISO timestamp>` — or "Never" when null.
  - `Last error: <string>` — only shown when non-null; red text.
- **Send Test Digest** button — disabled unless Frequency is `Daily` or `Weekly` AND `RESEND_API_KEY` is configured server-side. Sends a digest immediately to the configured recipients, using the same window math as a scheduled run.

### API endpoints

```
GET /api/org/digest-settings
  -> { frequency: 'daily'|'weekly'|null, extra_recipients: string[],
       last_sent_at: string|null, last_error: string|null,
       resend_configured: boolean }

PATCH /api/org/digest-settings
  body: { frequency: 'daily'|'weekly'|null, extra_recipients: string[] }
  -> { ok: true }
  Side effects: updates org_config, calls digest.register_digest_job(org_id, frequency)

POST /api/digest/test
  -> { ok: boolean, skipped: boolean, error: string|null }
  Calls send_digest(org_id, trigger_source='manual'); returns the result verbatim.
```

---

## Database Changes Summary

| Change | File |
|---|---|
| New columns on `org_config` | `supabase/migrations/007_digests.sql` |

No new tables. All digest state lives in `org_config`.

---

## Files Affected

| File | Action |
|---|---|
| `supabase/migrations/007_digests.sql` | Create |
| `backend/digest.py` | Create |
| `backend/resend_client.py` | Create |
| `backend/tests/test_digest.py` | Create — unit tests for window math, count aggregation, empty-skip logic |
| `backend/tests/test_resend_client.py` | Create — unit tests with mocked httpx |
| `backend/main.py` | Modify — three new endpoints; lifespan registers digest jobs |
| `backend/models.py` | Modify — `DigestSettingsRequest` Pydantic model |
| `.env.example` | Modify — add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `backend/.env` | Modify — add both vars with placeholder values |
| `docker-compose.yml` | Modify — forward both vars to the backend service |
| `src/lib/types.ts` | Modify — `DigestSettings` interface |
| `src/lib/api.ts` | Modify — `getDigestSettings`, `updateDigestSettings`, `sendTestDigest` |
| `src/components/settings/EmailDigestForm.tsx` | Create |
| `src/app/settings/page.tsx` | Modify — mount `EmailDigestForm` |

---

## Testing

### Backend unit tests (mocked)

- `test_digest.py`:
  - Window math: first-run falls back to now−24h / now−7d.
  - Window math: subsequent runs use `digest_last_sent_at` as the anchor.
  - Empty-window skip: send is not called, `last_sent_at` updated to now.
  - Count aggregation: correct counts from fake incident/remediation fixtures.
  - Resend failure: `last_error` persisted, `last_sent_at` unchanged.
  - No recipients: short-circuits with `last_error = "no recipients configured"`.
- `test_resend_client.py`:
  - Happy path returns `(True, None)`.
  - Non-2xx response returns `(False, "<body>")`.
  - Missing `RESEND_API_KEY` returns `(False, "Resend not configured")` without making an HTTP call.

### Manual verification

1. Configure Resend (API key + verified from-address) and restart backend.
2. Create at least one incident (trigger a failing drift check).
3. Set frequency → Daily, add an extra recipient, save.
4. Click Send Test Digest → email arrives within seconds.
5. Empty-window case: click test when there's been no activity since `last_sent_at` → response shows `skipped: true`, no email sent.
6. Confirm scheduled job lands at 08:00 UTC (can be verified by shifting the cron temporarily during dev).
