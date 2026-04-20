import logging

from . import mist_client as mist

log = logging.getLogger("mist_ca")


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
    mist_org_id: str | None = None,
) -> dict:
    """
    PATCH/PUT Mist API with the desired remediation value.
    For WLANs, tries site-level first; falls back to org-level on 404.
    Returns {"success": bool, "error": str | None}
    """
    field   = standard["remediation_field"]
    value   = standard["remediation_value"]
    scope   = standard["scope"]
    payload = _build_payload(field, value)

    try:
        org_level = False
        if scope == "wlan" and wlan_id:
            ok, status = await mist.patch_wlan(token, base_url, site_id, wlan_id, payload)
            log.info("patch_wlan site=%s wlan=%s status=%s ok=%s", site_id, wlan_id, status, ok)
            if not ok and mist_org_id:
                log.info("falling back to org-level patch org=%s wlan=%s", mist_org_id, wlan_id)
                ok = await mist.patch_org_wlan(token, base_url, mist_org_id, wlan_id, payload)
                org_level = ok
                log.info("patch_org_wlan ok=%s", ok)
            elif not ok and not mist_org_id:
                log.warning("site patch failed (status=%s) but mist_org_id not set — cannot fall back", status)
        elif scope == "site":
            ok = await mist.patch_site_setting(token, base_url, site_id, payload)
        else:
            return {"success": False, "error": "Unknown scope or missing wlan_id"}
        return {"success": ok, "org_level": org_level, "error": None if ok else "Mist API returned error"}
    except Exception as exc:
        log.exception("remediation failed: %s", exc)
        return {"success": False, "org_level": False, "error": str(exc)}
