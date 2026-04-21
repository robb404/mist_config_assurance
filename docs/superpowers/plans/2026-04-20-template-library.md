# Template Library Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing flat template library with a tabbed (WLAN/Site), 2-column grid UI of curated best-practice standards, with dropdown support and RF Template loaded from the Mist API.

**Architecture:** Templates are defined as a static TypeScript data structure in `standard-templates.ts`. The `TemplateLibrary` component renders tabs and card grids; clicking Add calls the existing `POST /api/standards` endpoint. One new backend endpoint (`GET /api/rftemplates`) proxies the Mist org RF templates API for the RF Template dropdown.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, FastAPI (Python), pytest-asyncio

---

## File Map

| File | Change |
|------|--------|
| `backend/mist_client.py` | Add `get_rftemplates()` |
| `backend/main.py` | Add `GET /api/rftemplates` endpoint |
| `backend/tests/test_rftemplates.py` | New — tests for mist_client + endpoint |
| `src/lib/types.ts` | Add `RfTemplate` interface |
| `src/lib/api.ts` | Add `getRftemplates` call |
| `src/lib/standard-templates.ts` | Full rewrite — new tab/group/card structure |
| `src/components/standards/TemplateLibrary.tsx` | Full rewrite — tabbed grid UI |
| `src/app/standards/page.tsx` | Update `TemplateLibrary` prop from `existingNames` to `standards` |

---

## Task 1: Backend — `get_rftemplates` + endpoint

**Files:**
- Modify: `backend/mist_client.py`
- Modify: `backend/main.py`
- Create: `backend/tests/test_rftemplates.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_rftemplates.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_rftemplates_success():
    raw = [{"id": "rf1", "name": "Corporate"}, {"id": "rf2", "name": "High Density"}]
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=True)
        mock_resp.json.return_value = raw
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == raw


@pytest.mark.asyncio
async def test_get_rftemplates_api_failure():
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=False)
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == []


@pytest.mark.asyncio
async def test_get_rftemplates_non_list_response():
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=True)
        mock_resp.json.return_value = {"error": "unexpected"}
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == []
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /home/robert/mist-config-assurance
python -m pytest backend/tests/test_rftemplates.py -v
```

Expected: `ImportError: cannot import name 'get_rftemplates'`

- [ ] **Step 3: Add `get_rftemplates` to `backend/mist_client.py`**

Append after `patch_org_setting` (the last function in the file):

```python
async def get_rftemplates(token: str, base_url: str, org_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}orgs/{org_id}/rftemplates",
            headers=_headers(token), timeout=TIMEOUT,
        )
        if not resp.is_success:
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
```

- [ ] **Step 4: Run tests — expect pass**

