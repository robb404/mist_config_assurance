import json

import httpx

from .crypto import decrypt

_SYSTEM_PROMPT = """\
You are a filter parser for a WiFi configuration assurance tool.
Convert natural language into a JSON filter array or the word null.

Each filter object has these keys:
  "field"     — one of: auth.type, auth.owe, auth.pairwise, auth.enable_beacon_protection,
                roam_mode, arp_filter, limit_bcast, enable_wireless_bridging, isolation,
                band_steer, hide_ssid, no_static_ip, rogue.enabled, wifi.enable_arp_spoof_check
  "condition" — one of: eq, ne, truthy, falsy, contains_item, not_contains_item
  "value"     — string, number, or boolean matching the field

Filters use OR logic: the standard applies if ANY filter matches.

Examples:
  "PSK WLANs only"          → [{"field":"auth.type","condition":"eq","value":"psk"}]
  "PSK and Enterprise"       → [{"field":"auth.type","condition":"eq","value":"psk"},{"field":"auth.type","condition":"eq","value":"eap"}]
  "open WLANs only"         → [{"field":"auth.type","condition":"eq","value":"open"}]
  "all WLANs" / "no filter" → null

Respond with ONLY a valid JSON array or the single word null. No explanation, no markdown fences."""


def _parse_raw(raw: str) -> list | None:
    stripped = raw.strip()
    if stripped.lower() == "null":
        return None
    try:
        result = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {stripped!r}") from exc
    if not isinstance(result, list):
        raise ValueError(f"Expected JSON array, got: {type(result)}")
    return result


async def parse_filter(text: str, config: dict, org_id: str) -> list | None:
    """Call the configured LLM provider and return a filter array or None."""
    provider = config["provider"]
    model = config["model"]

    if provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=decrypt(config["api_key"]))
        msg = await client.messages.create(
            model=model,
            max_tokens=256,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text}],
        )
        raw = msg.content[0].text

    elif provider == "openai":
        import openai
        client = openai.AsyncOpenAI(api_key=decrypt(config["api_key"]))
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=256,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
        )
        raw = resp.choices[0].message.content

    elif provider == "ollama":
        base_url = config.get("base_url") or "http://localhost:11434"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{base_url}/api/chat", json={
                "model": model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
            })
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise ValueError(
                    f"Ollama request failed ({exc.response.status_code}). Check the Ollama server is running."
                ) from exc
            raw = r.json()["message"]["content"]

    else:
        raise ValueError(f"Unknown provider: {provider}")

    return _parse_raw(raw.strip())
