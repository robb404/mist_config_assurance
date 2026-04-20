# Fast Roaming Filter Tests — Design Spec

## Overview

Add 7 targeted unit tests to `backend/tests/test_engine.py` proving that the Fast Roaming (802.11r) standard's `auth.type` filter correctly applies to PSK/EAP WLANs and skips all others. No production code changes unless a test exposes a real bug.

---

## Standard Under Test

The Fast Roaming standard created by the template library:

```python
{
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
}
```

---

## Tests

All tests added to `backend/tests/test_engine.py`. A module-level `FAST_ROAMING_STD` list constant is defined once and shared across all tests.

| Test name | WLAN `auth.type` | `roam_mode` | Expected status |
|-----------|-----------------|-------------|-----------------|
| `test_fast_roaming_psk_pass` | `psk` | `11r` | pass |
| `test_fast_roaming_psk_fail` | `psk` | `none` | fail |
| `test_fast_roaming_eap_pass` | `eap` | `11r` | pass |
| `test_fast_roaming_open_skip` | `open` | `none` | skip |
| `test_fast_roaming_owe_skip` | `open` + `auth.owe=required` | `none` | skip |
| `test_fast_roaming_no_auth_skip` | field absent | `11r` | skip |
| `test_fast_roaming_mixed_site` | PSK (fail) + EAP (pass) + open (skip) | mixed | 3 findings, correct each |

---

## Out of Scope

- No changes to production code (engine, models, API)
- No new test files
- No testing of other standards
