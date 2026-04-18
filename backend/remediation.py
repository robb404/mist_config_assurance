from . import mist_client as mist


def _build_payload(field: str, value) -> dict:
    """Build a nested dict payload from a dotted field path."""
    parts = field.split(".")
    result: dict = {}
    cur = result
    for part in parts[:-1]:
        cur[part] = {}
        cur = cur[part]
    cur[parts[-1]] = value
    return result


async def apply_remediation(
    site_id: str,
    wlan_id: str | None,
    standard: dict,
    token: str,
    base_url: str,
) -> dict:
    """
    PATCH/PUT Mist API with the desired remediation value.
    Returns {"success": bool, "error": str | None}
    """
    field   = standard["remediation_field"]
    value   = standard["remediation_value"]
    scope   = standard["scope"]
    payload = _build_payload(field, value)

    try:
        if scope == "wlan" and wlan_id:
            ok = await mist.patch_wlan(token, base_url, site_id, wlan_id, payload)
        elif scope == "site":
            ok = await mist.patch_site_setting(token, base_url, site_id, payload)
        else:
            return {"success": False, "error": "Unknown scope or missing wlan_id"}
        return {"success": ok, "error": None if ok else "Mist API returned error"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
