# Customer Impact

## The problem network teams live with today

A Mist enterprise with 500+ sites runs on **thousands of individual WLAN and site-level settings**. Those settings drift — someone toggles a checkbox during a change window, a template is applied to the wrong site, a new WLAN gets stood up without the guardrails of the rest.

The network team's current options are all bad:

- **Audit manually.** Open each WLAN, check each setting. Impossible at scale.
- **Build custom scripts.** Every team reinvents the same `requests.get()` loops. Brittle, undocumented, walks off with whoever wrote it.
- **Accept the drift.** Discover it in a P1 — a WLAN stops roaming because 802.11r was disabled on one SSID, an AP broadcasts on 2.4 GHz only because someone saved a bad rate template.

Each scenario costs real hours. Each scenario is preventable.

## What this tool does

**Continuously enforces configuration standards across every site in your Mist org, and can heal drift automatically.**

1. **Detect.** Every X minutes (or on a Mist webhook), pull WLAN and site config. Compare against your configured standards. Open incidents for anything out of spec.
2. **Diagnose.** Every finding includes the exact field, the current value, and the expected value. No more "something's broken on Site-47" — you see "802.11r off on Site-47 / Corp-WLAN, current roam_mode=legacy, expected=11r."
3. **Act.** For standards you trust, the tool PATCHes the fix directly back to Mist. You set the policy; the network carries it out.

A network engineer's day goes from "audit and react" to "approve or investigate."

## Why customers deploy this on day one

### Zero-config starting point
One-click template library covers the standards nearly every Mist customer needs: Fast Roaming (802.11r), ARP filtering, broadcast/multicast suppression, Data Rates enforcement, AP config persistence, RF templates, radio band enforcement, Wi-Fi 7 state, AP uplink monitoring. Turn them on and drift is being watched inside 60 seconds.

### Two ways to add custom standards
- **Paste a working Mist JSON config**, and the tool auto-derives standards from the field/value pairs — perfect for "enforce this known-good site's settings across the rest of the org."
- **Describe a filter in English** ("only WLANs with PSK or EAP auth") and the AI-assisted parser converts it into the structured filter JSON.

### Operates at real enterprise scale
Built for the Mist API's 5,000 calls/hour ceiling from day one:
- **Staggered polling** spreads site checks evenly across the interval — no bursts.
- **Per-org hourly call counter** with live UI — you always know how much headroom you have.
- **Minimum safe interval** computed from site count and enforced in the UI.
- **Webhook mode** takes the polling load off entirely for orgs above ~1,500 sites — Mist pushes config change events; the tool only checks the specific site that changed.

### Safe remediation
- Per-standard auto-fix toggle — you decide which standards heal themselves and which require review.
- Failed remediations surface as red in the UI and can be retried.
- Every action writes an incident + remediation record — full audit trail.
- Mist tokens encrypted at rest with per-deployment Fernet keys.

### Daily/weekly email digest
A quiet Monday morning summary: *"12 standards auto-remediated, 3 pending approval, 0 failures this week."* Delivered via Resend. Skipped entirely when there's nothing worth reporting — no cry-wolf noise.

## Quantifying the impact

Consider a 500-site Mist customer with 10 standards per site:

| Activity | Manual today | With this tool |
|---|---|---|
| Initial audit | 5 min × 500 sites = **42 hours** | **5 min** (click Check All) |
| Ongoing drift catch | Weekly audits × 52 weeks = **2,100 hours/yr** | Continuous, ~0 human time |
| MTTR for a drift incident | Hours (report → investigate → patch) | Minutes (incident opens → auto-remediate) |
| Onboarding a new site | Manual checklist review | Inherits org standards automatically |

For a typical Mist NOC team of 2-3 engineers, this tool returns **the equivalent of 1 FTE** back to higher-value work in the first year.

## Where it fits

- **Retail:** hundreds of stores, need consistent guest + corp WLAN posture
- **Campus / higher ed:** dormitory vs. academic building WLANs enforced separately via filters
- **Healthcare:** strict regulatory requirements on SSID settings, encryption, ARP
- **Branch networks:** corporate standards pushed to every remote site automatically
- **Managed service providers:** enforce contractual SLAs on customer configs

The tool is fully Mist-native — no parallel source-of-truth, no config files outside Mist. What the tool enforces is simply what you've told Mist to be.

## How fast can they deploy?

- Supabase project + Clerk app: **15 minutes**
- Apply 7 SQL migrations (copy-paste from the repo): **5 minutes**
- `docker compose up -d --build`: **5 minutes**
- Connect Mist token, click Templates, pick best practices: **2 minutes**

**Under 30 minutes from zero to live drift detection.**
