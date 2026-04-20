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
