"""These validate the shipped, committed fields.json (the runtime source of
truth via get_field_dict). The original field-reference.md was scrubbed from
the repo for secret-scanning, so build_field_dict() is dev-only and not
exercised here. See BUG-003."""
from backend.field_dict import get_field_dict


def test_wlan_scope_assigned():
    d = get_field_dict()
    assert d["auth.type"]["scope"] == "wlan"


def test_site_scope_assigned():
    d = get_field_dict()
    assert d["rogue.enabled"]["scope"] == "site"


def test_values_parsed():
    d = get_field_dict()
    assert "psk" in d["auth.type"]["values"]
    assert "eap" in d["auth.type"]["values"]


def test_notes_present():
    d = get_field_dict()
    assert d["auth.type"]["notes"] != ""


def test_type_present():
    d = get_field_dict()
    assert d["auth.type"]["type"] == "string"


def test_get_field_dict_returns_dict():
    d = get_field_dict()
    assert isinstance(d, dict)
    assert len(d) > 10


def test_build_field_dict_fails_clearly_without_doc():
    """When the reference doc isn't bundled, build_field_dict raises a clear
    error (not a bare FileNotFoundError on a cryptic path)."""
    import pytest
    from backend.field_dict import build_field_dict, _FIELD_REF
    if _FIELD_REF.exists():
        pytest.skip("reference doc present in this checkout")
    with pytest.raises(FileNotFoundError, match="not bundled"):
        build_field_dict()
