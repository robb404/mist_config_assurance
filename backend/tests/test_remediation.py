import pytest
from unittest.mock import AsyncMock, patch
from backend.remediation import apply_remediation, _build_payload, _resolve, _fetch_current_list


def test_build_payload_simple():
    assert _build_payload("vlan_enabled", True) == {"vlan_enabled": True}


def test_build_payload_nested():
    result = _build_payload("auth.pairwise", ["wpa3"])
    assert result == {"auth": {"pairwise": ["wpa3"]}}


@pytest.mark.asyncio
async def test_apply_wlan_remediation_success():
    std = {"scope": "wlan", "remediation_field": "vlan_enabled", "remediation_value": True}
    with patch("backend.remediation.mist.patch_wlan", new_callable=AsyncMock, return_value=(True, 200)):
        result = await apply_remediation("site1", "wlan1", std, "tok", "https://api/v1/")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_apply_site_remediation_success():
    std = {"scope": "site", "remediation_field": "persist_config_on_device", "remediation_value": True}
    with patch("backend.remediation.mist.patch_site_setting", new_callable=AsyncMock, return_value=True):
        result = await apply_remediation("site1", None, std, "tok", "https://api/v1/")
    assert result["success"] is True


@pytest.mark.asyncio
async def test_apply_remediation_mist_error():
    std = {"scope": "wlan", "remediation_field": "vlan_enabled", "remediation_value": True}
    with patch("backend.remediation.mist.patch_wlan", new_callable=AsyncMock, return_value=(False, 500)):
        result = await apply_remediation("site1", "wlan1", std, "tok", "https://api/v1/")
    assert result["success"] is False


@pytest.mark.asyncio
async def test_apply_wlan_remediation_forsite_none_fallback():
    """When for_site is None, tries site first then org on failure."""
    std = {"scope": "wlan", "remediation_field": "vlan_enabled", "remediation_value": True}
    with patch("backend.remediation.mist.patch_wlan", new_callable=AsyncMock, return_value=(False, 404)), \
         patch("backend.remediation.mist.patch_org_wlan", new_callable=AsyncMock, return_value=True):
        result = await apply_remediation("site1", "wlan1", std, "tok", "https://api/v1/", mist_org_id="org1")
    assert result["success"] is True
    assert result["org_level"] is True


# ---------------------------------------------------------------------------
# contains_item / list-append remediation
# ---------------------------------------------------------------------------

def test_resolve_nested():
    assert _resolve({"bands": ["24", "5"]}, "bands") == ["24", "5"]
    assert _resolve({"a": {"b": "v"}}, "a.b") == "v"
    assert _resolve({}, "missing") is None


@pytest.mark.asyncio
async def test_fetch_current_list_wlan():
    derived = {"id": "w1", "bands": ["24", "5"]}
    with patch("backend.remediation.mist.get_wlan_derived", new_callable=AsyncMock, return_value=derived):
        result = await _fetch_current_list("bands", "wlan", "w1", "site1", "tok", "https://api/v1/")
    assert result == ["24", "5"]


@pytest.mark.asyncio
async def test_fetch_current_list_missing_field():
    derived = {"id": "w1"}
    with patch("backend.remediation.mist.get_wlan_derived", new_callable=AsyncMock, return_value=derived):
        result = await _fetch_current_list("bands", "wlan", "w1", "site1", "tok", "https://api/v1/")
    assert result == []


@pytest.mark.asyncio
async def test_contains_item_appends_missing_band():
    """Remediating a contains_item standard appends the value to the existing list."""
    std = {
        "scope": "wlan",
        "check_condition": "contains_item",
        "remediation_field": "bands",
        "remediation_value": "6",
    }
    derived = {"id": "w1", "bands": ["24", "5"]}
    patch_wlan = AsyncMock(return_value=(True, 200))
    with patch("backend.remediation.mist.get_wlan_derived", new_callable=AsyncMock, return_value=derived), \
         patch("backend.remediation.mist.patch_wlan", patch_wlan):
        result = await apply_remediation("site1", "w1", std, "tok", "https://api/v1/", for_site=True)
    assert result["success"] is True
    called_payload = patch_wlan.call_args[0][4]
    assert called_payload == {"bands": ["24", "5", "6"]}


@pytest.mark.asyncio
async def test_contains_item_idempotent_if_already_present():
    """If the value is already in the list, the list is unchanged."""
    std = {
        "scope": "wlan",
        "check_condition": "contains_item",
        "remediation_field": "bands",
        "remediation_value": "5",
    }
    derived = {"id": "w1", "bands": ["24", "5"]}
    patch_wlan = AsyncMock(return_value=(True, 200))
    with patch("backend.remediation.mist.get_wlan_derived", new_callable=AsyncMock, return_value=derived), \
         patch("backend.remediation.mist.patch_wlan", patch_wlan):
        result = await apply_remediation("site1", "w1", std, "tok", "https://api/v1/", for_site=True)
    assert result["success"] is True
    called_payload = patch_wlan.call_args[0][4]
    assert called_payload == {"bands": ["24", "5"]}
