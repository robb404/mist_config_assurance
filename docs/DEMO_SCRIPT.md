# Demo Script — 10-15 min Hackathon Presentation

Concrete outline mapped to the judging criteria. Time each section so you don't run long.

## Rubric coverage

| Section | Minutes | Rubric slice |
|---|---|---|
| 1. The problem | 1 | Customer Impact |
| 2. First-run demo | 3 | Customer Impact, Self-Driving (L1) |
| 3. Drift + heal demo | 3 | Self-Driving (L2 + L3) |
| 4. Scale story | 2 | Production Readiness, Broad Applicability |
| 5. Innovation highlights | 2 | Innovation |
| 6. Architecture + security | 2 | Production Readiness |
| 7. Close + Q&A buffer | 1-2 | — |

---

## 1. The problem (1 min)

**Say this verbatim or close to it:**

> "Mist is the network's eyes — telemetry, insights, Marvis. But when Marvis tells you a WLAN is broken, someone still has to open the GUI and click a checkbox to fix it. At 500 sites, that's every drift event — hundreds a week. This tool is the network's hands. It watches every WLAN and site against your configured standards, and when something drifts, it puts it back — automatically."

**Transition:** "Let me show you."

## 2. First-run demo (3 min)

**What the judges see:** you go from zero to a live drift dashboard in under a minute.

1. **Sign in** — Clerk UI, org auto-created on first login.
2. **Settings → Mist Connection** — paste a Mist API token, pick the cloud endpoint, click Connect.
   - *Call out:* "Sites sync automatically — no extra step."
3. **Dashboard** — sites appear in the list; Sites / Healthy / Drift / Errors tiles populate.
4. **Standards → Templates** — expand the drawer.
   - *Call out:* "One-click best practices. Fast Roaming, ARP Filtering, Data Rates, AP Config Persistence, RF templates. Click Add — standard is active across every site."
5. Click Add on 2-3 templates.
6. **Dashboard → Check All** — watch findings stream in.

**Say:**
> "That's Level 1 — intelligent detection. Mist tells us what is; our standards tell us what should be. Every difference is a finding."

## 3. Drift + heal demo (3 min)

**Set up before the demo:** have one site with a known standard violation so you can trigger remediation live.

1. **Dashboard** — click into the drifting site.
2. **Site detail** — show the WLAN card grouping.
   - *Call out:* "See the orange WLAN? Wi-Fi icon turns orange when something's off. Stat pills show 2 fail. Standards that pass stay invisible until I want to see them."
3. **Expand the drifting WLAN** — show the specific standard + actual vs expected value.
   - *Call out:* "This is Level 2 — diagnosis. We don't just say 'something's broken.' We say: `roam_mode=legacy` on Corp-WLAN, expected `11r`."
4. **Click Fix** on the failing row — watch the UI update to "Checking…" then return with the finding now passing.
5. **Activity page** — show the incident that just auto-resolved.

**Say:**
> "That's Level 3 — autonomous action. One click PATCHed Mist and closed the incident. With `auto_remediate` on, it would've happened without a click — drift detected → remediation queued → fix applied → incident closed, all in under 3 seconds."

## 4. Scale story (2 min)

**Why this matters:** hackathon rewards solutions that work at thousands of sites.

1. **Settings → API Usage** — show the call budget panel.
   - *Call out:* "Mist's API ceiling is 5,000 calls an hour per token. At 1,000 sites with 10 standards each, naive polling hits that ceiling in 10 minutes. We don't. Four thousand calls reserved for checks, a thousand for remediation, a staggered polling loop spreads site checks evenly, and the UI shows exactly where we sit."
2. **Flip mode to Webhook** — show the URL, the secret, the Mist setup steps.
   - *Call out:* "At 1,500+ sites, polling stops entirely. Mist pushes audit events here. We check only what changed. Scheduled API usage drops to zero — the entire 5,000-call budget becomes available for remediation."
