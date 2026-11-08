"""Signed URL for a private ElevenLabs agent, so the API key never reaches the browser."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException

from ..config import get_settings

router = APIRouter(prefix="/api/voice", tags=["voice"])

ELEVENLABS_SIGNED_URL = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"


@router.get("/signed-url")
def signed_url() -> dict:
    s = get_settings()
    if not s.elevenlabs_enabled:
        raise HTTPException(404, "Voz real no configurada: usa el modo simulado.")
    try:
        r = httpx.get(ELEVENLABS_SIGNED_URL, params={"agent_id": s.elevenlabs_agent_id},
                      headers={"xi-api-key": s.elevenlabs_api_key}, timeout=10)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No se pudo obtener la URL firmada de ElevenLabs: {exc}") from exc
    return {"signed_url": r.json()["signed_url"]}
