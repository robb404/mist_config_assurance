import pytest
from unittest.mock import AsyncMock, patch
from backend.remediation import apply_remediation, _build_payload


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
