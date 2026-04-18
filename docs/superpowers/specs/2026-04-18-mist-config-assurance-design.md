# Mist Configuration Assurance — Design Spec
**Date:** 2026-04-18
**Status:** Approved

---

## 1. Overview

A multi-tenant SaaS tool for Juniper Mist network engineers. Each organisation defines configuration standards for their Mist deployment. The system continuously checks whether the live Mist configuration matches those standards, detects drift, and either automatically remediates or queues actions for approval — depending on the org's preference.

---

## 2. Architecture

```
Browser
  │
  ▼
Next.js (port 3000)
  │  UI only — no business logic
  │  Clerk handles auth + org switching
  │  passes Clerk JWT to Python on every request
  │
  ▼
Python FastAPI (port 8001, internal — never publicly exposed)
  │  Rule evaluation engine
  │  Mist API client
  │  Drift detection + scheduling (APScheduler)
  │  Auto-remediation (PATCH Mist API)
  │  Verifies Clerk JWT, scopes all data by org_id
  │
  ├──▶ Supabase (Postgres)   all persistent state
  └──▶ Mist API              per-org credentials stored encrypted in Supabase
```

**Deployment:**
- Local / testing: Docker Compose (Next.js + Python + local Postgres)
- Production: AWS (two ECS containers behind ALB, Supabase cloud for DB)

**Multi-tenancy:**
- One Clerk Organisation = one Mist org
- All Supabase rows scoped by `org_id` (Clerk org_id)
- Mist API token stored encrypted per org in Supabase
- Python extracts `org_id` from verified Clerk JWT — no cross-tenant data access possible

---

## 3. Data Model

### `org_config`
| Column | Type | Notes |
|---|---|---|
| org_id | text PK | Clerk org_id |
| mist_token | text | encrypted at rest |
| cloud_endpoint | text | e.g. api.eu.mist.com |
| org_name | text | fetched from Mist on connect |
| drift_interval_mins | int | 0 = manual only |
| auto_remediate | bool | org-level default |

### `site`
| Column | Type | Notes |
|---|---|---|
| id | text PK | Mist site_id |
| org_id | text | FK org_config |
| name | text | |
| monitored | bool | include in scheduled checks |
| last_checked_at | timestamptz | |

### `standard`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | text | FK org_config |
| name | text | |
| description | text | optional |
| scope | text | wlan \| site |
| filter | jsonb | optional — e.g. only open SSIDs |
| check_field | text | dotted path e.g. auth.pairwise |
| check_condition | text | eq \| ne \| in \| not_in \| truthy \| falsy \| contains_item \| not_contains_item \| gte \| lte |
| check_value | jsonb | scalar or array |
| remediation_field | text | field to PATCH in Mist |
| remediation_value | jsonb | value to set |
| auto_remediate | bool\|null | null = inherit org default |
| enabled | bool | |
| created_at | timestamptz | |

### `validation_run`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | text | |
| site_id | text | |
| site_name | text | |
| run_at | timestamptz | |
| triggered_by | text | manual \| scheduled |
| passed | int | |
| failed | int | |
| skipped | int | |

### `finding`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| run_id | uuid FK | |
| standard_id | uuid FK | |
| wlan_id | text | null for site-scoped |
| ssid | text | null for site-scoped |
| status | text | pass \| fail \| skip |
| actual_value | text | what the field was set to |

### `incident`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | text | |
| site_id | text | |
| site_name | text | |
| standard_id | uuid FK | |
| title | text | copied from standard.name |
| wlan_id | text | null for site-scoped |
| ssid | text | null for site-scoped |
| opened_at | timestamptz | |
| resolved_at | timestamptz | null = open |
| status | text | open \| resolved \| suppressed |

### `remediation_action`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| incident_id | uuid FK | |
| org_id | text | |
| site_id | text | |
| wlan_id | text | |
| standard_id | uuid FK | |
| desired_value | jsonb | |
| attempted_at | timestamptz | |
| status | text | pending \| approved \| rejected \| success \| failed |
| error_detail | text | |

