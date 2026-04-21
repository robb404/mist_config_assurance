# Example Output

Concrete examples of what the tool produces at each stage — findings, remediation events, email digests, CSV exports, and the main UI screens. Screenshots are referenced from `docs/screenshots/` (add your own captures there; the filenames below are the suggested names).

---

## Dashboard

The landing view after sign-in.

![Dashboard](screenshots/dashboard.png)

**Header:**
- `OVERVIEW / Dashboard` overline + title
- Four stat tiles: Sites, Healthy, Drift, Errors — clickable as filters

**Toolbar:**
- Search input (filters by site name)
- Count label (`Showing 3 of 24` when filtered)
- `Check All` (runs drift on all monitored sites; switches to `Check (N)` when rows are selected)
- `Sync Sites` (pulls latest site list from Mist)

**Site list:**
Each row shows:
```
[☐] Site-Name     12 pass   2 drift →    (last checked 2m ago)    [Check]
```

Drift badges link to the Activity page; failed-check badges link to the site detail.

---

## Site detail

Clicking a site from the Dashboard opens:

![Site detail](screenshots/site-detail.png)

**Header:**
- `← Dashboard` back link
- `SITE / HQ North` (site name, not UUID)
- Last checked timestamp + `Monitored` pill toggle
- `Check` primary button

**Stat tiles:** Pass / Fail / Skip / Incidents

**Open Incidents card** (when any): collapsed summary with `Remediate All` action.

**Findings section** — grouped by WLAN:

```
WLANs (3)
  📶 Corp-WLAN                    [12 pass] [0 fail] [0 skip] [0 open]              [▼]
  📶 Guest           (orange bg)  [10 pass] [2 fail] [0 skip] [1 open]  Remediate (2)  [▼]
  📶 IoT                          [12 pass] [0 fail] [0 skip] [0 open]              [▼]

SITE SETTINGS (5)
  ⚙  Site Settings                [4 pass]  [1 fail] [0 skip] [1 open]  Remediate (1)  [▼]
```

Clicking a WLAN row expands to show per-standard results with per-row `Fix` buttons for anything with a pending remediation.

---

## Standards

![Standards](screenshots/standards.png)

- Stat tiles: Total / Enabled (clickable filter)
- Search + `Templates` + `Custom Config` buttons
- Two collapsible sections: **WLAN Standards** and **Site Standards**
- Each row: icon, name + description, Drift/Auto pills when applicable, enable toggle, edit/delete icons

### Templates drawer

![Templates drawer](screenshots/templates-drawer.png)

Grouped cards per scope — Performance, Radio Band, Network Efficiency (WLAN) and Radio, Reliability (Site). Click `Add` on any card to instantly create that standard with sensible defaults.

### Custom Config drawer

Paste raw Mist JSON:

```json
{
  "arp_filter": true,
  "roam_mode": "11r",
  "disable_11be": false,
  "bands": ["5", "6"]
}
```

The tool parses each field and proposes a standard:

- `arp_filter: true` → Standard "Arp Filter" scope=wlan check=truthy, remediation=true
- `roam_mode: "11r"` → Standard "Roam Mode" scope=wlan check=eq "11r"
- `disable_11be: false` → Standard "Disable 11be" scope=wlan check=falsy
- `bands: ["5", "6"]` → Standard "Bands" scope=wlan check=eq ["5","6"]

Each can be edited (add a filter, change the scope, rename) before saving.

---

## Activity (incident log)

![Activity](screenshots/activity.png)

- Tiles filter by Open / Failed / Resolved / Suppressed
- Search (standard, site, SSID)
- `Export CSV` downloads the filtered rows
- Icon actions per row: ✓ approve, ✕ reject, ↻ retry, 👁 suppress

### Sample CSV export (`activity-2026-04-21.csv`)

