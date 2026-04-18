import os
from fastapi import Header, HTTPException
import jwt
from jwt import PyJWKClient

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = os.environ["CLERK_JWKS_URL"]
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


async def get_org_id(authorization: str = Header(...)) -> str:
    """FastAPI dependency — verifies Clerk JWT and returns org_id."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception as exc:
        raise HTTPException(401, f"Invalid token: {exc}")
    org_id = payload.get("org_id")
    if not org_id:
        raise HTTPException(403, "No active Clerk organization. Select one in the UI.")
    return org_id
