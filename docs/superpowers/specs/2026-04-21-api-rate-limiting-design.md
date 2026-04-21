# API Rate Limiting & Call Efficiency Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the system stays within the Mist API 5,000 calls/hour token limit at any org scale, with full transparency to the user and an event-driven webhook mode for large enterprises.

**Architecture:** Two operating modes — polling (staggered, rate-limited) and webhook (event-driven). Both share a call budget model that reserves headroom for remediation. The UI surfaces usage clearly and warns when polling is impractical at scale.

**Tech Stack:** FastAPI (backend), APScheduler (scheduler), Supabase (org config + call tracking), Next.js (settings UI)

---

## Call Budget Model

The Mist API enforces **5,000 calls/hour per token**.

| Budget allocation | Calls/hour |
|---|---|
| Check calls (polling) | 4,000 |
| Remediation overhead reserve | 1,000 |
| **Total** | **5,000** |

Each site check costs **3 API calls**:
1. `GET sites/:id/wlans/derived`
2. `GET sites/:id/setting`
3. `GET sites/:id`

Maximum site-checks per hour at 4,000 call budget = **1,333 site-checks/hour**.

### Minimum Safe Polling Interval

```
min_interval_minutes = ceil(site_count × 3 / 4000 × 60)
```

| Sites | Min interval |
|---|---|
| 100 | 5 min |
| 500 | 23 min |
| 1,000 | 45 min |
| 1,500 | 68 min |
| 2,000 | 90 min |
| 5,000 | 225 min (~3.75 hr) |

### Large Org Behaviour

- The minimum interval always scales safely regardless of site count — the math is always enforced.
- Above **1,500 sites**, the UI displays a prominent warning: *"At this scale, webhook mode is recommended for reliable drift detection."*
- Polling remains available above 1,500 sites but with the enforced long interval clearly surfaced.

---

## Mode 1: Staggered Polling

### Scheduler Change

The current `run_drift_for_org` function loops over all sites in a tight sequential burst at the start of each interval. This is replaced with a **staggered dispatcher**:

- Sites are distributed evenly across the interval window as individual timed tasks.
- Example: 100 sites over a 15-minute interval = one site check every 9 seconds.
- A per-org **rate limiter** tracks `calls_used_this_hour`. If firing the next site check would exceed 4,000 calls, the check is deferred until the next hour window resets.

### Rate Limiter Logic

```python
CALLS_PER_SITE = 3
CHECK_BUDGET   = 4_000  # calls/hour reserved for checks
REMEDIATION_RESERVE = 1_000

def can_check(calls_used: int) -> bool:
    return calls_used + CALLS_PER_SITE <= CHECK_BUDGET
```

`calls_used_this_hour` and `calls_window_start` are stored in `org_config`. At the start of each hour window, `calls_used_this_hour` resets to 0. All API calls — checks and remediation — increment the same counter. The 4,000/1,000 split is a soft allocation: the scheduler refuses to schedule new site checks if doing so would push the counter above 4,000, preserving the remaining headroom for remediation. The hard cap is 5,000 total.

---

## Mode 2: Webhook Mode

### Backend Endpoint

```
POST /api/webhooks/mist/{org_id}
```

- Mist POSTs audit events here when any config change occurs on a site in the org.
- The backend validates the payload using HMAC-SHA256 (via Mist's `X-Mist-Signature-v2` header) with the stored `webhook_secret`.
- On validation success, a single-site check is triggered for the affected site (same logic as a manual run).
- In webhook mode, the staggered scheduler is **paused** — no periodic polling runs.

### Payload Validation

```python
import hmac, hashlib

def verify_mist_webhook(secret: str, payload_bytes: bytes, signature_header: str) -> bool:
    expected = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

### Daily Safety Net Scan

Even in webhook mode, a **once-daily full scan** runs across all monitored sites at a low-traffic time (configurable, default 02:00 UTC). This catches any drift that Mist webhook delivery may have missed (delivery failures, missed events during downtime).

The daily scan runs at **02:00 UTC** (fixed in this phase, not user-configurable) and uses the same staggered logic respecting the call budget.

### Auto-Generated Webhook URL

The webhook URL is generated from the app's public domain and the org's ID:

```
https://<APP_DOMAIN>/api/webhooks/mist/{org_id}
```

`APP_DOMAIN` is set via environment variable `NEXT_PUBLIC_APP_URL`. The URL is displayed in Settings with a one-click copy button.

### Webhook Secret

- Auto-generated (32-byte random hex) when webhook mode is first enabled.
- Stored encrypted in `org_config.webhook_secret`.
- Displayed once in the UI with a "Regenerate" button (regenerating invalidates the old secret immediately).

---

## Mist Configuration (Required)

Users must configure the webhook in the Mist portal. The Settings page displays these steps inline:

1. In Mist portal: **Organization → Webhooks → Add Webhook**
2. **URL:** paste the auto-generated URL from this page
3. **Secret Token:** paste the generated secret from this page
4. **Topics:** enable `audits` (captures all config change events across all sites)
5. **Enabled:** toggle on

These steps are also documented in the product docs with annotated screenshots.

---

## Database Changes

`org_config` gains the following columns:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `mode` | `text` | `'polling'` | `'polling'` or `'webhook'` |
| `webhook_secret` | `text` | `null` | Encrypted HMAC secret |
| `calls_used_this_hour` | `integer` | `0` | Rolling call counter |
| `calls_window_start` | `timestamptz` | `null` | Start of current hourly window |
| `daily_scan_time` | `time` | `'02:00'` | UTC time for webhook-mode safety scan (fixed, not user-configurable in this phase) |

---

## Transparency UI (Settings Page)

A new **API Usage** panel in Settings → Drift Detection:

### Polling mode display

- Call rate: *"~X calls/hour based on Y sites at Z-minute interval"*
- Horizontal budget bar: `[====Checks (X%)====|==Remediation (20%)==|..headroom..]`
- Minimum safe interval helper text on the interval input (goes red if configured value is below minimum)
- At 1,500+ sites: warning callout recommending webhook mode

### Webhook mode display

- Webhook status: Connected / Not verified (last event timestamp)
- Daily safety scan: next scheduled run
- Call budget: *"~X calls/hour available for remediation and daily scan"*
- Webhook URL + Copy button
- Webhook secret + Regenerate button
- Mist setup instructions (inline steps)

### Both modes

- Live counter: *"X calls used this hour / 5,000 limit"*
- Remaining headroom

---

## Files Affected

| File | Change |
|---|---|
| `supabase/migrations/006_rate_limiting.sql` | Add new `org_config` columns |
| `backend/rate_limiter.py` | New — call budget tracking logic |
| `backend/scheduler.py` | Staggered dispatch, webhook mode pause |
| `backend/main.py` | New `POST /api/webhooks/mist/{org_id}` endpoint; wire rate limiter into drift loop |
| `backend/models.py` | Add `mode`, `daily_scan_time` to `OrgSettingsRequest` |
| `src/lib/types.ts` | Add `mode`, `calls_used_this_hour`, `webhook_secret` fields to org type |
| `src/lib/api.ts` | No new endpoints needed beyond existing PATCH /api/org/settings |
| `src/components/settings/ApiUsagePanel.tsx` | New — call budget display, webhook setup UI |
| `src/app/settings/page.tsx` | Mount `ApiUsagePanel` |
