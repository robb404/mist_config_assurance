"""
Logging configuration for the backend.

Two pieces:
  1. A ContextVar-backed request ID that ties a log line to the HTTP request
     that produced it. Injected by RequestIdFilter so log records have
     record.request_id whether the code path set one or not.
  2. A configurable formatter — plain text by default (human-readable in
     Docker logs and in the Debug Logs panel) or JSON when LOG_FORMAT=json
     (so log aggregators like Datadog/Loki can parse fields cleanly).

Called from main.py at startup.
"""
import json
import logging
import os
import sys
from contextvars import ContextVar

_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def set_request_id(value: str | None) -> None:
    _request_id_var.set(value)


def get_request_id() -> str | None:
    return _request_id_var.get()


class RequestIdFilter(logging.Filter):
    """Ensures every record has a .request_id attribute (possibly empty)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_var.get() or ""
        return True


class PlainFormatter(logging.Formatter):
    """Human-readable: `timestamp LEVEL [req:abc123] logger message`."""

    def format(self, record: logging.LogRecord) -> str:
        rid = getattr(record, "request_id", "") or ""
        prefix = f"[req:{rid[:8]}] " if rid else ""
        ts = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        return f"{ts} {record.levelname:<7} {prefix}{record.name} {record.getMessage()}"


class JsonFormatter(logging.Formatter):
    """One JSON object per log line. Easy to parse downstream."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts":     self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z") or self.formatTime(record),
            "level":  record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        rid = getattr(record, "request_id", "") or ""
        if rid:
            payload["request_id"] = rid
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Wire up the root logger per the LOG_FORMAT env var. Idempotent."""
    fmt_mode = (os.environ.get("LOG_FORMAT") or "plain").lower()
    formatter: logging.Formatter = JsonFormatter() if fmt_mode == "json" else PlainFormatter()

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Strip any prior default handler (uvicorn adds one at import time).
    for h in list(root.handlers):
        root.removeHandler(h)

    stream = logging.StreamHandler(sys.stdout)
    stream.setFormatter(formatter)
    stream.addFilter(RequestIdFilter())
    root.addHandler(stream)

    # Common third-party loggers — tune noisy defaults.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
