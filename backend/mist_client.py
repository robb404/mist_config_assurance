import httpx

TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=2.0)


def build_base_url(cloud_endpoint: str) -> str:
    host = cloud_endpoint.strip().rstrip("/")
    if not host.startswith("http"):
        host = f"https://{host}"
    if not host.endswith("/api/v1/"):
        host = host.rstrip("/") + "/api/v1/"
    return host


def _headers(token: str) -> dict:
    return {"Authorization": f"Token {token}"}


async def get_org_info(token: str, base_url: str, mist_org_id: str | None = None) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}self", headers=_headers(token), timeout=TIMEOUT)
        if resp.status_code == 401:
            raise ValueError("Invalid API token.")
        resp.raise_for_status()
        data = resp.json()
    org_privs = [p for p in data.get("privileges", []) if p.get("scope") == "org"]
    if not org_privs:
        raise ValueError("No org-level privilege found for this token.")
    if mist_org_id:
        match = next((p for p in org_privs if p["org_id"] == mist_org_id), None)
        if not match:
            ids = ", ".join(p["org_id"] for p in org_privs)
            raise ValueError(f"Token has no access to org {mist_org_id}. Accessible orgs: {ids}")
        return {"org_id": match["org_id"], "org_name": match.get("name", "Unknown")}
    if len(org_privs) > 1:
        ids = ", ".join(p["org_id"] for p in org_privs)
        raise ValueError(f"Token has access to multiple orgs — specify Mist Org ID: {ids}")
    return {"org_id": org_privs[0]["org_id"], "org_name": org_privs[0].get("name", "Unknown")}


async def get_sites(token: str, base_url: str, org_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}orgs/{org_id}/sites", headers=_headers(token), timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    return [{"id": s["id"], "name": s["name"]} for s in data if "id" in s] if isinstance(data, list) else []


async def get_site_wlans(token: str, base_url: str, site_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/wlans/derived",
            headers=_headers(token), timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []


async def get_site_setting(token: str, base_url: str, site_id: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/setting",
            headers=_headers(token), timeout=TIMEOUT,
        )
        return resp.json() if resp.is_success else {}


async def patch_wlan(token: str, base_url: str, site_id: str, wlan_id: str, payload: dict) -> tuple[bool, int]:
    """Returns (success, http_status). 404 means WLAN is org-level, not site-level."""
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/wlans/{wlan_id}",
            json=payload, headers=_headers(token), timeout=TIMEOUT,
        )
        return resp.is_success, resp.status_code


async def patch_org_wlan(token: str, base_url: str, mist_org_id: str, wlan_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}orgs/{mist_org_id}/wlans/{wlan_id}",
            json=payload, headers=_headers(token), timeout=TIMEOUT,
        )
        return resp.is_success


async def patch_site_setting(token: str, base_url: str, site_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/setting",
            json=payload, headers=_headers(token), timeout=TIMEOUT,
        )
        return resp.is_success
