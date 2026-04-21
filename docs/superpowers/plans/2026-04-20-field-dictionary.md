# Field Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `docs/mist-api/field-reference.md` into a structured `fields.json` and use it for scope detection, field validation in QuickAddForm, and AI context enrichment in the filter parser.

**Architecture:** A `backend/field_dict.py` module parses the curated markdown table into `backend/fields.json` (committed to repo). The backend exposes `GET /api/fields` (frontend consumption) and `POST /api/fields/refresh` (re-parse on demand). The frontend uses the dict to replace the hardcoded `WLAN_FIELDS` set and show field descriptions. The AI provider uses it to auto-generate a richer system prompt.

**Tech Stack:** Python (regex, pathlib, json), FastAPI, Next.js/TypeScript, existing proxy pattern.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/field_dict.py` | Create | Parse field-reference.md → dict; load fields.json |
| `backend/fields.json` | Create | Pre-generated field dictionary (committed) |
| `backend/tests/test_field_dict.py` | Create | Parser unit tests |
| `backend/main.py` | Modify | Add GET /api/fields + POST /api/fields/refresh |
| `backend/ai_provider.py` | Modify | Accept field_dict, enrich system prompt |
| `backend/tests/test_ai_provider.py` | Modify | Add test for enriched prompt |
| `src/lib/types.ts` | Modify | Add FieldEntry type |
| `src/lib/api.ts` | Modify | Add getFields() |
| `src/components/standards/QuickAddForm.tsx` | Modify | Use field dict for scope + validation UI |

---

### Task 1: field_dict.py — parser and fields.json

**Files:**
- Create: `backend/field_dict.py`
- Create: `backend/fields.json`
- Create: `backend/tests/test_field_dict.py`

The `field-reference.md` has two scope sections (`## WLAN Fields (\`scope: wlan\`)` and `## Site-Setting Fields (\`scope: site\`)`) and markdown tables with columns: Field, Type, Values, Notes.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_field_dict.py
from backend.field_dict import build_field_dict, get_field_dict


def test_wlan_scope_assigned():
    d = build_field_dict()
    assert d["auth.type"]["scope"] == "wlan"


def test_site_scope_assigned():
    d = build_field_dict()
    assert d["rogue.enabled"]["scope"] == "site"


def test_values_parsed():
    d = build_field_dict()
    assert "psk" in d["auth.type"]["values"]
    assert "eap" in d["auth.type"]["values"]


def test_notes_present():
    d = build_field_dict()
    assert d["auth.type"]["notes"] != ""


def test_type_present():
    d = build_field_dict()
    assert d["auth.type"]["type"] == "string"


def test_get_field_dict_returns_dict():
    d = get_field_dict()
    assert isinstance(d, dict)
    assert len(d) > 10
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/robert/mist-config-assurance
python -m pytest backend/tests/test_field_dict.py -v
```
Expected: `ImportError: cannot import name 'build_field_dict'`

- [ ] **Step 3: Implement `backend/field_dict.py`**

```python
import json
import re
from pathlib import Path

_FIELD_REF = Path(__file__).parent.parent / "docs" / "mist-api" / "field-reference.md"
_FIELDS_JSON = Path(__file__).parent / "fields.json"

_SCOPE_RE = re.compile(r"##\s+\w[^(]*\(`scope:\s*(\w+)`\)", re.IGNORECASE)
_ROW_RE = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|")


def _parse_values(raw: str) -> list[str]:
    tokens = re.findall(r"`([^`]+)`", raw)
    if tokens:
        return tokens
    return [t.strip() for t in re.split(r"[\s/|]+", raw) if t.strip()]


def build_field_dict() -> dict:
    text = _FIELD_REF.read_text()
    result: dict = {}
    current_scope = "wlan"
    for line in text.splitlines():
        m = _SCOPE_RE.search(line)
        if m:
            current_scope = m.group(1).lower()
            continue
        m = _ROW_RE.match(line)
        if not m:
            continue
        field = m.group(1)
        ftype = m.group(2).strip()
        values_raw = m.group(3).strip()
        notes = m.group(4).strip()
        result[field] = {
            "scope": current_scope,
            "type": ftype,
            "values": _parse_values(values_raw),
            "notes": notes,
        }
    return result


