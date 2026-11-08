"""In-memory state of the demo user, persisted as JSON under data/runtime/."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from .config import get_settings
from .models import UserState

_lock = threading.RLock()
_state: UserState | None = None


def _seed_path() -> Path:
    return Path(get_settings().data_dir) / "demo_user_ana.json"


def _runtime_path() -> Path:
    return Path(get_settings().runtime_dir) / "state.json"


def load_seed() -> UserState:
    return UserState.model_validate(json.loads(_seed_path().read_text(encoding="utf-8")))


def get_state() -> UserState:
    global _state
    with _lock:
        if _state is None:
            rp = _runtime_path()
            if rp.exists():
                _state = UserState.model_validate(json.loads(rp.read_text(encoding="utf-8")))
                from . import clock
                clock.set_offset(_state.clock_offset_days)
            else:
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
