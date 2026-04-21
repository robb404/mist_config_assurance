from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.digest import (
    _window_start, _format_body, _build_subject, send_digest,
)


def test_window_start_first_run_daily():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=None, frequency="daily", now=now)
    assert start == now - timedelta(hours=24)


def test_window_start_first_run_weekly():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=None, frequency="weekly", now=now)
    assert start == now - timedelta(days=7)


def test_window_start_uses_last_sent_at():
    now = datetime(2026, 4, 22, 8, 0, tzinfo=timezone.utc)
    last = datetime(2026, 4, 21, 8, 0, tzinfo=timezone.utc)
    start = _window_start(last_sent_at=last, frequency="daily", now=now)
    assert start == last


def test_format_body_daily():
    body = _format_body(
        frequency="daily",
        new_incidents=5,
        remediation_success=12,
        remediation_failed=2,
        app_url="https://example.com",
    )
    assert "In the last 24 hours" in body
    assert "5 new incidents" in body
    assert "12 auto-remediations succeeded" in body
    assert "2 auto-remediations failed" in body
    assert "https://example.com/activity" in body


def test_format_body_weekly():
    body = _format_body(
        frequency="weekly",
        new_incidents=1,
        remediation_success=0,
        remediation_failed=0,
        app_url="https://example.com",
    )
    assert "In the last 7 days" in body


def test_build_subject_daily():
    now = datetime(2026, 4, 22, tzinfo=timezone.utc)
    assert _build_subject("daily", now) == "Mist Config Assurance — daily digest (2026-04-22)"


def test_build_subject_weekly():
    now = datetime(2026, 4, 22, tzinfo=timezone.utc)
    assert _build_subject("weekly", now) == "Mist Config Assurance — weekly digest (2026-04-22)"


async def test_send_digest_skips_when_empty_window(monkeypatch):
    """Empty-window case: counts are zero → skip send, update last_sent_at."""
    fake_org = {
        "org_id": "o1",
        "digest_frequency": "daily",
        "digest_last_sent_at": None,
        "digest_extra_recipients": ["extra@example.com"],
        "owner_user_id": None,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=fake_org)
    db.table.return_value.select.return_value.eq.return_value.gt.return_value.execute.return_value = MagicMock(count=0, data=[])
    db.table.return_value.update.return_value.eq.return_value.execute.return_value = None

    send_mock = AsyncMock(return_value=(True, None))

    with patch("backend.digest.get_client", return_value=db), \
         patch("backend.digest.send_email", new=send_mock):
        result = await send_digest("o1", trigger_source="scheduled")

    assert result["ok"] is True
    assert result["skipped"] is True
    send_mock.assert_not_called()


async def test_send_digest_no_recipients_short_circuits(monkeypatch):
    """No Clerk user + no extras → error, no Resend call."""
    fake_org = {
        "org_id": "o1",
        "digest_frequency": "daily",
        "digest_last_sent_at": None,
        "digest_extra_recipients": [],
        "owner_user_id": None,
    }

    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(data=fake_org)
    # Fake non-empty window so we get past the empty-skip
    db.table.return_value.select.return_value.eq.return_value.gt.return_value.execute.return_value = MagicMock(count=1, data=[{"id": "i1"}])

    send_mock = AsyncMock()

    with patch("backend.digest.get_client", return_value=db), \
         patch("backend.digest.send_email", new=send_mock):
        result = await send_digest("o1", trigger_source="manual")

    assert result["ok"] is False
    assert result["error"] == "no recipients configured"
    send_mock.assert_not_called()