```bash
python -m pytest backend/tests/test_rftemplates.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Add `GET /api/rftemplates` to `backend/main.py`**

Add after the `GET /api/fields` block (around line 160). The endpoint reads org credentials from the DB, calls `mist.get_rftemplates`, and returns a lean `[{id, name}]` list:

```python
@app.get("/api/rftemplates")
async def list_rftemplates(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "mist_token,cloud_endpoint,mist_org_id"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured. POST /api/org/connect first.")
    token = decrypt(row.data["mist_token"])
    base_url = mist.build_base_url(row.data["cloud_endpoint"])
    mist_org_id = row.data["mist_org_id"]
    templates = await mist.get_rftemplates(token, base_url, mist_org_id)
    return [{"id": t["id"], "name": t["name"]} for t in templates if "id" in t and "name" in t]
```

- [ ] **Step 6: Run full backend test suite**

```bash
python -m pytest backend/tests/ -v
```

Expected: all existing tests plus 3 new PASSED

- [ ] **Step 7: Commit**

```bash
git add backend/mist_client.py backend/main.py backend/tests/test_rftemplates.py
git commit -m "feat: add GET /api/rftemplates endpoint"
```

---

## Task 2: Frontend types + API client

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add `RfTemplate` to `src/lib/types.ts`**

Append at the end of the file:

```typescript
export interface RfTemplate {
  id: string
  name: string
}
```

- [ ] **Step 2: Add `getRftemplates` to `src/lib/api.ts`**

Add inside the `api` object after `getFields`:

```typescript
getRftemplates: () => request<import('./types').RfTemplate[]>('api/rftemplates'),
```

- [ ] **Step 3: Type-check**

```bash
cd /home/robert/mist-config-assurance
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat: add RfTemplate type and getRftemplates API call"
```

---

## Task 3: Rewrite `standard-templates.ts`

**Files:**
- Modify: `src/lib/standard-templates.ts` (full rewrite)

**Context:** The existing file exports `TEMPLATE_GROUPS: TemplateGroup[]`. The new file exports `TABS: TabConfig[]` with a different structure. `TemplateLibrary.tsx` currently imports `TEMPLATE_GROUPS` — that import will break until Task 4 updates it. The type-check step catches this.

- [ ] **Step 1: Rewrite `src/lib/standard-templates.ts`**

Replace the entire file contents:

```typescript
import type { Standard } from './types'

type BaseStd = Omit<Standard, 'id' | 'org_id' | 'created_at'>

export interface TemplateCard {
  key: string
  title: string
  description: string
  /** Present on dropdown and dynamic cards; absent on simple cards. */
  options?: { label: string; value: string }[]
  /** If 'rftemplates', caller must populate options from GET /api/rftemplates. */
  dynamicOptions?: 'rftemplates'
  /** Returns the standards to create. Simple cards ignore selectedValue. */
  getStandards: (selectedValue?: string) => BaseStd[]
  /** Returns true if this template is already represented in the loaded standards list. */
  isAdded: (standards: Standard[]) => boolean
}

export interface TemplateGroup {
  label: string
  templates: TemplateCard[]
}

export interface TabConfig {
  id: 'wlan' | 'site'
  label: string
  groups: TemplateGroup[]
}

const W: Pick<BaseStd, 'scope' | 'filter' | 'enabled' | 'auto_remediate'> = {
  scope: 'wlan', filter: null, enabled: true, auto_remediate: null,
}

const S: Pick<BaseStd, 'scope' | 'filter' | 'enabled' | 'auto_remediate'> = {
  scope: 'site', filter: null, enabled: true, auto_remediate: null,
}

export const TABS: TabConfig[] = [
  {
    id: 'wlan',
    label: 'WLAN',
    groups: [
      {
        label: 'Performance',
        templates: [
          {
            key: 'fast_roaming',
            title: 'Fast Roaming (802.11r)',
            description: 'Reduces roam latency <50ms — PSK/EAP WLANs only.',
            getStandards: () => [{
              ...W,
              name: 'Fast Roaming (802.11r)',
              description: 'Enable 802.11r Fast BSS Transition for seamless roaming. Skipped on open/OWE WLANs.',
              filter: [
                { field: 'auth.type', condition: 'eq', value: 'psk' },
                { field: 'auth.type', condition: 'eq', value: 'eap' },
              ],
              check_field: 'roam_mode', check_condition: 'eq', check_value: '11r',
              remediation_field: 'roam_mode', remediation_value: '11r',
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'roam_mode'),
          },
          {
            key: 'data_rates',
            title: 'Data Rates',
            description: 'Enforce a rate template on 2.4, 5, and 6 GHz (creates 3 standards).',
            options: [
              { label: 'No Legacy', value: 'no-legacy' },
              { label: 'High Density', value: 'high-density' },
              { label: 'Compatible', value: 'compatible' },
            ],
            getStandards: (val = 'no-legacy') =>
              (['24', '5', '6'] as const).map(band => ({
                ...W,
                name: `Data Rates — ${band === '24' ? '2.4' : band} GHz (${val})`,
                description: `Set ${band === '24' ? '2.4' : band} GHz rate template to ${val}.`,
                check_field: `rateset.${band}.template`,
                check_condition: 'eq',
                check_value: val,
                remediation_field: `rateset.${band}.template`,
                remediation_value: val,
              })),
            isAdded: (stds) =>
              ['24', '5', '6'].every(b => stds.some(s => s.check_field === `rateset.${b}.template`)),
          },
          {
            key: 'wifi7',
            title: 'Wi-Fi 7 (802.11be)',
            description: 'Ensure Wi-Fi 7 is enabled or disabled across all WLANs.',
            options: [
              { label: 'Enabled', value: 'enabled' },
              { label: 'Disabled', value: 'disabled' },
            ],
            getStandards: (val = 'enabled') => {
              const disable = val !== 'enabled'
              return [{
                ...W,
                name: `Wi-Fi 7 (802.11be) ${disable ? 'Disabled' : 'Enabled'}`,
                description: `Ensure 802.11be (Wi-Fi 7) is ${disable ? 'disabled' : 'enabled'} on all WLANs.`,
                check_field: 'disable_11be',
                check_condition: 'eq',
                check_value: disable,
                remediation_field: 'disable_11be',
                remediation_value: disable,
              }]
            },
            isAdded: (stds) => stds.some(s => s.check_field === 'disable_11be'),
          },
        ],
      },
      {
        label: 'Radio Band',
        templates: [
          {
            key: 'band_24',
            title: 'Radio Band — 2.4 GHz',
            description: 'Require WLANs to broadcast on 2.4 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 2.4 GHz',
              description: 'Ensure WLANs are configured to broadcast on 2.4 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '24',
              remediation_field: 'bands', remediation_value: ['24'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '24'),
          },
          {
            key: 'band_5',
            title: 'Radio Band — 5 GHz',
            description: 'Require WLANs to broadcast on 5 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 5 GHz',
              description: 'Ensure WLANs are configured to broadcast on 5 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '5',
              remediation_field: 'bands', remediation_value: ['5'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '5'),
          },
          {
            key: 'band_6',
            title: 'Radio Band — 6 GHz',
            description: 'Require WLANs to broadcast on 6 GHz.',
            getStandards: () => [{
              ...W,
              name: 'Radio Band — 6 GHz',
              description: 'Ensure WLANs are configured to broadcast on 6 GHz.',
              check_field: 'bands', check_condition: 'contains_item', check_value: '6',
              remediation_field: 'bands', remediation_value: ['6'],
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'bands' && s.check_value === '6'),
          },
        ],
      },
      {
        label: 'Network Efficiency',
        templates: [
          {
            key: 'arp_filter',
            title: 'ARP Filtering',
            description: 'Proxy ARP replies — cuts broadcast traffic.',
            getStandards: () => [{
              ...W,
              name: 'ARP Filtering',
              description: 'Enable ARP filtering to suppress broadcast ARP storms and proxy replies.',
              check_field: 'arp_filter', check_condition: 'truthy', check_value: null,
              remediation_field: 'arp_filter', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'arp_filter'),
          },
          {
            key: 'limit_bcast',
            title: 'Broadcast/Multicast Filtering',
            description: 'Drop non-essential broadcast frames to protect airtime.',
            getStandards: () => [{
              ...W,
              name: 'Broadcast/Multicast Filtering',
              description: 'Limit broadcast and multicast traffic to reduce airtime waste.',
              check_field: 'limit_bcast', check_condition: 'truthy', check_value: null,
              remediation_field: 'limit_bcast', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'limit_bcast'),
          },
          {
            key: 'disable_gw_down',
            title: 'Disable When Gateway Down',
            description: 'Disables WLAN when AP cannot reach its gateway.',
            getStandards: () => [{
              ...W,
              name: 'Disable When Gateway Down',
              description: 'Disable WLAN when the AP cannot reach its gateway.',
              check_field: 'disable_when_gateway_unreachable', check_condition: 'truthy', check_value: null,
              remediation_field: 'disable_when_gateway_unreachable', remediation_value: true,
            }],
            isAdded: (stds) =>
              stds.some(s => s.check_field === 'disable_when_gateway_unreachable'),
          },
        ],
      },
    ],
  },
  {
    id: 'site',
    label: 'Site',
    groups: [
      {
        label: 'Radio',
        templates: [
          {
            key: 'rftemplate',
            title: 'RF Template',
            description: 'Apply an org RF template to all sites.',
            options: [],
            dynamicOptions: 'rftemplates',
            getStandards: (val = '') => {
              if (!val) return []
              return [{
                ...S,
                name: 'RF Template',
                description: 'Ensure sites use the selected org RF template.',
                check_field: 'rftemplate_id', check_condition: 'eq', check_value: val,
                remediation_field: 'rftemplate_id', remediation_value: val,
              }]
            },
            isAdded: (stds) => stds.some(s => s.check_field === 'rftemplate_id'),
          },
        ],
      },
      {
        label: 'Reliability',
        templates: [
          {
            key: 'persist_config',
            title: 'AP Config Persistence',
            description: 'AP retains config and serves clients when cloud connection is lost.',
            getStandards: () => [{
              ...S,
              name: 'AP Config Persistence',
              description: 'Store AP config locally so APs remain functional during cloud outages.',
              check_field: 'persist_config_on_device', check_condition: 'truthy', check_value: null,
              remediation_field: 'persist_config_on_device', remediation_value: true,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'persist_config_on_device'),
          },
        ],
      },
      {
        label: 'Security',
        templates: [
          {
            key: 'switch_root_pw',
            title: 'Switch Mgmt Root Password',
            description: 'Ensure a root password is set on managed switches. Checks password is set — value not verified.',
            getStandards: () => [{
              ...S,
              name: 'Switch Mgmt Root Password',
              description: 'Ensure managed switches have a root password configured. Password value cannot be verified.',
              check_field: 'switch_mgmt.root_password', check_condition: 'truthy', check_value: null,
              remediation_field: 'switch_mgmt.root_password', remediation_value: null,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'switch_mgmt.root_password'),
          },
          {
            key: 'wan_root_pw',
            title: 'WAN Edge Root Password',
            description: 'Ensure a root password is set on WAN edge devices. Checks password is set — value not verified.',
            getStandards: () => [{
              ...S,
              name: 'WAN Edge Root Password',
              description: 'Ensure WAN edge devices have a root password configured. Password value cannot be verified.',
              check_field: 'gateway_mgmt.root_password', check_condition: 'truthy', check_value: null,
              remediation_field: 'gateway_mgmt.root_password', remediation_value: null,
            }],
            isAdded: (stds) => stds.some(s => s.check_field === 'gateway_mgmt.root_password'),
          },
        ],
      },
    ],
  },
]
```

- [ ] **Step 2: Type-check (expect failure — TemplateLibrary still imports old export)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: error about `TEMPLATE_GROUPS` not exported. This is correct — fix in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/lib/standard-templates.ts
git commit -m "feat: rewrite standard-templates with tabbed card structure"
```

---

## Task 4: Rewrite `TemplateLibrary.tsx` + update standards page

**Files:**
- Modify: `src/components/standards/TemplateLibrary.tsx` (full rewrite)
- Modify: `src/app/standards/page.tsx`

- [ ] **Step 1: Rewrite `src/components/standards/TemplateLibrary.tsx`**

Replace the entire file:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { TABS } from '@/lib/standard-templates'
import type { TemplateCard } from '@/lib/standard-templates'
import { api } from '@/lib/api'
import type { Standard, RfTemplate } from '@/lib/types'

interface Props {
  standards: Standard[]
  onAdded: () => void
}

export function TemplateLibrary({ standards, onAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'wlan' | 'site'>('wlan')
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [rfTemplates, setRfTemplates] = useState<RfTemplate[]>([])
  const [rfError, setRfError] = useState(false)

  useEffect(() => {
    if (open && activeTab === 'site' && rfTemplates.length === 0 && !rfError) {
      api.getRftemplates()
        .then(setRfTemplates)
        .catch(() => setRfError(true))
    }
  }, [open, activeTab, rfTemplates.length, rfError])

  async function addTemplate(card: TemplateCard, selectedValue?: string) {
    const toCreate = card.getStandards(selectedValue)
    if (toCreate.length === 0) return
    setAdding(prev => new Set(prev).add(card.key))
    try {
      for (const std of toCreate) {
        await api.createStandard(std)
      }
      onAdded()
    } finally {
      setAdding(prev => { const n = new Set(prev); n.delete(card.key); return n })
    }
  }

  const currentTab = TABS.find(t => t.id === activeTab)!

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm text-primary font-medium hover:opacity-80 transition-opacity"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Template Library
        <span className="text-on-surface/40 font-normal">— one-click best-practice standards</span>
      </button>

      {open && (
        <div className="mt-4">
          {/* Tab bar */}
          <div className="flex border-b border-border mb-5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface/50 hover:text-on-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Groups */}
          <div className="space-y-6">
            {currentTab.groups.map(group => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-on-surface/50 uppercase tracking-widest mb-3">
                  {group.label}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {group.templates.map(card => {
                    const alreadyAdded = card.isAdded(standards)
                    const isAdding = adding.has(card.key)
                    const hasOptions = card.options !== undefined
                    const isDynamic = card.dynamicOptions === 'rftemplates'
                    const effectiveOptions = isDynamic
                      ? rfTemplates.map(t => ({ label: t.name, value: t.id }))
                      : (card.options ?? [])
                    const defaultVal = effectiveOptions[0]?.value
                    const selectedVal = selections[card.key] ?? defaultVal
                    const canAdd = !alreadyAdded && !isAdding &&
                      (!hasOptions || effectiveOptions.length > 0) &&
                      !(isDynamic && rfError)

                    return (
                      <div key={card.key} className="bg-surface-lowest rounded-xl p-3 flex flex-col">
                        <p className="text-sm font-semibold text-on-surface mb-1">{card.title}</p>
                        <p className="text-xs text-on-surface/50 mb-3 flex-1">{card.description}</p>

                        {hasOptions && (
                          <div className="mb-2">
                            {isDynamic && rfError ? (
                              <p className="text-xs text-on-surface/40 italic">Unable to load templates</p>
                            ) : effectiveOptions.length === 0 ? (
                              <p className="text-xs text-on-surface/40 italic">
                                {isDynamic ? 'Loading…' : 'No options'}
                              </p>
                            ) : (
                              <select
                                value={selectedVal ?? ''}
                                disabled={alreadyAdded}
                                onChange={e =>
                                  setSelections(prev => ({ ...prev, [card.key]: e.target.value }))
                                }
                                className="w-full text-xs bg-surface border border-border rounded px-2 py-1 text-on-surface"
                              >
                                {effectiveOptions.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {alreadyAdded ? (
                          <span className="text-xs bg-surface-high text-on-surface/40 px-3 py-1.5 rounded-lg self-start">
                            Added ✓
                          </span>
                        ) : (
                          <button
                            disabled={!canAdd}
                            onClick={() => addTemplate(card, selectedVal)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors self-start ${
                              canAdd
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'bg-surface-high text-on-surface/40 cursor-not-allowed'
                            }`}
                          >
                            {isAdding ? 'Adding…' : 'Add'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `src/app/standards/page.tsx`**

Change the `TemplateLibrary` prop from `existingNames` to `standards`:

Find this line:
```typescript
<TemplateLibrary existingNames={standards.map(s => s.name)} onAdded={load} />
```

Replace with:
```typescript
<TemplateLibrary standards={standards} onAdded={load} />
```

- [ ] **Step 3: Type-check — expect clean**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Start dev server and test manually**

```bash
npm run dev
```

Open `http://localhost:3000/standards`.

Test checklist:
- [ ] Template Library toggle opens/closes
- [ ] WLAN tab active by default; Site tab switches
- [ ] WLAN tab shows 3 groups: Performance, Radio Band, Network Efficiency
- [ ] Site tab shows 3 groups: Radio, Reliability, Security
- [ ] Data Rates card shows dropdown with 3 options; Add creates 3 standards
- [ ] Wi-Fi 7 card shows dropdown (Enabled/Disabled); Add creates 1 standard
- [ ] RF Template card on Site tab shows "Loading…" then populates (or shows error if org not connected)
- [ ] Adding a template marks it "Added ✓" after page refreshes standards
- [ ] Cards already represented in the standards list load as "Added ✓" on page open

- [ ] **Step 5: Commit**

```bash
git add src/components/standards/TemplateLibrary.tsx src/app/standards/page.tsx
git commit -m "feat: rewrite TemplateLibrary with tabbed grid UI and dropdown support"
```
