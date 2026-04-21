# Template Library Overhaul — Design Spec

## Overview

Replace the existing template library with a curated, tabbed UI of the most common best-practice standards. Engineers can add standards to their org with one click (or one dropdown selection). No freeform input — every template has a known Mist field mapping and a fixed or user-selected value.

---

## Layout

**Tabbed interface** — WLAN tab and Site tab at the top of the template library section.

Within each tab, templates are displayed in a **2-column grid**, grouped by category with a small uppercase label above each group.

Each template card contains:
- **Title** — short, readable name
- **Description** — one sentence explaining what it does and when to use it
- **Add button** (simple templates) — one-click, immediately creates the standard
- **Dropdown + Add** (multi-value templates) — user picks a value, then clicks Add

Once a template is added, its Add button becomes a muted "Added ✓" badge. It cannot be added twice.

---

## WLAN Tab

### Performance

| Card | Mist Field | Value | UI |
|------|-----------|-------|-----|
| Fast Roaming (802.11r) | `roam_mode` | `"11r"` | One-click Add |
| Data Rates | `rateset.24.template`, `rateset.5.template`, `rateset.6.template` | `"no-legacy"` / `"high-density"` / `"compatible"` | Dropdown + Add (creates 3 standards, one per band) |
| Wi-Fi 7 (802.11be) | `disable_11be` | `false` (enabled) or `true` (disabled) | Dropdown (Enabled/Disabled) + Add |

**Data Rates note:** Adding this template creates three separate standards (2.4 GHz, 5 GHz, 6 GHz), all set to the same selected template name. All three are created atomically — either all added or none.

**Wi-Fi 7 note:** The Mist field is `disable_11be`, so "Enabled" maps to `false` and "Disabled" maps to `true`. The UI uses plain language (Enabled/Disabled) and the backend handles the inversion.

### Radio Band

| Card | Mist Field | Value | UI |
|------|-----------|-------|-----|
| Radio Band — 2.4 GHz | `bands` | list includes `"24"` | One-click Add |
| Radio Band — 5 GHz | `bands` | list includes `"5"` | One-click Add |
| Radio Band — 6 GHz | `bands` | list includes `"6"` | One-click Add |

**Bands note:** The `bands` field is a list (e.g., `["24", "5", "6"]`). Each radio band standard checks that the corresponding value is present in the list. Remediation appends the value if missing rather than replacing the whole list.

### Network Efficiency

| Card | Mist Field | Value | UI |
|------|-----------|-------|-----|
| ARP Filtering | `arp_filter` | `true` | One-click Add |
| Broadcast/Multicast Filtering | TBD — needs Mist API research | `true` | One-click Add |
| Disable When Gateway Down | `disable_when_gateway_unreachable` | `true` | One-click Add |

**Broadcast/Multicast Filtering note:** The exact Mist WLAN field for multicast filtering is not confirmed. Implementation must verify the correct field name before adding this template. Candidate: a WLAN-level multicast filter flag, distinct from site-level `wifi.proxy_arp`.

---

## Site Tab

### Radio

| Card | Mist Field | Value | UI |
|------|-----------|-------|-----|
| RF Template | `rftemplate_id` | ID of selected template | Dropdown (loaded from Mist API) + Add |

**RF Template note:** The dropdown is populated at page load by calling `GET /api/v1/orgs/:org_id/rftemplates`. If the API call fails, the dropdown shows a placeholder ("Unable to load templates") and the Add button is disabled.

### Reliability

| Card | Mist Field | Value | UI |
|------|-----------|-------|-----|
| AP Config Persistence | `persist_config_on_device` | `true` | One-click Add |
| AP Uplink Monitoring | TBD — needs Mist API research | `true` | One-click Add |

**AP Uplink Monitoring note:** The exact Mist site setting field for uplink monitoring is not confirmed. Implementation must verify before including this template. Note: `uplink_port_config.keep_wlans_up_if_down` is the inverse of what we want; the actual monitoring toggle may be a different field.

### Security

| Card | Mist Field | Check | UI |
|------|-----------|-------|-----|
| Switch Mgmt Root Password | `switch_mgmt.root_password` | Truthy (is set) | One-click Add |
| WAN Edge Root Password | `gateway_mgmt.root_password` | Truthy (is set) | One-click Add |

**Password note:** Mist masks password values in API responses. These standards check that the field is non-empty (truthy). They cannot verify the actual password value. The card description and any compliance UI must make this limitation clear.

---

## Backend — Standard Definitions

Templates are **hardcoded in the frontend** as a static list of standard objects. No new database tables or backend endpoints are needed for the template library itself.

When the user clicks Add, the frontend calls the existing `POST /api/standards` endpoint with the standard's pre-filled fields. The only new backend work is:

1. `GET /api/rftemplates` — proxies `GET /api/v1/orgs/:org_id/rftemplates` from Mist, returns `[{id, name}]` for the RF Template dropdown.

---

## "Added" State

A template is considered "added" if a standard already exists with the same `check_field` (and `check_value` for multi-value templates like Wi-Fi 7). The frontend checks this on load and marks matching templates as "Added ✓". This check happens client-side against the existing standards list already loaded on the Standards page.

---

## Out of Scope

- Broadcast AP Name — field mapping not confirmed, deferred
- Band Steering, Wi-Fi 6, Wireless Bridging Disabled — removed from template list
- Editing or customising template values after adding — use the existing standard edit flow
- Adding new templates beyond this list — that is a future phase
