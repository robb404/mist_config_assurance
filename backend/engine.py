from typing import Any


def _resolve(obj: dict, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _eval_condition(value: Any, condition: str, spec: dict) -> bool | None:
    if condition == "falsy":
        return not bool(value)
    if value is None:
        return None
    expected = spec.get("value") if "value" in spec else spec.get("values")
    if condition == "truthy":     return bool(value)
    if condition == "eq":         return value == expected
    if condition == "ne":         return value != expected
    if condition == "in":         return value in (expected or [])
    if condition == "not_in":     return value not in (expected or [])
    if condition == "contains":   return str(expected or "").lower() in str(value).lower()
    if condition == "not_contains": return str(expected or "").lower() not in str(value).lower()
    if condition == "contains_item":
        return expected in value if isinstance(value, list) else None
    if condition == "not_contains_item":
        return expected not in value if isinstance(value, list) else None
    if condition == "gte":
        try: return float(value) >= float(expected)
        except (TypeError, ValueError): return None
    if condition == "lte":
        try: return float(value) <= float(expected)
        except (TypeError, ValueError): return None
    return None


def _eval_triggers(triggers: list[dict], target: dict) -> bool:
    for t in triggers:
        val = _resolve(target, t["field"])
        if _eval_condition(val, t["condition"], t) is True:
            return True
    return False


def _standard_to_check(standard: dict) -> dict:
    """Convert a DB standard row into the check spec the engine needs."""
    check: dict = {
        "field": standard["check_field"],
        "condition": standard["check_condition"],
    }
    cv = standard.get("check_value")
    if cv is not None:
        if isinstance(cv, list):
            check["values"] = cv
        else:
            check["value"] = cv
    if standard.get("filter"):
        check["if"] = standard["filter"]
    return check


def evaluate_site(
    site_id: str,
    site_name: str,
    wlans: list[dict],
    site_setting: dict,
    standards: list[dict],
) -> list[dict]:
    """
    Evaluate enabled standards against site state.
    Returns a list of finding dicts with keys:
      standard_id, wlan_id, ssid, status, actual_value
    """
    findings: list[dict] = []

    for std in standards:
        if not std.get("enabled", True):
            continue

        scope = std["scope"]
        if scope == "wlan":
            targets = wlans
        elif scope == "site":
            targets = [site_setting] if site_setting else []
        else:
            continue

        if not targets:
            findings.append({
                "standard_id": std["id"], "wlan_id": None,
                "ssid": None, "status": "skip", "actual_value": None,
            })
            continue

        check = _standard_to_check(std)

        for target in targets:
            wlan_id = target.get("id") if scope == "wlan" else None
            ssid    = target.get("ssid") if scope == "wlan" else None

            if "if" in check:
                if not _eval_triggers(check["if"], target):
                    findings.append({
                        "standard_id": std["id"], "wlan_id": wlan_id,
                        "ssid": ssid, "status": "skip", "actual_value": None,
                    })
                    continue

            field = check["field"]
            val   = _resolve(target, field)
            result = _eval_condition(val, check["condition"], check)

            if result is None:
                status, actual = "skip", None
            elif result:
                status, actual = "pass", f"{field}={val}"
            else:
                status, actual = "fail", f"{field}={val}"

            findings.append({
                "standard_id": std["id"], "wlan_id": wlan_id,
                "ssid": ssid, "status": status, "actual_value": actual,
            })

    return findings
