from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from backend.resend_client import send_email


async def test_send_email_success(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    mock_response = MagicMock()
    mock_response.is_success = True

    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(return_value=mock_response)) as mock_post:
        ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is True
    assert err is None
    mock_post.assert_called_once()


async def test_send_email_http_error_returns_body(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.text = '{"message":"Invalid from address"}'

    with patch.object(httpx.AsyncClient, "post", new=AsyncMock(return_value=mock_response)):
        ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert "Invalid from address" in err


async def test_send_email_missing_api_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("RESEND_FROM_EMAIL", "from@example.com")

    ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert err == "Resend not configured"


async def test_send_email_missing_from(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.delenv("RESEND_FROM_EMAIL", raising=False)

    ok, err = await send_email(["to@example.com"], "Subj", "Body")

    assert ok is False
    assert err == "Resend not configured"
