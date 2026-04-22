import math
import logging
from datetime import datetime, timezone

log = logging.getLogger("mist_ca")

CALL_BUDGET_TOTAL  = 5_000
REMEDIATION_RESERVE = 1_000
CHECK_BUDGET        = CALL_BUDGET_TOTAL - REMEDIATION_RESERVE  # 4,000
CALLS_PER_SITE      = 3
LARGE_ORG_THRESHOLD = 1_500  # sites; above this, recommend webhook mode


def min_interval_mins(site_count: int) -> int:
    """Minimum safe polling interval in minutes for a given monitored site count."""
    if site_count == 0:
        return 1
    return math.ceil(site_count * CALLS_PER_SITE / CHECK_BUDGET * 60)


def can_check(calls_used: int) -> bool:
    """True if a new site check (CALLS_PER_SITE calls) fits within the check budget."""
    return calls_used + CALLS_PER_SITE <= CHECK_BUDGET


def budget_summary(site_count: int, interval_mins: int) -> dict:
    """
    Return call rate stats and advisories for a given org configuration.
    Used by GET /api/org/usage and to populate the UI.
    """
    min_interval = min_interval_mins(site_count)
    recommend_webhooks = site_count >= LARGE_ORG_THRESHOLD

    if interval_mins == 0:
        return {
            "calls_per_hour": 0,
            "min_interval_mins": min_interval,
            "interval_safe": True,
            "recommend_webhooks": recommend_webhooks,
        }

    cycles_per_hour = 60 / interval_mins
    calls_per_hour = round(site_count * CALLS_PER_SITE * cycles_per_hour)
    return {
        "calls_per_hour": calls_per_hour,
        "min_interval_mins": min_interval,
        "interval_safe": calls_per_hour <= CHECK_BUDGET,
        "recommend_webhooks": recommend_webhooks,
    }


def _reset_window_if_needed(org_data: dict) -> tuple[int, str]:
    """
    Return (calls_used, window_start_iso).
    Resets calls_used to 0 if the current hour window has expired.
    """
    now = datetime.now(timezone.utc)
    window_start_iso = org_data.get("calls_window_start")
    calls_used = org_data.get("calls_used_this_hour", 0) or 0

    if window_start_iso:
        window_start = datetime.fromisoformat(window_start_iso)
        if (now - window_start).total_seconds() >= 3600:
            calls_used = 0
            window_start_iso = now.isoformat()
    else:
        window_start_iso = now.isoformat()

    return calls_used, window_start_iso


def increment_calls(org_id: str, n: int = CALLS_PER_SITE) -> int:
    """
    Atomically increment the hourly call counter for an org by n.

    Uses the `increment_calls_atomic` Postgres function from migration 009
    which takes a row lock, resets the window if expired, applies the
    increment, and returns the new count — all in one round-trip.

    Falls back to a read-modify-write path if the RPC isn't available
    (migration 009 not applied yet). Returns the new call count.
    """
    from .db import get_client
    db = get_client()

    try:
        resp = db.rpc("increment_calls_atomic", {"p_org_id": org_id, "p_n": n}).execute()
        val = resp.data
        if val is not None:
            new_count = int(val[0]) if isinstance(val, list) and val else int(val)
            log.debug("call counter (atomic) org=%s used=%d", org_id, new_count)
            return new_count
    except Exception as exc:  # pragma: no cover — migration not yet applied
        log.warning("atomic increment RPC unavailable (%s) — falling back", exc)

    # Legacy read-modify-write fallback — not atomic under concurrent load.
    row = db.table("org_config").select("calls_used_this_hour,calls_window_start") \
        .eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        return 0
    calls_used, window_start_iso = _reset_window_if_needed(row.data)
    new_count = calls_used + n
    db.table("org_config").update({
        "calls_used_this_hour": new_count,
        "calls_window_start": window_start_iso,
    }).eq("org_id", org_id).execute()
    log.debug("call counter (fallback) org=%s used=%d", org_id, new_count)
    return new_count
