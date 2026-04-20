import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import mist_client as mist
from . import scheduler as sched
from .ai_provider import parse_filter as _ai_parse_filter
from .auth import get_org_id
from .crypto import decrypt, encrypt
from .db import get_client
from .engine import evaluate_site
from .models import (
    AIConfigSave, ConnectRequest, OrgSettingsRequest,
    ParseFilterRequest, RunRequest, StandardCreate, StandardUpdate,
)
from .remediation import apply_remediation

log = logging.getLogger("mist_ca")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    sched.start()
    # Reload all existing org schedules on startup
    db = get_client()
    orgs = db.table("org_config").select("org_id,drift_interval_mins").execute()
    for org in (orgs.data or []):
        if org["drift_interval_mins"] > 0:
            sched.upsert_org_job(org["org_id"], org["drift_interval_mins"], run_drift_for_org)
    yield
    sched.stop()


app = FastAPI(title="Mist Config Assurance", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Org / connection
# ---------------------------------------------------------------------------

@app.post("/api/org/connect")
async def connect(req: ConnectRequest, org_id: str = Depends(get_org_id)):
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
    }).execute()
    return {"org_name": info["org_name"], "mist_org_id": info["org_id"]}


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
    }).eq("org_id", org_id).execute()
    sched.upsert_org_job(org_id, req.drift_interval_mins, run_drift_for_org)
    return {"ok": True}


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
        payload["api_key"] = encrypt(req.api_key)
    db.table("ai_config").upsert(payload).execute()
    return {"ok": True}


@app.post("/api/ai/parse-filter")
async def parse_filter_endpoint(req: ParseFilterRequest, org_id: str = Depends(get_org_id)):
    db = get_client()
    row = db.table("ai_config").select("*").eq("org_id", org_id).maybe_single().execute()
    if not row or not row.data:
        raise HTTPException(400, "No AI provider configured. Visit Settings → AI Provider to set one up.")
    try:
        result = await _ai_parse_filter(req.text, row.data, org_id)
        return {"filter": result}
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        log.error("AI parse-filter error: %s", exc)
        raise HTTPException(502, f"AI provider error: {exc}")


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
    except Exception as exc:
        raise HTTPException(502, str(exc))

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

    await _sync_incidents(org_id, site_id, site_name, findings, standards, org, org.get("mist_org_id"))

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
):
    db = get_client()
    std_map = {s["id"]: s for s in standards}

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

    # Open incident for each new failure
    existing_open = {
        (inc["standard_id"], inc.get("wlan_id"))
        for inc in (open_incidents.data or [])
        if inc["status"] == "open"
    }

    for f in findings:
        if f["status"] != "fail":
            continue
        key = (f["standard_id"], f.get("wlan_id"))
        if key in existing_open:
            continue
        std = std_map.get(f["standard_id"])
        if not std:
            continue

        inc = db.table("incident").insert({
            "org_id": org_id, "site_id": site_id, "site_name": site_name,
            "standard_id": f["standard_id"], "title": std["name"],
            "wlan_id": f.get("wlan_id"), "ssid": f.get("ssid"),
        }).execute().data[0]

        # Determine if auto-remediate applies
        auto = std.get("auto_remediate")
        if auto is None:
            auto = org.get("auto_remediate", False)

        action = db.table("remediation_action").insert({
            "incident_id": inc["id"], "org_id": org_id,
            "site_id": site_id, "wlan_id": f.get("wlan_id"),
            "standard_id": f["standard_id"],
            "desired_value": std["remediation_value"],
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
        action["site_id"], action.get("wlan_id"), std.data, token, base_url, effective_mist_org_id
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
            import asyncio
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
        await _sync_incidents(org_id, site_id, site_name, findings, stds.data or [], org, org.get("mist_org_id"))
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
    """Called by APScheduler for scheduled drift checks."""
    log.info("Scheduled drift check for org=%s", org_id)
    try:
        org = _get_org_or_404(org_id)
    except HTTPException:
        sched.remove_org_job(org_id)
        return

    db = get_client()
    sites = db.table("site").select("*").eq("org_id", org_id).eq("monitored", True).execute()

    for site in (sites.data or []):
        try:
            token = decrypt(org["mist_token"])
            base_url = mist.build_base_url(org["cloud_endpoint"])
            wlans = await mist.get_site_wlans(token, base_url, site["id"])
            site_setting = await mist.get_site_setting(token, base_url, site["id"])
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
            await _sync_incidents(org_id, site["id"], site["name"], findings, stds.data or [], org, org.get("mist_org_id"))
            db.table("site").update({"last_checked_at": datetime.now(timezone.utc).isoformat()}) \
                .eq("id", site["id"]).eq("org_id", org_id).execute()
        except Exception as exc:
            log.exception("Drift check failed for site=%s: %s", site["id"], exc)
