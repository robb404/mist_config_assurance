import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

from . import mist_client as mist
from . import scheduler as sched
from .ai_provider import parse_filter as _ai_parse_filter
from .auth import get_org_id, get_user_id
from .crypto import decrypt, encrypt
from .db import get_client
from .engine import evaluate_site
from .field_dict import get_field_dict, save_field_dict
from .models import (
    AIConfigSave, ConnectRequest, DigestSettingsRequest, OrgSettingsRequest,
    ParseFilterRequest, RunRequest, StandardCreate, StandardUpdate,
)
from .remediation import apply_remediation
from . import debug_logs
from . import remediation
from . import digest
from .rate_limiter import (
    budget_summary, can_check, increment_calls, min_interval_mins, _reset_window_if_needed,
)

log = logging.getLogger("mist_ca")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
debug_logs.install()


@asynccontextmanager
async def lifespan(app: FastAPI):
    sched.start()
    db = get_client()
    orgs = db.table("org_config").select("org_id,drift_interval_mins,mode,digest_frequency").execute()
    for org in (orgs.data or []):
        sched.upsert_org_job(
            org["org_id"],
            org["drift_interval_mins"],
            run_drift_for_org,
            mode=org.get("mode", "polling"),
        )
        digest.register_digest_job(org["org_id"], org.get("digest_frequency"))
    yield
    sched.stop()


