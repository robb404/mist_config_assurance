import httpx


def build_base_url(cloud_endpoint: str) -> str:
    host = cloud_endpoint.strip().rstrip("/")
    if not host.startswith("http"):
        host = f"https://{host}"
    if not host.endswith("/api/v1/"):
        host = host.rstrip("/") + "/api/v1/"
    return host


def _headers(token: str) -> dict:
    return {"Authorization": f"Token {token}"}


async def get_org_info(token: str, base_url: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}self", headers=_headers(token), timeout=15)
        if resp.status_code == 401:
            raise ValueError("Invalid API token.")
        resp.raise_for_status()
        data = resp.json()
    for priv in data.get("privileges", []):
        if priv.get("scope") == "org":
            return {"org_id": priv["org_id"], "org_name": priv.get("name", "Unknown")}
    raise ValueError("No org-level privilege found for this token.")


async def get_sites(token: str, base_url: str, org_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(f"{base_url}orgs/{org_id}/sites", headers=_headers(token), timeout=30)
        resp.raise_for_status()
        data = resp.json()
    return [{"id": s["id"], "name": s["name"]} for s in data if "id" in s] if isinstance(data, list) else []


async def get_site_wlans(token: str, base_url: str, site_id: str) -> list[dict]:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/wlans/derived",
            headers=_headers(token), timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []


async def get_site_setting(token: str, base_url: str, site_id: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"{base_url}sites/{site_id}/setting",
            headers=_headers(token), timeout=30,
        )
        return resp.json() if resp.is_success else {}


async def patch_wlan(token: str, base_url: str, site_id: str, wlan_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/wlans/{wlan_id}",
            json=payload, headers=_headers(token), timeout=15,
        )
        return resp.is_success


async def patch_site_setting(token: str, base_url: str, site_id: str, payload: dict) -> bool:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.put(
            f"{base_url}sites/{site_id}/setting",
            json=payload, headers=_headers(token), timeout=15,
        )
        return resp.is_success
