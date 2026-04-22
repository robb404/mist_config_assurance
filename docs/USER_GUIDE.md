# User Guide

A practical walkthrough for people who already have the app running. For install and setup see [`SETUP.md`](SETUP.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).

## The mental model

The app continuously answers one question: **"Is every site's Mist config matching what we said it should match?"**

- **Standards** are the rules you want enforced. "Fast Roaming must be enabled on every WLAN" is a standard.
- **Sites** are your Mist sites, synced automatically.
- **Findings** are the evaluation of each standard against each site's current config. They're `pass`, `fail`, or `skip`.
- **Incidents** are opened when a finding fails. They close when the finding passes again.
- **Remediation actions** are the Mist PATCH calls that fix a failing standard. They can run automatically or require your approval.

Everything in the UI maps onto one of those five.

---

## Dashboard

Your landing page. One row per monitored site.

**Stat tiles (clickable filters):**
- **Sites** — total monitored
- **Healthy** — all recent findings pass, no check errors
- **Drift** — at least one failing finding
- **Errors** — last check hit a Mist API error (token expired, rate limit, etc.)

Click a tile to filter the site list. Click the same tile again to clear.

**Site row:**
- Checkbox — add to the bulk selection
- Site name + pass count + drift badge (→ Activity page) + check-error badge (→ site detail) + last checked timestamp
- **Check** button — run a fresh drift scan on this one site

**Toolbar:**
- Search — substring match on site name
- **Check All / Check (N)** — runs scans on every visible site, or just the checked ones
- **Sync Sites** — re-fetches the site list from Mist (new sites you added in Mist, deleted ones, etc.)

## Status colors & badges, at a glance

| Color | Meaning |
|---|---|
| 🟢 **healthy / green** | All good. Finding passes, incident resolved, standard enabled. |
| 🟠 **drift / orange** | Finding fails, incident open, remediation waiting. "This needs attention." |
| 🔵 **verifying / teal** | Remediation fired; Mist ACKed the fix. Awaiting next scheduled check for independent validation. |
| 🔴 **error / red** | Something went wrong — Mist API error, failed remediation action, check failure. |
| ⚫ **muted / grey** | Skipped finding, suppressed incident, disabled standard — not actionable. |

## Status flow (incidents)

```
   finding fails          remediation runs            next check runs
open ──────────────► open ──────────────────► verifying ─────┐
                      ▲                                       │
                      │                  finding fails again  │
                      └───────────────────────────────────────┘
                      │
                      │          finding now passes
                      └───────────────► resolved
```

**Key point:** `verifying` is a claim, not a confirmation. Mist PATCH said 200, but we haven't re-read the config to prove the change actually took. The next scheduled check proves or disproves it.

---

## Common workflows

### "A site is drifting — what now?"

1. On the Dashboard, the site's row shows an orange **N drift** badge. Click the site name.
2. You're on the site detail page. The WLAN with drift has an orange Wi-Fi icon and an expanded finding list.
3. Each failing row shows the exact standard name, the actual value, the expected value, and (if a remediation action is pending) a **Fix** button.
4. Click **Fix** for an individual standard, or **Remediate ({N})** on the WLAN card for all of it.
5. The incident goes into `verifying`. Wait for the next scheduled check, or click **Check** in the page header for immediate validation.

### "Auto-remediation says it fixed but drift keeps coming back"

Mist returned 200 on the PATCH but something downstream didn't actually apply the change. You'll see the incident bounce: `open → verifying → open → verifying → …`

To investigate:
- Open the site detail page, expand the drifting WLAN. Note the `actual_value`.
- Open the same WLAN in the Mist portal and check the setting by hand.
- Check the **Activity** page — the `remediation_action` rows show `status: success` for the fix attempts. Cross-reference with the Mist audit log to see whether the change stuck.

Workarounds:
- Temporarily disable the standard on the Standards page until you've diagnosed.
- Turn off auto-fix for just that standard (click the ⚡ icon on the row — orange = on, grey = off).

### "I want to enforce my golden site's config across the org"

1. Open Mist, navigate to your golden site, copy the relevant WLAN or site config as JSON.
2. In the app: **Standards → Custom Config** (primary button in the top right).
3. Paste the JSON. The app derives one standard per field/value pair.
4. Review each derived standard — you can tweak names, add filters (e.g., "only apply to PSK WLANs"), or delete ones you don't want enforced.
5. Save. The new standards are active on the next drift check.

### "I want to bulk-enforce best practices with zero config"

1. **Standards → Templates** (secondary button).
2. Pick a category (Performance, Radio Band, Network Efficiency, Reliability).
3. Click **Add** on each template you want — they're preconfigured with sane defaults and filters (e.g., Fast Roaming skips open/OWE WLANs automatically).

### "I only want to watch some sites, not all of them"

- On the site detail page, toggle **Monitored** off. The scheduler skips unmonitored sites.
- Alternatively, apply a `filter` on a standard to target specific SSID names or scopes.

### "I want someone else on the team to see the daily activity"

- **Settings → Email Digest**.
- Set **Frequency** to Daily or Weekly.
- Add extra email addresses (one per line).
- Click **Send Test Digest** to verify delivery.
- The digest skips entirely if there's nothing to report, so no cry-wolf.

