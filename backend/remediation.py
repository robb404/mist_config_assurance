import logging

from . import mist_client as mist

log = logging.getLogger("mist_ca")

# Fields that live on the Mist site entity (PUT orgs/:id/sites/:id),
# not in site settings (PUT sites/:id/setting).
_SITE_ENTITY_FIELDS = {
    "rftemplate_id", "aptemplate_id", "networktemplate_id",
    "gatewaytemplate_id", "secpolicy_id", "alarmtemplate_id",
}


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


def _resolve(obj: dict, path: str):
    """Traverse a dotted path in a nested dict, returning None if any part is missing."""
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


async def _fetch_current_list(
    field: str,
    scope: str,
    wlan_id: str | None,
    site_id: str,
    token: str,
    base_url: str,
) -> list:
    """Return the current value of a list field from Mist, or [] on any failure."""
    if scope == "wlan" and wlan_id:
        current = await mist.get_wlan_derived(token, base_url, site_id, wlan_id)
    elif scope == "site":
        current = await mist.get_site_setting(token, base_url, site_id)
    else:
        return []
    if not current:
        return []
    existing = _resolve(current, field)
    return list(existing) if isinstance(existing, list) else []


async def apply_remediation(
    site_id: str,
    wlan_id: str | None,
    standard: dict,
    token: str,
    base_url: str,
    mist_org_id: str | None = None,
    for_site: bool | None = None,
) -> dict:
    """
    PATCH/PUT Mist API with the desired remediation value.

    Routing logic:
      scope="wlan"  + for_site=True  → PUT sites/:site_id/wlans/:wlan_id
      scope="wlan"  + for_site=False → PUT orgs/:org_id/wlans/:wlan_id
      scope="site"                   → PUT sites/:site_id/setting
      scope="org"                    → PUT orgs/:org_id/setting
    """
    field   = standard["remediation_field"]
    value   = standard["remediation_value"]
    scope   = standard["scope"]

    if standard.get("check_condition") == "contains_item":
        current = await _fetch_current_list(field, scope, wlan_id, site_id, token, base_url)
        if value not in current:
            current.append(value)
        payload = _build_payload(field, current)
    else:
        payload = _build_payload(field, value)

    try:
        if scope == "wlan":
            if not wlan_id:
                return {"success": False, "org_level": False, "error": "wlan_id required for wlan scope"}

            if for_site is True:
                ok = (await mist.patch_wlan(token, base_url, site_id, wlan_id, payload))[0]
                org_level = False
                log.info("patch site wlan site=%s wlan=%s ok=%s", site_id, wlan_id, ok)
            elif for_site is False:
                if not mist_org_id:
                    return {"success": False, "org_level": False, "error": "mist_org_id required for org-level wlan"}
                ok = await mist.patch_org_wlan(token, base_url, mist_org_id, wlan_id, payload)
                org_level = ok
                log.info("patch org wlan org=%s wlan=%s ok=%s", mist_org_id, wlan_id, ok)
            else:
                # for_site unknown — fall back to site first, then org
                ok, status = await mist.patch_wlan(token, base_url, site_id, wlan_id, payload)
                log.info("patch_wlan (unknown level) site=%s wlan=%s status=%s ok=%s", site_id, wlan_id, status, ok)
                org_level = False
                if not ok and mist_org_id:
                    ok = await mist.patch_org_wlan(token, base_url, mist_org_id, wlan_id, payload)
                    org_level = ok
                    log.info("fallback patch_org_wlan ok=%s", ok)

        elif scope == "site":
            # Some fields live on the site entity (orgs/:id/sites/:id), not site settings.
            if field.split(".")[0] in _SITE_ENTITY_FIELDS:
                ok = await mist.patch_site(token, base_url, site_id, payload)
                log.info("patch site entity site=%s field=%s ok=%s", site_id, field, ok)
            else:
                ok = await mist.patch_site_setting(token, base_url, site_id, payload)
                log.info("patch site setting site=%s field=%s ok=%s", site_id, field, ok)
            org_level = False

        elif scope == "org":
            if not mist_org_id:
                return {"success": False, "org_level": True, "error": "mist_org_id required for org scope"}
            ok = await mist.patch_org_setting(token, base_url, mist_org_id, payload)
            org_level = True
            log.info("patch org setting org=%s ok=%s", mist_org_id, ok)

        else:
            return {"success": False, "org_level": False, "error": f"Unknown scope: {scope!r}"}

        return {"success": ok, "org_level": org_level, "error": None if ok else "Mist API returned error"}

    except Exception as exc:
        log.exception("remediation failed: %s", exc)
        return {"success": False, "org_level": False, "error": str(exc)}
