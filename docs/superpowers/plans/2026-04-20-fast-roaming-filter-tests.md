# Fast Roaming Filter Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 unit tests to `backend/tests/test_engine.py` proving the Fast Roaming (802.11r) `auth.type` filter correctly passes/fails PSK and EAP WLANs and skips open, OWE, and auth-less WLANs.

**Architecture:** Tests-only change. A module-level `FAST_ROAMING_STD` constant mirrors the exact standard the template library creates. All 7 tests call `evaluate_site()` directly and assert the `status` field of the returned findings.

**Tech Stack:** Python, pytest

---

## File Map

| File | Change |
|------|--------|
| `backend/tests/test_engine.py` | Add `FAST_ROAMING_STD` constant + 7 test functions |

---

## Task 1: Add Fast Roaming filter tests

**Files:**
- Modify: `backend/tests/test_engine.py`

**Context:** `evaluate_site(site_id, site_name, wlans, site_setting, standards)` is imported at the top of the file. Each WLAN dict has `id`, `ssid`, and whatever fields the standard checks. The engine resolves `auth.type` via dot-path: `{"auth": {"type": "psk"}}` → `"psk"`. The filter uses OR logic — if either `psk` or `eap` matches, the standard applies; otherwise it skips.

- [ ] **Step 1: Add `FAST_ROAMING_STD` constant and all 7 tests to `backend/tests/test_engine.py`**

Append to the end of the file:

```python
# ---------------------------------------------------------------------------
# Fast Roaming (802.11r) filter tests
# ---------------------------------------------------------------------------

FAST_ROAMING_STD = [{
    "id": "fr1",
    "name": "Fast Roaming (802.11r)",
    "scope": "wlan",
    "enabled": True,
    "check_field": "roam_mode",
    "check_condition": "eq",
    "check_value": "11r",
    "filter": [
        {"field": "auth.type", "condition": "eq", "value": "psk"},
        {"field": "auth.type", "condition": "eq", "value": "eap"},
    ],
}]


def test_fast_roaming_psk_pass():
    wlan = {"id": "w1", "ssid": "Corp", "auth": {"type": "psk"}, "roam_mode": "11r"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "pass"


def test_fast_roaming_psk_fail():
    wlan = {"id": "w1", "ssid": "Corp", "auth": {"type": "psk"}, "roam_mode": "none"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "fail"


def test_fast_roaming_eap_pass():
    wlan = {"id": "w1", "ssid": "Dot1x", "auth": {"type": "eap"}, "roam_mode": "11r"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "pass"


def test_fast_roaming_open_skip():
    wlan = {"id": "w1", "ssid": "Guest", "auth": {"type": "open"}, "roam_mode": "none"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "skip"


def test_fast_roaming_owe_skip():
    # OWE WLANs in Mist have auth.type="open" with auth.owe="required"
    wlan = {"id": "w1", "ssid": "Guest-OWE", "auth": {"type": "open", "owe": "required"}, "roam_mode": "none"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "skip"


def test_fast_roaming_no_auth_skip():
    # WLAN with no auth field at all — _resolve returns None, filter doesn't match
    wlan = {"id": "w1", "ssid": "Legacy", "roam_mode": "11r"}
    findings = evaluate_site("s", "S", [wlan], {}, FAST_ROAMING_STD)
    assert findings[0]["status"] == "skip"


def test_fast_roaming_mixed_site():
    wlans = [
        {"id": "w1", "ssid": "Corp",   "auth": {"type": "psk"}, "roam_mode": "none"},
        {"id": "w2", "ssid": "Dot1x",  "auth": {"type": "eap"}, "roam_mode": "11r"},
        {"id": "w3", "ssid": "Guest",  "auth": {"type": "open"}, "roam_mode": "none"},
    ]
    findings = evaluate_site("s", "S", wlans, {}, FAST_ROAMING_STD)
    by_wlan = {f["wlan_id"]: f["status"] for f in findings}
    assert by_wlan["w1"] == "fail"
    assert by_wlan["w2"] == "pass"
    assert by_wlan["w3"] == "skip"
```

- [ ] **Step 2: Run the new tests**

```bash
cd /home/robert/mist-config-assurance
python -m pytest backend/tests/test_engine.py -v -k "fast_roaming"
```

Expected: **7 PASSED**

If any test fails, the engine has a real bug — read the failure output carefully before fixing anything. The tests should pass as-is since the engine logic is correct.

- [ ] **Step 3: Run the full backend suite**

```bash
python -m pytest backend/tests/ -v
```

Expected: all existing tests still pass (35 + 7 new = 42 passed, 1 pre-existing failure in test_auth.py)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_engine.py
git commit -m "test: verify fast roaming filter skips open/OWE, applies to PSK/EAP"
```
