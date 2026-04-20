import json

import httpx

from .crypto import decrypt

_BASE_SYSTEM_PROMPT = """\
You are a filter parser for a WiFi configuration assurance tool.
Convert natural language into a JSON filter array or the word null.

Each filter object has these keys:
  "field"     — a WLAN field path (e.g. auth.type, roam_mode, arp_filter, isolation)
  "condition" — one of: eq, ne, truthy, falsy, contains_item, not_contains_item
  "value"     — string, number, or boolean matching the field

Filters use OR logic: the standard applies if ANY filter matches.

Examples:
  "PSK WLANs only"          → [{"field":"auth.type","condition":"eq","value":"psk"}]
  "PSK and Enterprise"       → [{"field":"auth.type","condition":"eq","value":"psk"},{"field":"auth.type","condition":"eq","value":"eap"}]
  "open WLANs only"         → [{"field":"auth.type","condition":"eq","value":"open"}]
  "all WLANs" / "no filter" → null

Respond with ONLY a valid JSON array or the single word null. No explanation, no markdown fences."""


def _build_system_prompt(field_dict: dict | None) -> str:
    if not field_dict:
        return _BASE_SYSTEM_PROMPT
    wlan_fields = {k: v for k, v in field_dict.items() if v.get("scope") == "wlan"}
    if not wlan_fields:
        return _BASE_SYSTEM_PROMPT
    lines = ["Field reference (WLAN fields only):"]
    for field, meta in sorted(wlan_fields.items()):
        values = meta.get("values", [])
        notes = meta.get("notes", "")
        val_str = ", ".join(f'"{v}"' for v in values) if values else ""
        line = f"  {field} ({meta.get('type', 'unknown')})"
        if val_str:
            line += f": {val_str}"
        if notes:
            line += f" — {notes}"
        lines.append(line)
    field_ref = "\n".join(lines)
    return f"{_BASE_SYSTEM_PROMPT}\n\n{field_ref}"


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


async def parse_filter(text: str, config: dict, org_id: str, field_dict: dict | None = None) -> list | None:
    """Call the configured LLM provider and return a filter array or None."""
    system_prompt = _build_system_prompt(field_dict)
    provider = config["provider"]
    model = config["model"]

    if provider == "anthropic":
        import anthropic
        try:
            client = anthropic.AsyncAnthropic(api_key=decrypt(config["api_key"]))
            msg = await client.messages.create(
                model=model,
                max_tokens=256,
                system=system_prompt,
                messages=[{"role": "user", "content": text}],
            )
        except anthropic.AuthenticationError:
            raise ValueError("Anthropic API key is invalid. Re-enter it in Settings → AI Provider.")
        except anthropic.PermissionDeniedError as exc:
            raise ValueError(f"Anthropic access denied: {exc.message}") from exc
        except anthropic.BadRequestError as exc:
            if "credit" in str(exc).lower() or "billing" in str(exc).lower():
                raise ValueError("Anthropic account has no credits. Add billing at console.anthropic.com.") from exc
            raise
        raw = msg.content[0].text

    elif provider == "openai":
        import openai
        try:
            client = openai.AsyncOpenAI(api_key=decrypt(config["api_key"]))
            resp = await client.chat.completions.create(
                model=model,
                max_tokens=256,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
            )
        except openai.AuthenticationError:
            raise ValueError("OpenAI API key is invalid. Re-enter it in Settings → AI Provider.")
        raw = resp.choices[0].message.content

    elif provider == "ollama":
        base_url = config.get("base_url") or "http://localhost:11434"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(f"{base_url}/api/chat", json={
                    "model": model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text},
                    ],
                })
                try:
                    r.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise ValueError(
                        f"Ollama returned {exc.response.status_code}. Is the model '{model}' pulled?"
                    ) from exc
                raw = r.json()["message"]["content"]
        except httpx.ConnectError:
            raise ValueError(f"Cannot reach Ollama at {base_url}. Is it running?")

    else:
        raise ValueError(f"Unknown provider: {provider}")

    return _parse_raw(raw.strip())