---

## 4. Core Flows

### Drift Detection
```
Scheduler (APScheduler, one job per org) or manual trigger
  → fetch monitored sites for org from Supabase
  → for each site:
      GET /sites/{id}/wlans/derived  (Mist API)
      GET /sites/{id}/setting        (Mist API)
  → load org standards from Supabase
  → evaluate each standard against current state
  → for each FAIL:
      if open incident exists → update actual_value on finding
      if no open incident → create incident
  → for each PASS with open incident → resolve incident
  → save validation_run + findings to Supabase
  → if remediation required → trigger remediation flow
```

### Remediation
```
Incident created (or manually triggered)
  → resolve auto_remediate: standard.auto_remediate ?? org_config.auto_remediate
  → if true:
      PATCH Mist API: remediation_field = remediation_value
      save remediation_action (success | failed)
      if success → set incident.status = resolved
  → if false:
      save remediation_action with status = pending
      user sees it in Activity page, approves or rejects
      on approve → PATCH Mist API → resolve incident
```

### Scheduling
- APScheduler runs inside the FastAPI process
- On org_config create/update → job added or rescheduled
- `drift_interval_mins = 0` → no job created

### Auth
- Clerk manages login and org switching in Next.js
- Next.js passes `Authorization: Bearer <clerk_jwt>` to Python on every API call
- Python verifies JWT with Clerk public key and extracts `org_id`
- All DB queries include `WHERE org_id = ?`

---

## 5. UI — Pages & Navigation

Four pages, flat sidebar navigation.

### Dashboard `/`
- One row per site: name · pass count · fail count · last checked · Run Check button
- Sites with open incidents show an orange Drift badge
- No charts or widgets — data density over decoration

### Site Detail `/sites/[id]`
- Left (7 cols): findings table — standard name, scope, actual value, status badge
- Right (5 cols): open incidents with Remediate button per incident + Remediate All
- Auto-remediate orgs: Remediate fires immediately
- Approval orgs: Remediate creates a pending action

### Standards `/standards`
- Table of all org standards, inline enable/disable toggle
- Add/Edit opens a slide-over panel (not a new page)
- Form fields: name, scope, field path, condition, desired value, auto-remediate override

### Activity `/activity`
- Flat table of incidents and remediation actions
- Filter by site, status
- Approve / Reject buttons on pending remediation actions

### Org Setup (gear icon, sidebar footer)
- Mist credentials, cloud endpoint
- Drift interval
- Auto-remediate default toggle

---

## 6. Design System

Based on the existing "Digital Conservator" brief:

- **Palette:** Primary `#041627` (deep navy), Surface `#F7FAFC`
- **No 1px borders** — separation via background colour shifts (tonal layering)
- **Typography:** Manrope for headings, Inter for data/UI
- **CTAs:** Signature gradient `#041627 → #1A2B3C` at 135°
- **Status badges:** Emerald (compliant), Orange (drift), Red (remediation failed)
- **Depth:** Soft lift (white card on `surface-container`), no drop shadows
- **Spacing:** Tight inside components, generous between sections

---

## 7. Tech Stack

| Concern | Technology |
|---|---|
| Frontend | Next.js (App Router, TypeScript) |
| Auth + Multi-tenancy | Clerk (Organizations) |
| Backend / API | Python FastAPI |
| Rule engine | Python (from Config_Assurance_v0.1) |
| Database | Supabase (Postgres) |
| Scheduling | APScheduler (inside FastAPI) |
| Deployment (dev) | Docker Compose |
| Deployment (prod) | AWS ECS + Supabase cloud |

---

## 8. Out of Scope (for this build)

- Notifications (Slack, email) — add later
- Audit log — add later
- User roles beyond Clerk org membership — add later
- AP / switch config standards — WLAN and site scope only for now
