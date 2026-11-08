from __future__ import annotations

from fastapi import APIRouter

from .. import services
from ..models import FullState

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state", response_model=FullState)
def get_state():
    return services.full_state()