app = FastAPI(title="Mist Config Assurance", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Org / connection
# ---------------------------------------------------------------------------

@app.post("/api/org/connect")
async def connect(
    req: ConnectRequest,
    org_id: str = Depends(get_org_id),
    user_id: str = Depends(get_user_id),
):
    base_url = mist.build_base_url(req.cloud_endpoint)
    try:
        info = await mist.get_org_info(req.mist_token, base_url, req.mist_org_id)
    except ValueError as exc:
        raise HTTPException(401, str(exc))
    except httpx.TimeoutException:
        raise HTTPException(504, f"Timed out connecting to {req.cloud_endpoint}. Check the endpoint and network.")
    except Exception as exc:
        raise HTTPException(502, f"Could not reach Mist: {exc}")

    db = get_client()
    db.table("org_config").upsert({
        "org_id": org_id,
        "mist_token": encrypt(req.mist_token),
        "cloud_endpoint": req.cloud_endpoint,
        "org_name": info["org_name"],
        "mist_org_id": info["org_id"],
        "owner_user_id": user_id,
    }).execute()

    # Auto-sync sites so the Dashboard is populated immediately after connect.
    # Soft-fail: a sync error shouldn't block the successful connection.
    synced = 0
    try:
        sites = await mist.get_sites(req.mist_token, base_url, info["org_id"])
        for s in sites:
            db.table("site").upsert(
                {"id": s["id"], "org_id": org_id, "name": s["name"]},
                on_conflict="id,org_id",
            ).execute()
        synced = len(sites)
        increment_calls(org_id, n=2)  # get_org_info + get_sites
        log.info("auto-sync on connect: org=%s synced=%d sites", org_id, synced)
    except Exception as exc:
        log.warning("auto-sync on connect failed for org=%s: %s", org_id, exc)

    return {
        "org_name": info["org_name"],
        "mist_org_id": info["org_id"],
        "sites_synced": synced,
    }


@app.get("/api/org")
async def get_org(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured. POST /api/org/connect first.")
    data = dict(row.data)
    data.pop("mist_token", None)
    return data


@app.patch("/api/org/settings")
async def update_settings(req: OrgSettingsRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("org_config").update({
        "drift_interval_mins": req.drift_interval_mins,
        "auto_remediate": req.auto_remediate,
        "mode": req.mode,
    }).eq("org_id", org_id).execute()
    sched.upsert_org_job(org_id, req.drift_interval_mins, run_drift_for_org, mode=req.mode)
    return {"ok": True}


@app.get("/api/org/usage")
async def get_org_usage(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "mode,calls_used_this_hour,calls_window_start,drift_interval_mins,webhook_secret"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")

    site_count = (
        db.table("site").select("id", count="exact")
        .eq("org_id", org_id).eq("monitored", True).execute().count or 0
    )

    data = row.data
    summary = budget_summary(site_count, data.get("drift_interval_mins", 0))
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    webhook_url = f"{app_url}/api/webhooks/mist/{org_id}" if app_url else None

    return {
        "mode": data.get("mode", "polling"),
        "calls_used_this_hour": data.get("calls_used_this_hour", 0) or 0,
        "calls_window_start": data.get("calls_window_start"),
        "site_count": site_count,
        "webhook_url": webhook_url,
        "webhook_configured": bool(data.get("webhook_secret")),
        **summary,
    }


@app.post("/api/org/webhook/setup")
async def setup_webhook(org_id: str = Depends(get_org_id)):
    """Generate (or regenerate) the webhook secret for this org. Returns the plaintext secret once."""
    _get_org_or_404(org_id)
    secret = secrets.token_hex(32)
    db = get_client()
    db.table("org_config").update({"webhook_secret": encrypt(secret)}) \
        .eq("org_id", org_id).execute()
    return {"webhook_secret": secret}


@app.get("/api/org/digest-settings")
async def get_digest_settings(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "digest_frequency,digest_extra_recipients,digest_last_sent_at,digest_last_error"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")
    return {
        "frequency": row.data.get("digest_frequency"),
        "extra_recipients": row.data.get("digest_extra_recipients") or [],
        "last_sent_at": row.data.get("digest_last_sent_at"),
        "last_error": row.data.get("digest_last_error"),
        "resend_configured": bool(os.environ.get("RESEND_API_KEY") and os.environ.get("RESEND_FROM_EMAIL")),
    }


@app.patch("/api/org/digest-settings")
async def update_digest_settings(req: DigestSettingsRequest, org_id: str = Depends(get_org_id)):
    _get_org_or_404(org_id)
    db = get_client()
    db.table("org_config").update({
        "digest_frequency": req.frequency,
        "digest_extra_recipients": req.extra_recipients,
    }).eq("org_id", org_id).execute()
    digest.register_digest_job(org_id, req.frequency)
    return {"ok": True}


@app.post("/api/digest/test")
async def send_test_digest(org_id: str = Depends(get_org_id)):
    result = await digest.send_digest(org_id, trigger_source="manual")
    return result


@app.post("/api/webhooks/mist/{org_id}", status_code=200)
async def mist_webhook(org_id: str, request: Request):
    """
    Public endpoint — no Clerk auth. Mist POSTs audit events here.
    Validates HMAC-SHA256 signature, then triggers a check for each affected site.
    """
    body = await request.body()
    signature = request.headers.get("X-Mist-Signature-v2", "")

    db = get_client()
    row = db.table("org_config").select("webhook_secret,mode") \
        .eq("org_id", org_id).maybe_single().execute()
    if not row.data or row.data.get("mode") != "webhook":
        raise HTTPException(404, "Webhook not configured for this org")

    secret_enc = row.data.get("webhook_secret")
    if not secret_enc:
        raise HTTPException(400, "Webhook secret not set — run setup first")

    secret = decrypt(secret_enc)
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Invalid webhook signature")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON payload")

    events = payload.get("events", [])
    site_ids = {e["site_id"] for e in events if e.get("site_id")}
    if not site_ids:
        return {"ok": True, "sites_triggered": 0}

    org = _get_org_or_404(org_id)
    for site_id in site_ids:
        asyncio.create_task(_rerun_site(org_id, site_id, org))

    log.info("Mist webhook: org=%s triggered check for %d sites", org_id, len(site_ids))
    return {"ok": True, "sites_triggered": len(site_ids)}


# ---------------------------------------------------------------------------
# AI Config
# ---------------------------------------------------------------------------

@app.get("/api/ai-config")
async def get_ai_config(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row or not row.data:
        return {"configured": False}
    data = row.data
    return {
        "configured": True,
        "provider": data["provider"],
        "model": data["model"],
        "base_url": data.get("base_url"),
        "has_key": bool(data.get("api_key")),
    }


@app.put("/api/ai-config")
async def save_ai_config(req: AIConfigSave, org_id: str = Depends(get_org_id)):
    db = get_client()
    payload: dict = {
        "org_id": org_id,
        "provider": req.provider,
        "model": req.model,
        "base_url": req.base_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if req.api_key:
        payload["api_key"] = encrypt(req.api_key.strip())
    db.table("ai_config").upsert(payload).execute()
    return {"ok": True}


@app.post("/api/ai/parse-filter")
async def parse_filter_endpoint(req: ParseFilterRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(400, "No AI provider configured. Go to Settings → AI Provider.")
    try:
        field_dict = get_field_dict()
    except (FileNotFoundError, json.JSONDecodeError):
        field_dict = None
    try:
        result = await _ai_parse_filter(req.text, row.data, org_id, field_dict=field_dict)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        log.error("AI parse-filter error: %s", exc)
        raise HTTPException(500, "AI provider error")
    return {"filter": result}


# ---------------------------------------------------------------------------
# Field Dictionary
# ---------------------------------------------------------------------------

@app.get("/api/fields")
async def get_fields(_: str = Depends(get_org_id)):
    try:
        return get_field_dict()
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise HTTPException(500, f"Field dictionary unavailable: {exc}")


@app.get("/api/rftemplates")
async def list_rftemplates(org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("org_config").select(
        "mist_token,cloud_endpoint,mist_org_id"
    ).eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured. POST /api/org/connect first.")
    token = decrypt(row.data["mist_token"])
    base_url = mist.build_base_url(row.data["cloud_endpoint"])
    mist_org_id = row.data["mist_org_id"]
    if not mist_org_id:
        raise HTTPException(400, "Mist org ID not configured. Reconnect via POST /api/org/connect.")
    templates = await mist.get_rftemplates(token, base_url, mist_org_id)
    return [{"id": t["id"], "name": t["name"]} for t in templates if "id" in t and "name" in t]


@app.post("/api/fields/refresh")
async def refresh_fields(_: str = Depends(get_org_id)):
    try:
        d = save_field_dict()
        return {"refreshed": len(d), "ok": True}
    except PermissionError:
        raise HTTPException(500, "Cannot write fields.json — check file permissions in container")
    except Exception as exc:
        raise HTTPException(500, f"Refresh failed: {exc}")


# ---------------------------------------------------------------------------
# Sites
# ---------------------------------------------------------------------------

@app.get("/api/sites")
async def list_sites(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("site").select("*").eq("org_id", org_id).execute()
    return {"sites": rows.data or []}


@app.post("/api/sites/sync")
async def sync_sites(org_id: str = Depends(get_org_id)):
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])
    try:
        mist_org_id = await _get_mist_org_id(token, base_url)
        sites = await mist.get_sites(token, base_url, mist_org_id)
    except Exception as exc:
        raise HTTPException(502, str(exc))

    db = get_client()
    for s in sites:
        db.table("site").upsert({"id": s["id"], "org_id": org_id, "name": s["name"]},
                                on_conflict="id,org_id").execute()
    return {"synced": len(sites)}


@app.patch("/api/sites/{site_id}/monitored")
async def toggle_monitored(site_id: str, monitored: bool, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("site").update({"monitored": monitored}).eq("id", site_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Standards
# ---------------------------------------------------------------------------

@app.get("/api/standards")
async def list_standards(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("standard").select("*").eq("org_id", org_id).order("created_at").execute()
    return {"standards": rows.data or []}


@app.post("/api/standards", status_code=201)
async def create_standard(body: StandardCreate, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = {**body.model_dump(), "org_id": org_id}
    result = db.table("standard").insert(row).execute()
    return result.data[0]


@app.put("/api/standards/{standard_id}")
async def update_standard(standard_id: str, body: StandardUpdate, org_id: str = Depends(get_org_id)):
    db = get_client()
    result = db.table("standard").update(body.model_dump()).eq("id", standard_id).eq("org_id", org_id).execute()
    if not result.data:
        raise HTTPException(404, "Standard not found")
    return result.data[0]


@app.delete("/api/standards/{standard_id}", status_code=204)
async def delete_standard(standard_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("standard").delete().eq("id", standard_id).eq("org_id", org_id).execute()


@app.patch("/api/standards/{standard_id}/toggle")
async def toggle_standard(standard_id: str, enabled: bool, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("standard").update({"enabled": enabled}).eq("id", standard_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Validation runs
# ---------------------------------------------------------------------------

@app.post("/api/sites/{site_id}/run")
async def run_site(site_id: str, req: RunRequest, org_id: str = Depends(get_org_id)):
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])

    try:
        wlans = await mist.get_site_wlans(token, base_url, site_id)
        site_setting = await mist.get_site_setting(token, base_url, site_id)
        site_entity = await mist.get_site(token, base_url, site_id)
    except Exception as exc:
        raise HTTPException(502, str(exc))
    # Merge site entity fields (rftemplate_id etc.) into site_setting so standards can check them.
    site_setting = {**site_setting, **{k: site_entity.get(k) for k in remediation._SITE_ENTITY_FIELDS}}

    db = get_client()
    stds = db.table("standard").select("*").eq("org_id", org_id).eq("enabled", True).execute()
    standards = stds.data or []

    site_row = db.table("site").select("name").eq("id", site_id).eq("org_id", org_id).maybe_single().execute()
    site_name = site_row.data["name"] if site_row.data else site_id

    findings = evaluate_site(site_id, site_name, wlans, site_setting, standards)

    passed  = sum(1 for f in findings if f["status"] == "pass")
    failed  = sum(1 for f in findings if f["status"] == "fail")
    skipped = sum(1 for f in findings if f["status"] == "skip")

    run = db.table("validation_run").insert({
        "org_id": org_id, "site_id": site_id, "site_name": site_name,
        "triggered_by": req.triggered_by,
        "passed": passed, "failed": failed, "skipped": skipped,
    }).execute().data[0]

    run_id = run["id"]
    for f in findings:
        db.table("finding").insert({**f, "run_id": run_id}).execute()

    await _sync_incidents(org_id, site_id, site_name, findings, standards, org, org.get("mist_org_id"), wlans=wlans)

    db.table("site").update({"last_checked_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("id", site_id).eq("org_id", org_id).execute()

    return {**run, "findings": findings}


@app.get("/api/sites/{site_id}/findings")
async def get_findings(site_id: str, org_id: str = Depends(get_org_id)):
    try:
        db = get_client()
        run = db.table("validation_run").select("id").eq("org_id", org_id).eq("site_id", site_id) \
                .order("run_at", desc=True).limit(1).maybe_single().execute()
        if run is None or not run.data:
            return {"findings": []}
        findings = db.table("finding").select("*").eq("run_id", run.data["id"]).execute()
        return {"findings": findings.data or []}
    except Exception as exc:
        log.exception("get_findings failed for site=%s: %s", site_id, exc)
        return {"findings": []}


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------

@app.get("/api/incidents")
async def list_incidents(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("incident").select("*").eq("org_id", org_id).order("opened_at", desc=True).execute()
    return {"incidents": rows.data or []}


@app.patch("/api/incidents/{incident_id}/suppress")
async def suppress_incident(incident_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("incident").update({"status": "suppressed"}).eq("id", incident_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Remediation
# ---------------------------------------------------------------------------

@app.get("/api/remediation")
async def list_pending(org_id: str = Depends(get_org_id)):
    db = get_client()
    rows = db.table("remediation_action").select("*").eq("org_id", org_id) \
             .in_("status", ["pending", "failed"]).order("attempted_at", desc=True).execute()
    return {"actions": rows.data or []}


@app.post("/api/remediation/{action_id}/approve")
async def approve_action(action_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("remediation_action").select("*").eq("id", action_id).eq("org_id", org_id) \
            .maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Action not found")
    action = row.data
    org = _get_org_or_404(org_id)
    await _execute_remediation_action(action, org_id, org.get("mist_org_id"))
    return {"ok": True}


@app.post("/api/remediation/{action_id}/retry")
async def retry_action(action_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("remediation_action").select("*").eq("id", action_id).eq("org_id", org_id) \
            .maybe_single().execute()
    if row is None or not row.data:
        raise HTTPException(404, "Action not found")
    db.table("remediation_action").update({"status": "pending", "error_detail": None}) \
        .eq("id", action_id).execute()
    org = _get_org_or_404(org_id)
    await _execute_remediation_action(row.data, org_id, org.get("mist_org_id"))
    return {"ok": True}


@app.post("/api/remediation/{action_id}/reject")
async def reject_action(action_id: str, org_id: str = Depends(get_org_id)):
    db = get_client()
    db.table("remediation_action").update({"status": "rejected"}).eq("id", action_id).eq("org_id", org_id).execute()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/sites/{site_id}/wlans/raw")
async def get_raw_wlans(site_id: str, org_id: str = Depends(get_org_id)):
    """Return raw derived WLAN objects from Mist — for inspecting field names when writing standards."""
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])
    wlans = await mist.get_site_wlans(token, base_url, site_id)
    return {"wlans": wlans}


@app.get("/health")
async def health():
    return {"status": "ok", "scheduler_running": sched.scheduler.running}


# ---------------------------------------------------------------------------
# Debug logs (gated by ENABLE_DEBUG_LOGS env var)
# ---------------------------------------------------------------------------

@app.get("/api/debug/status")
async def debug_status(_: str = Depends(get_org_id)):
    return {"enabled": debug_logs.is_enabled()}


@app.get("/api/debug/logs")
async def debug_log_entries(
    since: int = 0,
    min_level: str = "INFO",
    _: str = Depends(get_org_id),
):
    if not debug_logs.is_enabled():
        raise HTTPException(403, "Debug logs are not enabled on this server")
    handler = debug_logs.get_handler()
    if handler is None:
        return {"entries": [], "last_id": since}
    entries = handler.read_since(since, min_level=min_level)
    return {
        "entries": entries,
        "last_id": entries[-1]["id"] if entries else since,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_org_or_404(org_id: str) -> dict:
    db = get_client()
    row = db.table("org_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row.data:
        raise HTTPException(404, "Org not configured")
    return row.data


async def _get_mist_org_id(token: str, base_url: str) -> str:
    info = await mist.get_org_info(token, base_url)
    return info["org_id"]


async def _sync_incidents(
    org_id: str, site_id: str, site_name: str,
    findings: list[dict], standards: list[dict], org: dict,
    mist_org_id: str | None = None,
    wlans: list[dict] | None = None,
):
    db = get_client()
    std_map = {s["id"]: s for s in standards}
    # Build for_site lookup from the already-fetched derived WLAN list.
    # This avoids a second per-finding API call and ensures consistency with what was scanned.
    wlan_for_site: dict[str, bool | None] = {
        w["id"]: w.get("for_site") for w in (wlans or []) if "id" in w
    }

    # Resolve open incidents where finding now passes
    open_incidents = db.table("incident").select("*") \
        .eq("org_id", org_id).eq("site_id", site_id).eq("status", "open").execute()

    passing_keys = {
        (f["standard_id"], f.get("wlan_id"))
        for f in findings if f["status"] == "pass"
    }

    for inc in (open_incidents.data or []):
        key = (inc["standard_id"], inc.get("wlan_id"))
        if key in passing_keys:
            db.table("incident").update({
                "status": "resolved",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", inc["id"]).execute()

    # Build a map of open incidents keyed by (standard_id, wlan_id)
    open_incident_map: dict[tuple, dict] = {
        (inc["standard_id"], inc.get("wlan_id")): inc
        for inc in (open_incidents.data or [])
        if inc["status"] == "open"
    }

    # Which open incidents already have an active (pending/approved) remediation action?
    open_ids = [inc["id"] for inc in (open_incidents.data or []) if inc["status"] == "open"]
    if open_ids:
        active_rows = db.table("remediation_action").select("incident_id") \
            .in_("incident_id", open_ids).in_("status", ["pending", "approved"]).execute()
        active_incident_ids = {r["incident_id"] for r in (active_rows.data or [])}
    else:
        active_incident_ids: set = set()

    for f in findings:
        if f["status"] != "fail":
            continue
        key = (f["standard_id"], f.get("wlan_id"))
        std = std_map.get(f["standard_id"])
        if not std:
            continue

        existing_inc = open_incident_map.get(key)
        if existing_inc and existing_inc["id"] in active_incident_ids:
            # Already has a pending/approved action in flight — don't double-queue
            continue

        # Determine if auto-remediate applies
        auto = std.get("auto_remediate")
        if auto is None:
            auto = org.get("auto_remediate", False)

        # Determine if the WLAN lives at site or org level using the already-fetched derived list.
        for_site: bool | None = None
        if std.get("scope") == "wlan" and f.get("wlan_id"):
            raw = wlan_for_site.get(f["wlan_id"])
            if raw is not None:
                for_site = bool(raw)

        if existing_inc:
            # Incident already open but no active action — create a new remediation action
            inc = existing_inc
        else:
            inc = db.table("incident").insert({
                "org_id": org_id, "site_id": site_id, "site_name": site_name,
                "standard_id": f["standard_id"], "title": std["name"],
                "wlan_id": f.get("wlan_id"), "ssid": f.get("ssid"),
            }).execute().data[0]

        action = db.table("remediation_action").insert({
            "incident_id": inc["id"], "org_id": org_id,
            "site_id": site_id, "wlan_id": f.get("wlan_id"),
            "standard_id": f["standard_id"],
            "desired_value": std["remediation_value"],
            "for_site": for_site,
            "status": "pending",
        }).execute().data[0]

        if auto:
            await _execute_remediation_action(action, org_id, mist_org_id)


async def _execute_remediation_action(action: dict, org_id: str, mist_org_id: str | None = None):
    db = get_client()
    org = _get_org_or_404(org_id)
    token = decrypt(org["mist_token"])
    base_url = mist.build_base_url(org["cloud_endpoint"])
    effective_mist_org_id = mist_org_id or org.get("mist_org_id")

    std = db.table("standard").select("*").eq("id", action["standard_id"]).maybe_single().execute()
    if not std.data:
        return

    result = await apply_remediation(
        action["site_id"], action.get("wlan_id"), std.data,
        token, base_url, effective_mist_org_id,
        for_site=action.get("for_site"),
    )

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "attempted_at": now,
        "status": "success" if result["success"] else "failed",
        "error_detail": result.get("error"),
    }
    db.table("remediation_action").update(update).eq("id", action["id"]).execute()

    if result["success"]:
        if result.get("org_level"):
            db.table("incident").update({"status": "resolved", "resolved_at": now}) \
                .eq("org_id", org_id) \
                .eq("standard_id", str(action["standard_id"])) \
                .eq("wlan_id", action.get("wlan_id")) \
                .eq("status", "open").execute()
            log.info("org-level fix: resolved all open incidents for standard=%s wlan=%s",
                     action["standard_id"], action.get("wlan_id"))
            # Re-run all monitored sites so findings reflect the fix
            asyncio.create_task(_rerun_all_sites(org_id, org))
        else:
            db.table("incident").update({"status": "resolved", "resolved_at": now}) \
                .eq("id", action["incident_id"]).execute()
            asyncio.create_task(_rerun_site(org_id, action["site_id"], org))


async def _rerun_site(org_id: str, site_id: str, org: dict):
    """Re-validate a single site after remediation to refresh findings."""
    try:
        token = decrypt(org["mist_token"])
        base_url = mist.build_base_url(org["cloud_endpoint"])
        wlans = await mist.get_site_wlans(token, base_url, site_id)
        site_setting = await mist.get_site_setting(token, base_url, site_id)
        site_entity = await mist.get_site(token, base_url, site_id)
        site_setting = {**site_setting, **{k: site_entity.get(k) for k in remediation._SITE_ENTITY_FIELDS}}
        db = get_client()
        stds = db.table("standard").select("*").eq("org_id", org_id).eq("enabled", True).execute()
        site_row = db.table("site").select("name").eq("id", site_id).eq("org_id", org_id).maybe_single().execute()
        site_name = (site_row.data["name"] if (site_row and site_row.data) else site_id)
        findings = evaluate_site(site_id, site_name, wlans, site_setting, stds.data or [])
        passed  = sum(1 for f in findings if f["status"] == "pass")
        failed  = sum(1 for f in findings if f["status"] == "fail")
        skipped = sum(1 for f in findings if f["status"] == "skip")
        run = db.table("validation_run").insert({
            "org_id": org_id, "site_id": site_id, "site_name": site_name,
            "triggered_by": "scheduled", "passed": passed, "failed": failed, "skipped": skipped,
        }).execute().data[0]
        for f in findings:
            db.table("finding").insert({**f, "run_id": run["id"]}).execute()
        await _sync_incidents(org_id, site_id, site_name, findings, stds.data or [], org, org.get("mist_org_id"), wlans=wlans)
        db.table("site").update({"last_checked_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("id", site_id).eq("org_id", org_id).execute()
        log.info("post-remediation rerun complete site=%s passed=%s failed=%s", site_id, passed, failed)
    except Exception as exc:
        log.exception("post-remediation rerun failed for site=%s: %s", site_id, exc)


async def _rerun_all_sites(org_id: str, org: dict):
    db = get_client()
    sites = db.table("site").select("*").eq("org_id", org_id).eq("monitored", True).execute()
    for site in (sites.data or []):
        await _rerun_site(org_id, site["id"], org)


async def run_drift_for_org(org_id: str):
    """Called by APScheduler for scheduled drift checks (polling and daily webhook safety scan)."""
    log.info("Drift check starting for org=%s", org_id)
    try:
        org = _get_org_or_404(org_id)
    except HTTPException:
        sched.remove_org_job(org_id)
        return

    db = get_client()
    sites = db.table("site").select("*").eq("org_id", org_id).eq("monitored", True).execute()
    site_list = sites.data or []
    if not site_list:
        return

    interval_mins = org.get("drift_interval_mins", 5) or 5
    sleep_secs = (interval_mins * 60) / len(site_list) if len(site_list) > 1 else 0

    for i, site in enumerate(site_list):
        # Stagger: sleep before each site after the first
        if i > 0 and sleep_secs > 0:
            await asyncio.sleep(sleep_secs)

        # Rate limit: skip this site if check budget is exhausted
        org_fresh = db.table("org_config").select("calls_used_this_hour,calls_window_start") \
            .eq("org_id", org_id).maybe_single().execute()
        if not org_fresh.data:
            log.warning("Rate budget check failed (org row missing): skipping site=%s", site["id"])
            continue
        calls_used, _ = _reset_window_if_needed(org_fresh.data)
        if not can_check(calls_used):
            log.warning("Rate budget exhausted: skipping site=%s (calls_used=%d)", site["id"], calls_used)
            continue

        check_error: str | None = None
        try:
            token = decrypt(org["mist_token"])
            base_url = mist.build_base_url(org["cloud_endpoint"])
            wlans = await mist.get_site_wlans(token, base_url, site["id"])
            site_setting = await mist.get_site_setting(token, base_url, site["id"])
            site_entity = await mist.get_site(token, base_url, site["id"])
            site_setting = {**site_setting, **{k: site_entity.get(k) for k in remediation._SITE_ENTITY_FIELDS}}

            # Count the 3 API calls we just made
            increment_calls(org_id)

            stds = db.table("standard").select("*").eq("org_id", org_id).eq("enabled", True).execute()
            findings = evaluate_site(site["id"], site["name"], wlans, site_setting, stds.data or [])
            passed  = sum(1 for f in findings if f["status"] == "pass")
            failed  = sum(1 for f in findings if f["status"] == "fail")
            skipped = sum(1 for f in findings if f["status"] == "skip")
            run = db.table("validation_run").insert({
                "org_id": org_id, "site_id": site["id"], "site_name": site["name"],
                "triggered_by": "scheduled", "passed": passed, "failed": failed, "skipped": skipped,
            }).execute().data[0]
            for f in findings:
                db.table("finding").insert({**f, "run_id": run["id"]}).execute()
            await _sync_incidents(org_id, site["id"], site["name"], findings, stds.data or [], org, org.get("mist_org_id"), wlans=wlans)
        except Exception as exc:
            log.exception("Drift check failed for site=%s: %s", site["id"], exc)
            check_error = str(exc)
        finally:
            db.table("site").update({
                "last_checked_at": datetime.now(timezone.utc).isoformat(),
                "check_error": check_error,
            }).eq("id", site["id"]).eq("org_id", org_id).execute()

    log.info("Drift check complete for org=%s (%d sites)", org_id, len(site_list))
