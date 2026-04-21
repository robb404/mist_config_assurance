"""
In-memory ring buffer + logging handler for the live debug log view.

When ENABLE_DEBUG_LOGS=true, install() attaches a handler to the root logger
that captures records into a bounded deque. The frontend polls the /api/debug/logs
endpoint to stream new records since the last id it saw.

The buffer is always filled when enabled (tiny overhead); the UI Start/Stop
toggle controls whether the client polls.
"""
import logging
import os
import threading
from collections import deque
from typing import Optional

_MAX_ENTRIES = 500
_LEVEL_RANK = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40, "CRITICAL": 50}


class DebugLogHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self._buffer: deque[dict] = deque(maxlen=_MAX_ENTRIES)
        self._next_id: int = 1
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
        except Exception:
            message = str(record.msg)
        entry = {
            "id": 0,
            "timestamp": record.created,
            "level": record.levelname,
            "logger": record.name,
            "message": message,
        }
        with self._lock:
            entry["id"] = self._next_id
            self._next_id += 1
            self._buffer.append(entry)

    def read_since(
        self,
        since_id: int = 0,
        min_level: str = "INFO",
        limit: int = 200,
    ) -> list[dict]:
        min_rank = _LEVEL_RANK.get(min_level.upper(), _LEVEL_RANK["INFO"])
        with self._lock:
            snapshot = list(self._buffer)
        filtered = [
            e for e in snapshot
            if e["id"] > since_id
            and _LEVEL_RANK.get(e["level"], _LEVEL_RANK["INFO"]) >= min_rank
        ]
        return filtered[-limit:]


_handler: Optional[DebugLogHandler] = None


def is_enabled() -> bool:
    return os.environ.get("ENABLE_DEBUG_LOGS", "").lower() in ("true", "1", "yes")


def get_handler() -> Optional[DebugLogHandler]:
    return _handler


def install() -> Optional[DebugLogHandler]:
    """Attach the handler to root + mist_ca + uvicorn loggers. No-op if not enabled."""
    global _handler
    if not is_enabled():
        return None
    if _handler is not None:
        return _handler
    _handler = DebugLogHandler()
    _handler.setLevel(logging.DEBUG)
    # Root catches most; explicit listeners for common loggers to ensure coverage.
    for name in ("", "mist_ca", "uvicorn", "uvicorn.error"):
        logging.getLogger(name).addHandler(_handler)
    return _handler