def save_field_dict() -> dict:
    d = build_field_dict()
    _FIELDS_JSON.write_text(json.dumps(d, indent=2))
    return d


def get_field_dict() -> dict:
    if _FIELDS_JSON.exists():
        return json.loads(_FIELDS_JSON.read_text())
    return build_field_dict()
```

- [ ] **Step 4: Run tests — should pass**

```bash
python -m pytest backend/tests/test_field_dict.py -v
```
Expected: 6 tests PASS

- [ ] **Step 5: Generate `fields.json`**

```bash
cd /home/robert/mist-config-assurance
python -c "from backend.field_dict import save_field_dict; d = save_field_dict(); print(f'Generated {len(d)} fields')"
```
Expected output: `Generated N fields` (N should be > 50)

- [ ] **Step 6: Spot-check the output**

```bash
python -c "from backend.field_dict import get_field_dict; d = get_field_dict(); import json; print(json.dumps(d['auth.type'], indent=2)); print(json.dumps(d['rogue.enabled'], indent=2))"
```
Expected:
```json
{
  "scope": "wlan",
  "type": "string",
  "values": ["open", "psk", "eap", "eap192", "wep"],
  "notes": "Primary auth method"
}
{
  "scope": "site",
  "type": "bool",
  "values": ["true", "false"],
  "notes": "Rogue AP detection"
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/field_dict.py backend/fields.json backend/tests/test_field_dict.py
git commit -m "feat: parse field-reference.md into structured fields.json"
```

---

### Task 2: Backend API endpoints — GET /api/fields + POST /api/fields/refresh

**Files:**
- Modify: `backend/main.py` (add two endpoints near the AI endpoints)

- [ ] **Step 1: Add endpoints to `backend/main.py`**

Find the block containing `@app.get("/api/ai-config")` and add the following directly after the AI endpoints section:

```python
# ---------------------------------------------------------------------------
# Field Dictionary
# ---------------------------------------------------------------------------

@app.get("/api/fields")
async def get_fields(org_id: str = Depends(get_org_id)):
    from .field_dict import get_field_dict
    return get_field_dict()


@app.post("/api/fields/refresh")
async def refresh_fields(org_id: str = Depends(get_org_id)):
    from .field_dict import save_field_dict
    d = save_field_dict()
    return {"refreshed": len(d)}
```

- [ ] **Step 2: Start backend and verify endpoints respond**

```bash
cd /home/robert/mist-config-assurance
uvicorn backend.main:app --reload --port 8000 &
sleep 2
curl -s http://localhost:8000/api/fields -H "Authorization: Bearer test" | python -c "import sys,json; d=json.load(sys.stdin); print(f'Got {len(d)} fields, auth.type scope={d[\"auth.type\"][\"scope\"]}')"
```
Expected: `Got N fields, auth.type scope=wlan`

(If the Authorization header fails, that's expected — the org_id dependency requires a real Clerk token; the endpoint structure is correct as long as it imports cleanly.)

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add GET /api/fields and POST /api/fields/refresh endpoints"
```

---

### Task 3: AI provider enrichment — auto-generate system prompt from field dict

**Files:**
- Modify: `backend/ai_provider.py`
- Modify: `backend/main.py` (pass field_dict to parse_filter)
- Modify: `backend/tests/test_ai_provider.py`

The current system prompt hardcodes the valid field list. We replace this with a dynamically built block from `fields.json` that includes field names AND their valid values, so the LLM can map natural language (e.g. "Enterprise") to exact values (e.g. `eap`).

- [ ] **Step 1: Add test for enriched system prompt**

Add to `backend/tests/test_ai_provider.py`:

```python
def test_enriched_prompt_includes_field_values():
    """When field_dict is provided, system prompt should include valid values."""
    from backend.ai_provider import _build_system_prompt
    field_dict = {
        "auth.type": {"scope": "wlan", "type": "string", "values": ["open", "psk", "eap"], "notes": "Primary auth method"},
        "roam_mode": {"scope": "wlan", "type": "string", "values": ["none", "OKC", "11r"], "notes": "Fast roaming mode"},
    }
    prompt = _build_system_prompt(field_dict)
    assert "auth.type" in prompt
    assert "psk" in prompt
    assert "eap" in prompt
    assert "roam_mode" in prompt


def test_base_prompt_works_without_field_dict():
    from backend.ai_provider import _build_system_prompt
    prompt = _build_system_prompt(None)
    assert "filter" in prompt.lower()
    assert "field" in prompt.lower()
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
python -m pytest backend/tests/test_ai_provider.py::test_enriched_prompt_includes_field_values backend/tests/test_ai_provider.py::test_base_prompt_works_without_field_dict -v
```
Expected: `ImportError: cannot import name '_build_system_prompt'`

- [ ] **Step 3: Refactor `backend/ai_provider.py`**

Replace the module-level `_SYSTEM_PROMPT` constant and update `parse_filter` signature:

```python
import json

import httpx

from .crypto import decrypt

_BASE_SYSTEM_PROMPT = """\
You are a filter parser for a WiFi configuration assurance tool.
Convert natural language into a JSON filter array or the word null.

Each filter object has these keys:
  "field"     — one of the WLAN fields listed in the field reference below
  "condition" — one of: eq, ne, truthy, falsy, contains_item, not_contains_item
  "value"     — string, number, or boolean matching the field

Filters use OR logic: the standard applies if ANY filter matches.

Examples:
  "PSK WLANs only"          → [{{"field":"auth.type","condition":"eq","value":"psk"}}]
  "PSK and Enterprise"       → [{{"field":"auth.type","condition":"eq","value":"psk"}},{{"field":"auth.type","condition":"eq","value":"eap"}}]
  "open WLANs only"         → [{{"field":"auth.type","condition":"eq","value":"open"}}]
  "all WLANs" / "no filter" → null

Respond with ONLY a valid JSON array or the single word null. No explanation, no markdown fences."""


def _build_system_prompt(field_dict: dict | None) -> str:
    if not field_dict:
        return _BASE_SYSTEM_PROMPT
    wlan_fields = {k: v for k, v in field_dict.items() if v.get("scope") == "wlan"}
    lines = ["Field reference (WLAN fields only):"]
    for field, meta in sorted(wlan_fields.items()):
        values = meta.get("values", [])
        notes = meta.get("notes", "")
        val_str = ", ".join(f'"{v}"' for v in values) if values else ""
        line = f"  {field} ({meta.get('type', 'unknown')})"
        if val_str:
            line += f": {val_str}"
        if notes:
            line += f" — {notes}"
        lines.append(line)
    field_ref = "\n".join(lines)
    return f"{_BASE_SYSTEM_PROMPT}\n\n{field_ref}"
```

Also update `parse_filter` to accept `field_dict`:

```python
async def parse_filter(text: str, config: dict, org_id: str, field_dict: dict | None = None) -> list | None:
    """Call the configured LLM provider and return a filter array or None."""
    system_prompt = _build_system_prompt(field_dict)
    provider = config["provider"]
    model = config["model"]

    if provider == "anthropic":
        import anthropic
        try:
            client = anthropic.AsyncAnthropic(api_key=decrypt(config["api_key"]))
            msg = await client.messages.create(
                model=model,
                max_tokens=256,
                system=system_prompt,
                messages=[{"role": "user", "content": text}],
            )
        except anthropic.AuthenticationError:
            raise ValueError("Anthropic API key is invalid. Re-enter it in Settings → AI Provider.")
        except anthropic.PermissionDeniedError as exc:
            raise ValueError(f"Anthropic access denied: {exc.message}") from exc
        except anthropic.BadRequestError as exc:
            if "credit" in str(exc).lower() or "billing" in str(exc).lower():
                raise ValueError("Anthropic account has no credits. Add billing at console.anthropic.com.") from exc
            raise
        raw = msg.content[0].text

    elif provider == "openai":
        import openai
        try:
            client = openai.AsyncOpenAI(api_key=decrypt(config["api_key"]))
            resp = await client.chat.completions.create(
                model=model,
                max_tokens=256,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
            )
        except openai.AuthenticationError:
            raise ValueError("OpenAI API key is invalid. Re-enter it in Settings → AI Provider.")
        raw = resp.choices[0].message.content

    elif provider == "ollama":
        base_url = config.get("base_url") or "http://localhost:11434"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(f"{base_url}/api/chat", json={
                    "model": model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text},
                    ],
                })
                try:
                    r.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise ValueError(
                        f"Ollama returned {exc.response.status_code}. Is the model '{model}' pulled?"
                    ) from exc
                raw = r.json()["message"]["content"]
        except httpx.ConnectError:
            raise ValueError(f"Cannot reach Ollama at {base_url}. Is it running?")

    else:
        raise ValueError(f"Unknown provider: {provider}")

    return _parse_raw(raw.strip())
```

- [ ] **Step 4: Update parse-filter endpoint in `backend/main.py` to pass field_dict**

Find the `POST /api/ai/parse-filter` endpoint and update it:

```python
@app.post("/api/ai/parse-filter")
async def ai_parse_filter(req: ParseFilterRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(400, "No AI provider configured. Go to Settings → AI Provider.")
    from .field_dict import get_field_dict
    field_dict = get_field_dict()
    try:
        result = await parse_filter(req.text, row.data, org_id, field_dict=field_dict)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"filter": result}
```

- [ ] **Step 5: Run all AI provider tests**

```bash
python -m pytest backend/tests/test_ai_provider.py -v
```
Expected: all tests PASS (including the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add backend/ai_provider.py backend/main.py backend/tests/test_ai_provider.py
git commit -m "feat: enrich AI filter parser system prompt with field dictionary"
```

---

### Task 4: Frontend types + API client

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add `FieldEntry` type to `src/lib/types.ts`**

Append to the end of the file:

```typescript
export interface FieldEntry {
  scope: 'wlan' | 'site' | 'org'
  type: string
  values: string[]
  notes: string
}

export type FieldDict = Record<string, FieldEntry>
```

- [ ] **Step 2: Add `getFields()` to `src/lib/api.ts`**

Add to the `api` object (after `parseFilter`):

```typescript
  getFields: () => request<import('./types').FieldDict>('api/fields'),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/robert/mist-config-assurance
npx tsc --noEmit 2>&1 | head -20
```
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat: add FieldDict type and getFields API client method"
```

---

### Task 5: QuickAddForm field validation UI

**Files:**
- Modify: `src/components/standards/QuickAddForm.tsx`

This task:
1. Removes the hardcoded `WLAN_FIELDS` set
2. Loads the field dict from `GET /api/fields` on mount
3. Uses the dict for scope detection (`scope` property)
4. Shows field description under each derived standard name
5. Shows a yellow "unrecognized" badge for unknown fields

- [ ] **Step 1: Update imports and state at the top of `QuickAddForm.tsx`**

Replace the `WLAN_FIELDS` constant and add `fieldDict` state:

Remove this block (lines 7–23):
```typescript
const WLAN_FIELDS = new Set([
  'auth.type', 'auth.owe', 'auth.pairwise', 'auth.enable_beacon_protection',
  'auth.eap_reauth', 'auth.multi_psk_only', 'auth.anticlog_threshold',
  'auth.enable_gcmp256', 'auth.enable_mac_auth', 'auth.force_lookup',
  'roam_mode', 'arp_filter', 'limit_bcast', 'allow_mdns', 'allow_ssdp',
  'allow_ipv6_ndp', 'enable_wireless_bridging', 'isolation', 'l2_isolation',
  'no_static_ip', 'no_static_dns', 'block_blacklist_clients',
  'band_steer', 'band_steer_force_band5', 'bands',
  'disable_ht_vht_rates', 'disable_11ax', 'disable_11be',
  'rateset.24.template', 'rateset.5.template', 'rateset.6.template',
  'rateset.24.min_rssi', 'rateset.5.min_rssi',
  'wlan_limit_up_enabled', 'wlan_limit_up', 'wlan_limit_down_enabled', 'wlan_limit_down',
  'client_limit_up_enabled', 'client_limit_up', 'client_limit_down_enabled', 'client_limit_down',
  'hide_ssid', 'vlan_enabled', 'vlan_id', 'dynamic_vlan.enabled',
  'max_num_clients', 'max_idletime', 'disable_wmm', 'disable_uapsd',
  'qos.class', 'limit_probe_response',
])
```

Replace with:
```typescript
import type { AIConfig, FieldDict } from '@/lib/types'
```

(Remove the existing `import type { AIConfig } from '@/lib/types'` line and replace with the above.)

- [ ] **Step 2: Update `DerivedStandard` type to include `recognised` flag**

Change the `DerivedStandard` interface to add:
```typescript
interface DerivedStandard {
  field: string
  scope: 'wlan' | 'site' | 'org'
  recognised: boolean
  name: string
  check_condition: string
  check_value: unknown
  remediation_value: unknown
  filter: Filter | null
  filterText: string
  filterParsing: boolean
  filterError: string
}
```

- [ ] **Step 3: Update `deriveFromEntry` to accept fieldDict**

Replace the function signature and scope detection:

```typescript
function deriveFromEntry(field: string, value: unknown, fieldDict: FieldDict): DerivedStandard {
  const entry = fieldDict[field]
  const scope = (entry?.scope as 'wlan' | 'site' | 'org') ?? 'wlan'
  const recognised = !!entry
  const name = field
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  let check_condition: string
  let check_value: unknown

  if (value === true) {
    check_condition = 'truthy'; check_value = null
  } else if (value === false) {
    check_condition = 'falsy'; check_value = null
  } else if (Array.isArray(value)) {
    if (value.length === 1) {
      check_condition = 'contains_item'; check_value = value[0]
    } else {
      check_condition = 'eq'; check_value = value
    }
  } else {
    check_condition = 'eq'; check_value = value
  }

  return {
    field, scope, recognised, name, check_condition, check_value,
    remediation_value: value,
    filter: null, filterText: '', filterParsing: false, filterError: '',
  }
}
```

- [ ] **Step 4: Add `fieldDict` state and fetch in `QuickAddForm`**

Inside the `QuickAddForm` function, add state and effect (alongside existing `aiConfig` state):

```typescript
const [fieldDict, setFieldDict] = useState<FieldDict>({})

useEffect(() => {
  api.getFields().then(setFieldDict).catch(() => {})
}, [])
```

- [ ] **Step 5: Update `parseJson` to pass `fieldDict` to `deriveFromEntry`**

```typescript
setStandards(Object.entries(parsed).map(([k, v]) => deriveFromEntry(k, v, fieldDict)))
```

- [ ] **Step 6: Add field description + unrecognised badge to the rendered card**

In the JSX where the standard card is rendered, after the `<p className="text-xs text-on-surface/50">` line showing Check/Fix summary, add:

```tsx
{!s.recognised && (
  <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning">
    unrecognized field
  </span>
)}
{s.recognised && fieldDict[s.field]?.notes && (
  <span className="text-on-surface/40 text-xs mt-0.5 block">
    {fieldDict[s.field].notes}
  </span>
)}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 8: Manual smoke test**

Start the dev server:
```bash
npm run dev
```

1. Go to Standards → Quick Add
2. Paste `{"auth.type": "psk", "rogue.enabled": true, "unknown_field": true}`
3. Click Parse Config
4. Verify:
   - `auth.type` shows scope `wlan`, note "Primary auth method", no warning
   - `rogue.enabled` shows scope `site`, note "Rogue AP detection", no warning
   - `unknown_field` shows yellow "unrecognized field" badge, defaults to scope `wlan`

- [ ] **Step 9: Commit**

```bash
git add src/components/standards/QuickAddForm.tsx
git commit -m "feat: use field dictionary for scope detection and validation in QuickAddForm"
```
