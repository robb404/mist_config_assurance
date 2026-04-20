from backend.engine import evaluate_site


def _std(cond, val=None, filt=None):
    return [{
        "id": "s1", "name": "Test", "scope": "wlan", "enabled": True,
        "check_field": "vlan_enabled", "check_condition": cond,
        "check_value": val, "filter": filt,
    }]


def test_truthy_pass():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": True}], {}, _std("truthy"))
    assert findings[0]["status"] == "pass"


def test_truthy_fail():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": False}], {}, _std("truthy"))
    assert findings[0]["status"] == "fail"


def test_falsy_missing_field_passes():
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net"}], {}, _std("falsy"))
    assert findings[0]["status"] == "pass"


def test_contains_item_pass():
    stds = [{"id": "s1", "name": "Bands", "scope": "wlan", "enabled": True,
              "check_field": "bands", "check_condition": "contains_item",
              "check_value": "5", "filter": None}]
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "bands": ["2", "5", "6"]}], {}, stds)
    assert findings[0]["status"] == "pass"


def test_filter_skips_non_matching():
    stds = [{"id": "s1", "name": "Isolation", "scope": "wlan", "enabled": True,
              "check_field": "isolation", "check_condition": "truthy",
              "check_value": None,
              "filter": [{"field": "auth.type", "condition": "eq", "value": "open"}]}]
    wlans = [{"id": "w1", "ssid": "Corp", "auth": {"type": "eap"}, "isolation": False}]
    findings = evaluate_site("s", "S", wlans, {}, stds)
    assert findings[0]["status"] == "skip"


def test_site_scope():
    stds = [{"id": "s1", "name": "Persist", "scope": "site", "enabled": True,
              "check_field": "persist_config_on_device", "check_condition": "truthy",
              "check_value": None, "filter": None}]
    findings = evaluate_site("s", "S", [], {"persist_config_on_device": True}, stds)
    assert findings[0]["status"] == "pass"


def test_disabled_standard_skipped():
    stds = [{"id": "s1", "name": "X", "scope": "wlan", "enabled": False,
              "check_field": "vlan_enabled", "check_condition": "truthy",
              "check_value": None, "filter": None}]
    findings = evaluate_site("s", "S", [{"id": "w1", "ssid": "Net", "vlan_enabled": False}], {}, stds)
    assert findings == []


def test_no_wlans_returns_skip_for_wlan_scope():
    findings = evaluate_site("s", "S", [], {}, _std("truthy"))
    assert findings[0]["status"] == "skip"


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
        {"id": "w1", "ssid": "Corp",  "auth": {"type": "psk"}, "roam_mode": "none"},
        {"id": "w2", "ssid": "Dot1x", "auth": {"type": "eap"}, "roam_mode": "11r"},
        {"id": "w3", "ssid": "Guest", "auth": {"type": "open"}, "roam_mode": "none"},
    ]
    findings = evaluate_site("s", "S", wlans, {}, FAST_ROAMING_STD)
    by_wlan = {f["wlan_id"]: f["status"] for f in findings}
    assert by_wlan["w1"] == "fail"
    assert by_wlan["w2"] == "pass"
    assert by_wlan["w3"] == "skip"
