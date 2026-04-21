import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from apscheduler.triggers.cron import CronTrigger

from .db import get_client
from .resend_client import send_email
from . import scheduler as sched

log = logging.getLogger("mist_ca")

CLERK_API = "https://api.clerk.com/v1"


# ---------------------------------------------------------------------------
# Pure helpers (tested directly)
# ---------------------------------------------------------------------------

def _window_start(last_sent_at: datetime | None, frequency: str, now: datetime) -> datetime:
    """Return the start of the digest window. Falls back to now-24h (daily) or now-7d (weekly)."""
    if last_sent_at is not None:
        return last_sent_at
    delta = timedelta(hours=24) if frequency == "daily" else timedelta(days=7)
    return now - delta


def _build_subject(frequency: str, now: datetime) -> str:
    date_s = now.strftime("%Y-%m-%d")
    return f"Mist Config Assurance \u2014 {frequency} digest ({date_s})"


def _format_body(frequency: str, new_incidents: int, remediation_success: int,
                 remediation_failed: int, app_url: str) -> str:
    window_label = "the last 24 hours" if frequency == "daily" else "the last 7 days"
    link = f"{app_url.rstrip('/')}/activity" if app_url else "(APP_URL not configured)"
    return (
        f"In {window_label}:\n\n"
        f"  \u2022 {new_incidents} new incidents\n"
        f"  \u2022 {remediation_success} auto-remediations succeeded\n"
        f"  \u2022 {remediation_failed} auto-remediations failed\n\n"
        f"View details: {link}\n"
    )


# ---------------------------------------------------------------------------
# Scheduler API
# ---------------------------------------------------------------------------

def register_digest_job(org_id: str, frequency: str | None) -> None:
    """
    Register or replace the digest job for an org.
    frequency='daily'  -> CronTrigger(hour=8, minute=0) UTC
    frequency='weekly' -> CronTrigger(day_of_week='mon', hour=8, minute=0) UTC
    frequency=None     -> remove existing job
    """
    job_id = f"digest_{org_id}"

    if sched.scheduler.get_job(job_id):
        sched.scheduler.remove_job(job_id)

    if frequency == "daily":
        trigger = CronTrigger(hour=8, minute=0)
    elif frequency == "weekly":
        trigger = CronTrigger(day_of_week="mon", hour=8, minute=0)
    else:
        log.info("Digest disabled for org=%s", org_id)
        return

    sched.scheduler.add_job(
        send_digest,
        trigger=trigger,
        id=job_id,
        kwargs={"org_id": org_id, "trigger_source": "scheduled"},
        replace_existing=True,
        misfire_grace_time=600,
        max_instances=1,
    )
    log.info("Digest %s job registered for org=%s", frequency, org_id)


# ---------------------------------------------------------------------------
# Clerk email lookup
# ---------------------------------------------------------------------------

async def _fetch_clerk_email(user_id: str) -> str | None:
    """Fetch the primary email for a Clerk user. Returns None on any failure."""
    secret = os.environ.get("CLERK_SECRET_KEY")
    if not secret:
        log.warning("CLERK_SECRET_KEY not set — cannot look up digest recipient email")
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{CLERK_API}/users/{user_id}",
                headers={"Authorization": f"Bearer {secret}"},
                timeout=10.0,
            )
    except Exception as exc:
        log.warning("Clerk user lookup failed for user=%s: %s", user_id, exc)
        return None

    if not resp.is_success:
        log.warning("Clerk user lookup returned %d for user=%s", resp.status_code, user_id)
        return None

    data = resp.json()
    primary_id = data.get("primary_email_address_id")
    for addr in data.get("email_addresses", []):
        if addr.get("id") == primary_id:
            return addr.get("email_address")
    return None


# ---------------------------------------------------------------------------
# Main entry: send_digest
# ---------------------------------------------------------------------------

async def send_digest(org_id: str, trigger_source: str) -> dict:
    """
    Compute counts, call Resend, persist last_sent_at / last_error.
    trigger_source: 'scheduled' | 'manual'
    Returns {"ok": bool, "skipped": bool, "error": str | None}
    """
    db = get_client()
    row = db.table("org_config").select(
        "org_id,digest_frequency,digest_last_sent_at,digest_extra_recipients,owner_user_id"
    ).eq("org_id", org_id).maybe_single().execute()

    if not row.data:
        return {"ok": False, "skipped": False, "error": "org not found"}

    org = row.data
    frequency = org.get("digest_frequency")
    if frequency not in ("daily", "weekly"):
        return {"ok": False, "skipped": False, "error": "digest not enabled"}

    now = datetime.now(timezone.utc)
    last_sent_raw = org.get("digest_last_sent_at")
    last_sent_at = datetime.fromisoformat(last_sent_raw) if last_sent_raw else None
    window_start_at = _window_start(last_sent_at, frequency, now)

    # Count events in the window
    incidents = db.table("incident").select("id", count="exact") \
        .eq("org_id", org_id).gt("opened_at", window_start_at.isoformat()).execute()
    new_incidents = incidents.count or 0

    remediations = db.table("remediation_action").select("status") \
        .eq("org_id", org_id).gt("attempted_at", window_start_at.isoformat()).execute()
    rem_rows = remediations.data or []
    remediation_success = sum(1 for r in rem_rows if r.get("status") == "success")
    remediation_failed  = sum(1 for r in rem_rows if r.get("status") == "failed")

    total = new_incidents + remediation_success + remediation_failed
    if total == 0:
        db.table("org_config").update({
            "digest_last_sent_at": now.isoformat(),
            "digest_last_error": None,
        }).eq("org_id", org_id).execute()
        log.info("digest skipped (empty window) org=%s trigger=%s", org_id, trigger_source)
        return {"ok": True, "skipped": True, "error": None}

    # Build recipient list
    recipients: list[str] = []
    owner_user_id = org.get("owner_user_id")
    if owner_user_id:
        owner_email = await _fetch_clerk_email(owner_user_id)
        if owner_email:
            recipients.append(owner_email)
    for r in (org.get("digest_extra_recipients") or []):
        if r and r not in recipients:
            recipients.append(r)

    # Dedupe case-insensitively
    seen: set[str] = set()
    deduped: list[str] = []
    for r in recipients:
        key = r.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    recipients = deduped

    if not recipients:
        db.table("org_config").update({"digest_last_error": "no recipients configured"}) \
            .eq("org_id", org_id).execute()
        log.warning("digest has no recipients org=%s", org_id)
        return {"ok": False, "skipped": False, "error": "no recipients configured"}

    # Build and send
    subject = _build_subject(frequency, now)
    body = _format_body(
        frequency=frequency,
        new_incidents=new_incidents,
        remediation_success=remediation_success,
        remediation_failed=remediation_failed,
        app_url=os.environ.get("APP_URL", ""),
    )

    ok, err = await send_email(recipients, subject, body)

    if ok:
        db.table("org_config").update({
            "digest_last_sent_at": now.isoformat(),
            "digest_last_error": None,
        }).eq("org_id", org_id).execute()
        log.info("digest sent org=%s recipients=%d trigger=%s", org_id, len(recipients), trigger_source)
        return {"ok": True, "skipped": False, "error": None}

    db.table("org_config").update({"digest_last_error": err}) \
        .eq("org_id", org_id).execute()
    log.error("digest send failed org=%s error=%s", org_id, err)
    return {"ok": False, "skipped": False, "error": err}
