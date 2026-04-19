import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.ai_provider import _parse_raw, parse_filter


def test_parse_raw_null():
    assert _parse_raw("null") is None
    assert _parse_raw("NULL") is None


def test_parse_raw_array():
    raw = '[{"field":"auth.type","condition":"eq","value":"psk"}]'
    result = _parse_raw(raw)
    assert result == [{"field": "auth.type", "condition": "eq", "value": "psk"}]


def test_parse_raw_invalid_raises():
    with pytest.raises(ValueError):
        _parse_raw("not json at all")


def test_parse_raw_non_array_raises():
    with pytest.raises(ValueError):
        _parse_raw('{"key": "value"}')
    with pytest.raises(ValueError):
        _parse_raw("42")


def test_parse_filter_ollama():
    config = {
        "provider": "ollama",
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
    }
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "message": {"content": '[{"field":"auth.type","condition":"eq","value":"psk"}]'}
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = asyncio.run(parse_filter("PSK WLANs only", config, "org_1"))

    assert result == [{"field": "auth.type", "condition": "eq", "value": "psk"}]


def test_parse_filter_ollama_null_response():
    config = {
        "provider": "ollama",
        "model": "llama3.2",
        "base_url": "http://localhost:11434",
    }
    mock_response = MagicMock()
    mock_response.json.return_value = {"message": {"content": "null"}}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_cls.return_value = mock_client

        result = asyncio.run(parse_filter("all WLANs", config, "org_1"))

    assert result is None


def test_parse_filter_raises_when_no_config():
    with pytest.raises((TypeError, KeyError, AttributeError)):
        asyncio.run(parse_filter("PSK only", None, "org_1"))
