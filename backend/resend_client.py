import logging
import os

import httpx

log = logging.getLogger("mist_ca")

TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=2.0)


async def send_email(to: list[str], subject: str, text: str) -> tuple[bool, str | None]:
    """
    Send a plain-text email via the Resend HTTP API.
    Returns (True, None) on 2xx; (False, error_message) on any failure.
    When RESEND_API_KEY or RESEND_FROM_EMAIL are unset, returns (False, "Resend not configured")
    without making an HTTP call.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = os.environ.get("RESEND_FROM_EMAIL")
    if not api_key or not from_addr:
        return False, "Resend not configured"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"from": from_addr, "to": to, "subject": subject, "text": text},
                timeout=TIMEOUT,
            )
    except Exception as exc:
        log.warning("Resend HTTP error: %s", exc)
        return False, str(exc)

    if resp.is_success:
        return True, None
    return False, (resp.text or "")[:500]
