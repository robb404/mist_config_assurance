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
