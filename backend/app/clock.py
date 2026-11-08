"""Injectable demo clock. No module may call date.today() directly."""
from __future__ import annotations

import threading
from datetime import date, timedelta

from .config import get_settings

_lock = threading.Lock()
_offset_days = 0


def base_date() -> date:
    raw = get_settings().demo_today.strip()
    return date.fromisoformat(raw) if raw else date.today()


def today() -> date:
    return base_date() + timedelta(days=_offset_days)


def advance(days: int) -> date:
    global _offset_days
    with _lock:
        _offset_days += days
    return today()


def reset() -> date:
    global _offset_days
    with _lock:
        _offset_days = 0
    return today()


def offset_days() -> int:
    return _offset_days


def set_offset(days: int) -> None:
    global _offset_days
    with _lock:
        _offset_days = days