---

## Running at scale

### API budget

Mist allows **5,000 API calls per hour per token**. The app reserves 80% for drift checks, 20% for remediations.

**Settings → API Usage** shows live usage. If the bar turns red, the drift scheduler backs off until the hourly window rolls over.

**Signals it's time to tune:**
- "Minimum interval for your org" badge in Settings. If you have 1,000 sites and the minimum is 45 min, scheduling every 15 min will self-throttle.
- **Calls used** approaching 5,000 — add webhooks or lengthen the interval.

### Webhook mode (1,500+ sites)

Polling stops. Mist pushes config change events to `/api/webhooks/mist/{org_id}` — the app only runs checks on sites that actually changed. A daily 02:00 UTC safety scan catches anything missed.

To switch:
1. **Settings → API Usage → change mode to Webhook**.
2. Click **Generate Secret**. Copy the secret (shown once).
3. In Mist portal: Organization → Settings → Webhooks → Add Webhook.
4. URL: paste the webhook URL from the API Usage panel.
5. Secret: paste the generated secret.
6. Topics: enable **audits**.
7. Save.

The panel shows a "last received event" timestamp once Mist starts posting — that's your confirmation.

---

## Advanced

### Per-standard auto-fix

Click the ⚡ icon on any standard row on the Standards page to flip that standard's auto-remediate on or off:

- **Orange ⚡ (filled)**: drift of this standard auto-fixes on detection
- **Grey ⚡ (outline)**: drift is surfaced as an incident; waits for your approval

Per-standard overrides the org-level default (Settings → Drift Settings → Self-healing).

### Filters on standards

A standard's `filter` limits which WLANs/sites it applies to. Examples:
- `auth.type in ('psk', 'eap')` — WLAN standards that only apply to secured WLANs
- `enabled eq true` — only check WLANs that Mist reports as enabled
- `name contains 'Corp'` — only WLANs with "Corp" in the name

Edit via the **Edit** (pencil) icon on a standard row, or describe in English via **Custom Config → AI Assistant** and paste a prompt.

### Debug logs (live backend view)

**Settings → Debug Logs** streams the Python backend's logs in-browser. Useful when:
- A drift check is failing and you want to see the exact Mist error
- A webhook isn't firing checks and you want to watch the signature validation
- A remediation succeeded but didn't stick

Click **Pop out** for a dedicated window you can keep off to the side during incidents.

The feature is gated by `ENABLE_DEBUG_LOGS=true` in the backend env — if you see "disabled," set that var and restart the container.

---

## Troubleshooting

### "Your Mist org is connected. Next, sync your sites."
Drift will start once at least one site is synced. Click **Sync Sites** or configure a site manually in Mist and come back.

### "This site hasn't been scanned yet"
No drift check has ever run against this site. Click **Check** in the header to run one now, or let the scheduled interval fire.

### API Usage panel shows "0 calls" but sites definitely just ran
The counter resets hourly. If the counter doesn't match what you see in Mist's own audit log, restart the backend — the in-memory counter will reset but underlying behavior is unchanged.

### Wizard flow skipped; can I re-run it?
Navigate to `/welcome` manually. The Connect step detects existing connections and auto-skips; you'll land on step 2 (Standards).

### I changed my Mist token — do I need to re-run anything?
Go to **Settings → Mist Connection → Change connection**, paste the new token, click **Reconnect**. Sites auto-sync again. Existing standards and incidents are preserved.

### Debug logs panel says "Live log streaming is disabled"
Set `ENABLE_DEBUG_LOGS=true` in `backend/.env`, then restart the backend container: `docker compose restart backend`.

### Nothing seems to be happening on a schedule
- **Settings → Drift Settings → Check Interval** — is it set to a non-zero value?
- **Settings → Drift Settings → Detection Mode** — on webhook mode, scheduled polling is off by design; only the daily safety scan runs.

---

## Glossary

- **Standard** — a rule. "Fast Roaming must be enabled on every WLAN."
- **Scope** — `wlan` (evaluated per-WLAN) or `site` (evaluated once per site).
- **Filter** — narrows a standard to specific WLANs/sites (e.g., only PSK auth).
- **Check field** — the specific Mist config field the standard inspects (e.g., `roam_mode`).
- **Check condition** — how the value is compared (`eq`, `ne`, `truthy`, `falsy`, `in`, `contains_item`, `set_eq`).
- **Remediation field / value** — what to PATCH to Mist when a fix is applied.
- **Finding** — the result of evaluating one standard against one WLAN or site. `pass`, `fail`, or `skip`.
- **Incident** — opened on the first failing finding for a standard. Closes when the finding passes again.
- **Remediation action** — a queued or applied Mist PATCH. `pending` → `approved` → `success` (or `failed`).
- **Drift** — informally, any open incident or failing finding.
- **Self-healing** — org-level toggle for whether drift auto-remediates org-wide.
- **Auto-fix (⚡)** — per-standard override on self-healing.
- **Verifying** — Mist said the fix was applied, waiting for independent validation on the next scheduled check.
