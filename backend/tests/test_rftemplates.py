import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_rftemplates_success():
    raw = [{"id": "rf1", "name": "Corporate"}, {"id": "rf2", "name": "High Density"}]
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=True)
        mock_resp.json.return_value = raw
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == raw


@pytest.mark.asyncio
async def test_get_rftemplates_api_failure():
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=False)
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == []


@pytest.mark.asyncio
async def test_get_rftemplates_non_list_response():
    with patch("backend.mist_client.httpx.AsyncClient") as mock_cls:
        mock_resp = MagicMock(is_success=True)
        mock_resp.json.return_value = {"error": "unexpected"}
        mock_ctx = AsyncMock()
        mock_ctx.get = AsyncMock(return_value=mock_resp)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        from backend.mist_client import get_rftemplates
        result = await get_rftemplates("tok", "https://api.mist.com/api/v1/", "org1")
    assert result == []
