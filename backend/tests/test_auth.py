import asyncio
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException


def test_get_org_id_missing_bearer():
    from backend.auth import get_org_id
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_org_id("not-bearer"))
    assert exc.value.status_code == 401


def test_get_org_id_no_org_in_payload():
    from backend.auth import get_org_id
    mock_key = MagicMock()
    mock_key.key = "secret"
    with patch("backend.auth._get_jwks_client") as mock_client:
        mock_client.return_value.get_signing_key_from_jwt.return_value = mock_key
        with patch("backend.auth.jwt.decode", return_value={"sub": "user_1"}):
            with pytest.raises(HTTPException) as exc:
                asyncio.run(get_org_id("Bearer fake_token"))
    assert exc.value.status_code == 403


def test_get_org_id_returns_org():
    from backend.auth import get_org_id
    mock_key = MagicMock()
    mock_key.key = "secret"
    with patch("backend.auth._get_jwks_client") as mock_client:
        mock_client.return_value.get_signing_key_from_jwt.return_value = mock_key
        with patch("backend.auth.jwt.decode", return_value={"sub": "user_1", "org_id": "org_abc"}):
            result = asyncio.run(get_org_id("Bearer fake_token"))
    assert result == "org_abc"