```csv
Standard,Site,SSID,Opened,Status,Resolved,Action Status,Error
Fast Roaming (802.11r),HQ North,Corp-WLAN,2026-04-21T14:32:17+00:00,open,,pending,
Data Rates (no-legacy),Branch A,Guest,2026-04-21T12:10:04+00:00,resolved,2026-04-21T12:10:47+00:00,success,
ARP Filtering,HQ North,IoT,2026-04-20T22:45:11+00:00,open,,failed,"Mist API returned 403: insufficient permissions"
AP Config Persistence,Branch B,,2026-04-20T08:00:22+00:00,resolved,2026-04-20T08:00:58+00:00,success,
```

---

## Email digest

Sent daily or weekly via Resend. Plain text, minimal noise. Skipped entirely on empty windows.

```
Subject: Mist Config Assurance — daily digest (2026-04-22)
From:    notifications@yourdomain.com
To:      you@yourcompany.com, team@yourcompany.com

In the last 24 hours:

  • 5 new incidents
  • 12 auto-remediations succeeded
  • 2 auto-remediations failed

View details: https://your-app.example.com/activity
```

---

## Settings → API Usage panel

Shows the org's hourly Mist API budget in real time.

![API Usage](screenshots/api-usage.png)

```
API USAGE                                                   [▼]

Calls used this hour
147 / 5,000
[====................................................................]

Estimated check calls / hour
900 / 4,000 check budget
[=======|========|..............................................]
  Checks  Remediation reserve

Minimum safe interval for 24 monitored sites: 5 min
```

In webhook mode, the panel shows: webhook URL (copy button), Mist setup steps (DNS + portal), secret regeneration, and last-received-event timestamp.

---

## Settings → Debug Logs

Live stream of backend logs, gated by `ENABLE_DEBUG_LOGS=true`.

![Debug Logs](screenshots/debug-logs.png)

Monospace pane, color-coded by level (orange for WARNING, red for ERROR). Start/Stop toggle, level filter, search, copy-visible-lines, and **Pop out** button that opens the view in a dedicated window for side-by-side debugging during incidents.

Example stream:

```
14:32:15 INFO     mist_ca Drift check starting for org=org_abc123
14:32:15 INFO     mist_ca call counter org=org_abc123 used=9
14:32:18 WARNING  mist_ca Rate budget exhausted: skipping site=site_001 (calls_used=3998)
14:32:22 INFO     mist_ca patch site wlan site=site_002 wlan=wlan_003 ok=True
14:32:22 INFO     mist_ca Mist webhook: org=org_abc123 triggered check for 2 sites
14:32:25 INFO     mist_ca digest sent org=org_abc123 recipients=3 trigger=scheduled
14:32:31 ERROR    mist_ca remediation failed: Mist API returned 401: token expired
```

---

## Mist webhook delivery (backend log)

When webhook mode is configured in the Mist portal, drift checks fire near-instantly on config changes:

```
[2026-04-21 14:35:02] INFO  Mist webhook: org=org_abc triggered check for 1 sites
[2026-04-21 14:35:03] INFO  Drift check starting for org=org_abc site=site_047
[2026-04-21 14:35:04] INFO  finding: standard=std_fastroam wlan=wlan_007 status=fail actual=legacy expected=11r
[2026-04-21 14:35:04] INFO  opening incident: site=site_047 standard=std_fastroam
[2026-04-21 14:35:04] INFO  auto-remediating incident=inc_9f2a
[2026-04-21 14:35:05] INFO  patch site wlan site=site_047 wlan=wlan_007 ok=True
[2026-04-21 14:35:05] INFO  incident inc_9f2a resolved
```

Total elapsed from config change in Mist → back in spec: **~3 seconds.**

---

## Adding screenshots

To populate this document with real screenshots:

1. Run the app locally or in your production Docker.
2. Open DevTools → capture full-page screenshots of the screens above.
3. Save each as a PNG in `docs/screenshots/` with the filename referenced above (e.g. `dashboard.png`).
4. Commit both the docs and the screenshots.

The image refs in this file use relative paths, so they render correctly on GitHub once the files are in place.
