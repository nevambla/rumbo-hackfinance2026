from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from ..config import get_settings

from .. import services
from ..booking.parser import parse_booking
from ..models import ParseRequest, ParseResult, Trip, TripCreate

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.post("", response_model=Trip, summary="Add a trip (after the user confirms it)")
def create_trip(req: TripCreate):
    return services.add_trip(req)


@router.post("/parse", response_model=ParseResult, summary="Paste a booking: returns a proposal, never saves")
def parse_trip(req: ParseRequest):
    return parse_booking(req.text)


@router.get("/samples", summary="Sample booking emails for the demo")
def booking_samples() -> list[dict]:
    folder = Path(get_settings().data_dir) / "samples"
    labels = {"vuelo_lisboa_medellin": "Vuelo Lisboa → Medellín", "alojamiento_bangkok": "Alojamiento en Bangkok",
              "airbnb_cdmx": "Alquiler en Ciudad de México"}
    return [{"id": p.stem, "label": labels.get(p.stem, p.stem), "text": p.read_text(encoding="utf-8")}
            for p in sorted(folder.glob("*.txt"))]
