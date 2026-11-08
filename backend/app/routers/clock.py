from __future__ import annotations

from fastapi import APIRouter

from .. import services
from ..models import AdvanceRequest, ClockState, FullState

router = APIRouter(prefix="/api", tags=["demo clock"])


@router.get("/clock", response_model=ClockState)
def get_clock():
    return services.clock_state()


@router.post("/clock/advance", response_model=ClockState)
def advance_clock(req: AdvanceRequest):
    return services.advance_clock(req.days)


@router.post("/demo/reset", response_model=FullState)
def reset_demo():
    return services.reset_demo()
