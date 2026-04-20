import json
import re
from pathlib import Path

_FIELD_REF = Path(__file__).parent.parent / "docs" / "mist-api" / "field-reference.md"
_FIELDS_JSON = Path(__file__).parent / "fields.json"

_SCOPE_RE = re.compile(r"##\s+\w[^(]*\(`scope:\s*(\w+)`\)", re.IGNORECASE)
_ROW_RE = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|")


def _parse_values(raw: str) -> list[str]:
    tokens = re.findall(r"`([^`]+)`", raw)
    if tokens:
        return tokens
    return [t.strip() for t in re.split(r"[\s/|]+", raw) if t.strip()]


def build_field_dict() -> dict:
    text = _FIELD_REF.read_text()
    result: dict = {}
    current_scope = "wlan"
    for line in text.splitlines():
        m = _SCOPE_RE.search(line)
        if m:
            current_scope = m.group(1).lower()
            continue
        m = _ROW_RE.match(line)
        if not m:
            continue
        field = m.group(1)
        ftype = m.group(2).strip()
        values_raw = m.group(3).strip()
        notes = m.group(4).strip()
        result[field] = {
            "scope": current_scope,
            "type": ftype,
            "values": _parse_values(values_raw),
            "notes": notes,
        }
    return result


def save_field_dict() -> dict:
    d = build_field_dict()
    _FIELDS_JSON.write_text(json.dumps(d, indent=2))
    return d


def get_field_dict() -> dict:
    if _FIELDS_JSON.exists():
        return json.loads(_FIELDS_JSON.read_text())
    return build_field_dict()
