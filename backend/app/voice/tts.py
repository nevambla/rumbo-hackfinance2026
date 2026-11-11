"""Text to speech with the SAME voice as the ElevenLabs agent (e.g. "Listen" on alerts).

The voice, model and voice settings are read from the agent's configuration, so whatever
voice is chosen in the ElevenLabs panel is also used here. The API key never reaches the browser.
The API key needs the `text_to_speech` permission (ElevenLabs → Developers → API keys).
"""
from __future__ import annotations

from functools import lru_cache

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..config import get_settings

router = APIRouter(prefix="/api/voice", tags=["voice"])

ELEVENLABS_API = "https://api.elevenlabs.io/v1"
FALLBACK_MODEL = "eleven_multilingual_v2"
_audio_cache: dict[str, bytes] = {}  # alerts repeat: avoid paying for the same audio twice


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)


@lru_cache(maxsize=4)
def _agent_voice(agent_id: str, api_key: str) -> dict:
    """voice_id, model_id and voice settings of the agent (cached for the process lifetime)."""
    r = httpx.get(f"{ELEVENLABS_API}/convai/agents/{agent_id}", headers={"xi-api-key": api_key}, timeout=10)
    r.raise_for_status()
    tts = r.json().get("conversation_config", {}).get("tts", {})
    if not tts.get("voice_id"):
        raise HTTPException(502, "El agente de ElevenLabs no tiene una voz configurada.")
    return {
        "voice_id": tts["voice_id"],
        "model_id": tts.get("model_id") or FALLBACK_MODEL,
        "voice_settings": {k: tts[k] for k in ("stability", "similarity_boost", "speed") if tts.get(k) is not None},
    }


def _synthesize(api_key: str, voice: dict, model_id: str, text: str) -> httpx.Response:
    return httpx.post(
        f"{ELEVENLABS_API}/text-to-speech/{voice['voice_id']}",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": api_key},
        json={"text": text, "model_id": model_id, "language_code": "es", "voice_settings": voice["voice_settings"]},
        timeout=30,
    )


@router.post("/tts", summary="Speak a text with the agent's voice (audio/mpeg)",
             responses={200: {"content": {"audio/mpeg": {}}}})
def tts(req: TTSRequest) -> Response:
    s = get_settings()
    if not s.elevenlabs_enabled:
        raise HTTPException(404, "Voz de ElevenLabs no configurada.")
    text = req.text.strip()
    if text in _audio_cache:
        return Response(_audio_cache[text], media_type="audio/mpeg")
    try:
        voice = _agent_voice(s.elevenlabs_agent_id, s.elevenlabs_api_key)
        r = _synthesize(s.elevenlabs_api_key, voice, voice["model_id"], text)
        # Some agent-only models may not be available for plain TTS: retry with a standard model.
        if r.status_code in (400, 422) and voice["model_id"] != FALLBACK_MODEL:
            r = _synthesize(s.elevenlabs_api_key, voice, FALLBACK_MODEL, text)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No se pudo generar el audio en ElevenLabs: {exc}") from exc
    if r.status_code in (401, 403):
        # Typically the key lacks the text_to_speech permission. The frontend falls back to the browser voice.
        raise HTTPException(503, "La clave de ElevenLabs no tiene permiso de texto a voz (text_to_speech).")
    if r.status_code != 200:
        raise HTTPException(502, f"ElevenLabs devolvió {r.status_code} al generar el audio.")
    _audio_cache[text] = r.content
    return Response(r.content, media_type="audio/mpeg")
