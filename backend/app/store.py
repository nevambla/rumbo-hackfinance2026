"""In-memory state of the demo user, persisted as JSON under data/runtime/.

The seed uses relative dates so the demo tells the same story on any day:
"today", "today-139", "today+13" and "{Y}-01-01" / "{Y-1}" (current year, offset).
"""
from __future__ import annotations

import json
import re
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from . import clock
from .config import get_settings
from .models import UserState

_lock = threading.RLock()
_state: UserState | None = None

_RELATIVE_DAY = re.compile(r"^today(?:([+-])(\d+))?$")
_YEAR = re.compile(r"\{Y([+-]\d+)?\}")


def _seed_path() -> Path:
    return Path(get_settings().data_dir) / "demo_user_ana.json"


def _runtime_path() -> Path:
    return Path(get_settings().runtime_dir) / "state.json"


def resolve_dates(node: Any, base: date) -> Any:
    """Replace relative date tokens (in values and keys) with ISO dates relative to `base`."""
    if isinstance(node, dict):
        return {resolve_dates(k, base): resolve_dates(v, base) for k, v in node.items()}
    if isinstance(node, list):
        return [resolve_dates(v, base) for v in node]
    if isinstance(node, str):
        m = _RELATIVE_DAY.match(node)
        if m:
            n = int(m.group(2) or 0)
            return (base + timedelta(days=-n if m.group(1) == "-" else n)).isoformat()
        return _YEAR.sub(lambda y: str(base.year + int(y.group(1) or 0)), node)
    return node


def load_seed(base: date | None = None) -> UserState:
    base = base or clock.base_date()
    raw = resolve_dates(json.loads(_seed_path().read_text(encoding="utf-8")), base)
    # Too early in the year for the story: drop stays that would end before they start.
    raw["trips"] = [t for t in raw["trips"] if not t.get("end_date") or t["end_date"] >= t["start_date"]]
    # Only invoices and expenses that have already happened.
    for key in ("invoices", "expenses"):
        raw[key] = [x for x in raw[key] if x["date"] <= base.isoformat()]
    state = UserState.model_validate(raw)
    state.seed_date = base
    return state


def get_state() -> UserState:
    global _state
    with _lock:
        if _state is None:
            rp = _runtime_path()
            saved = UserState.model_validate(json.loads(rp.read_text(encoding="utf-8"))) if rp.exists() else None
            if saved is not None and saved.seed_date == clock.base_date():
                _state = saved
                clock.set_offset(_state.clock_offset_days)
            else:  # first run, or the saved state was seeded on another day
                from .services import initialise_seed  # local import: services depends on store
                _state = initialise_seed(load_seed())
                save()
        return _state


def set_state(state: UserState) -> None:
    global _state
    with _lock:
        _state = state
        save()


def save() -> None:
    with _lock:
        if _state is None:
            return
        rp = _runtime_path()
        rp.parent.mkdir(parents=True, exist_ok=True)
        tmp = rp.with_suffix(".tmp")
        tmp.write_text(_state.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(rp)


def lock() -> threading.RLock:
    return _lock