3. **Activity → CSV export** — click Export CSV.
   - *Call out:* "Ops teams need audit trails — every incident exportable, integrates with whatever SIEM or ticketing system you already run."

## 5. Innovation highlights (2 min)

Pick 2-3 of these; skip the rest if time is tight:

- **Custom Config** — open the drawer, paste a working Mist WLAN JSON, show standards derived automatically from each field/value pair. *"Take your golden site's config and turn it into enforceable standards org-wide in one paste."*
- **AI-assisted filter parsing** — "only WLANs with PSK or EAP auth" → structured filter JSON. *"You don't have to learn our filter language; describe it in English."*
- **Email digest** — Settings → Email Digest. Show the toggle and mention the Mist Setup-style inline instructions. *"Quiet Monday morning summary; skipped entirely when there's no news."*
- **Live debug logs** — Settings → Debug Logs → Start stream → Pop out. Watch backend logs tail live in-browser. *"When something breaks in production, ops doesn't need shell access to the container."*

## 6. Architecture + security (2 min)

Keep this short — you're a builder, not a lecturer.

- **Two containers** — Next.js frontend, FastAPI backend. Docker Compose. Supabase for Postgres, Clerk for auth, Resend for email. Everything else is Mist-native.
- **Mist tokens encrypted at rest** via Fernet with a per-deployment key.
- **Webhook signatures** validated with HMAC-SHA256 (X-Mist-Signature-v2).
- **Per-org isolation** — Clerk Organizations scope every query; no cross-tenant leakage possible.
- **No shared state across orgs** — each tenant has their own budget, their own schedule, their own data.

**Link:** `docs/ARCHITECTURE.md` has the component diagram + drift lifecycle sequence.

## 7. Close (1 min)

> "Every Mist customer with more than fifty sites has this problem today. They solve it with spreadsheets, custom Python, or accepting the drift. We built the tool they all wanted to build but didn't have time to. Under thirty minutes from zero to live drift detection. Self-healing from day one."

Then: **"Questions?"**

---

## What to open before the demo

Have these tabs ready so you don't fumble:

1. `http://localhost:3000/dashboard` — logged in, org connected, at least 3 sites synced
2. `http://localhost:3000/sites/<one-with-drift>` — pre-staged drift for the heal demo
3. `http://localhost:3000/standards` — templates drawer closed
4. `http://localhost:3000/activity` — a few resolved incidents for history
5. `http://localhost:3000/settings` — collapsed
6. `http://localhost:3000/debug/logs` — popped-out, streaming (optional flourish)
7. GitHub repo — `https://github.com/robb404/mist_config_assurance`
8. `docs/ARCHITECTURE.md` rendered on GitHub (the Mermaid diagrams render inline)

## Pre-demo checklist

Before you go live:

- [ ] Docker containers running (`docker compose ps` shows both healthy)
- [ ] At least one site with a known drift violation in Mist
- [ ] Clerk dev instance under 100 users (cap) — pre-register any collaborators
- [ ] Email digest test send works (verify Resend domain)
- [ ] Debug logs `ENABLE_DEBUG_LOGS=true` if you plan to show the log streaming
- [ ] Presentation window and browser side-by-side
- [ ] Reliable internet — Mist API calls will hang the demo if your connection dies

## If something breaks mid-demo

- **A Mist call times out** — don't panic. Say: "this is network gear talking to network gear in real time — and yes, this is why we added per-call timeouts and a webhook mode." Continue to the next section.
- **Supabase row missing** — re-run the migration or seed via the `/debug/logs` view to check what the backend is doing.
- **Docker container restarted** — `docker compose ps` to confirm health; the app recovers automatically.

## Closing line options

Pick whichever fits your delivery:

- *"The network has always wanted to heal itself. Now it can."*
- *"This isn't another dashboard. This is the NOC engineer you can't hire."*
- *"Every drift event you don't have to chase is an engineer you've freed up for real work."*
