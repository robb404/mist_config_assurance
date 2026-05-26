"""BUG-006: maybe_single().execute() returns None on zero rows in supabase-py
2.30.0. Endpoints that deref row.data without a None check 500 (AttributeError)
instead of returning a clean 404 when a workspace has no org_config row."""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException


def _db_org_returns(execute_result):
    """Mock db client whose org_config maybe_single().execute() yields the given result."""
    db = MagicMock()
    chain = db.table.return_value.select.return_value.eq.return_value
    chain.maybe_single.return_value.execute.return_value = execute_result
    return db


def test_get_org_raises_404_when_no_row(monkeypatch):
    from backend import main
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(None))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.get_org(org_id="org_missing"))
    assert exc.value.status_code == 404


def test_get_org_usage_raises_404_when_no_row(monkeypatch):
    from backend import main
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(None))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.get_org_usage(org_id="org_missing"))
    assert exc.value.status_code == 404


def test_get_org_or_404_raises_404_when_no_row(monkeypatch):
    from backend import main
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(None))
    with pytest.raises(HTTPException) as exc:
        main._get_org_or_404("org_missing")
    assert exc.value.status_code == 404


def test_get_digest_settings_raises_404_when_no_row(monkeypatch):
    from backend import main
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(None))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.get_digest_settings(org_id="org_missing"))
    assert exc.value.status_code == 404


def _db_usage(org_row_data, site_count):
    """Mock db for get_org_usage: org_config maybe_single + site count query."""
    db = MagicMock()
    shared_eq = db.table.return_value.select.return_value.eq.return_value
    org_resp = MagicMock()
    org_resp.data = org_row_data
    shared_eq.maybe_single.return_value.execute.return_value = org_resp
    site_resp = MagicMock()
    site_resp.count = site_count
    shared_eq.eq.return_value.execute.return_value = site_resp
    return db


def test_get_org_usage_resets_stale_window_for_display(monkeypatch):
    """OBS-005: a window older than an hour should show 0 calls used, not the
    stale stored counter."""
    from backend import main
    stale_start = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    row = {
        "mode": "polling",
        "calls_used_this_hour": 751,
        "calls_window_start": stale_start,
        "drift_interval_mins": 2,
        "webhook_secret": None,
    }
    monkeypatch.setattr(main, "get_client", lambda: _db_usage(row, 4))
    result = asyncio.run(main.get_org_usage(org_id="org_x"))
    assert result["calls_used_this_hour"] == 0


# --- BUG-002: disconnected-org handling ---

def _org_resp(data):
    r = MagicMock()
    r.data = data
    return r


def test_get_org_reports_disconnected_when_token_null(monkeypatch):
    from backend import main
    row = {"org_id": "o", "org_name": "The Lab", "cloud_endpoint": "api.mist.com",
           "mist_token": None, "mist_org_id": None}
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(_org_resp(row)))
    out = asyncio.run(main.get_org(org_id="o"))
    assert out["connected"] is False
    assert "mist_token" not in out


def test_get_org_reports_connected_when_token_present(monkeypatch):
    from backend import main
    row = {"org_id": "o", "org_name": "The Lab", "cloud_endpoint": "api.mist.com",
           "mist_token": "gAAAA-encrypted", "mist_org_id": "44a01486"}
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(_org_resp(row)))
    out = asyncio.run(main.get_org(org_id="o"))
    assert out["connected"] is True


def test_sync_sites_returns_409_when_disconnected(monkeypatch):
    from backend import main
    row = {"org_id": "o", "org_name": "The Lab", "cloud_endpoint": "api.mist.com",
           "mist_token": None, "mist_org_id": None}
    monkeypatch.setattr(main, "get_client", lambda: _db_org_returns(_org_resp(row)))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.sync_sites(org_id="o"))
    assert exc.value.status_code == 409
