"""FastAPI entry point."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import clock, dossier, invoices, state, tools, trips
from .voice import signed_url

settings = get_settings()
app = FastAPI(title="Rumbo API", version="0.1.0",
              description="Motor determinista de residencia fiscal para nómadas digitales. "
                          "Estimaciones orientativas: confírmalas con un asesor.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])

for r in (tools.router, state.router, trips.router, invoices.router, clock.router, dossier.router, signed_url.router):
    app.include_router(r)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"ok": True, "version": app.version,
            "modes": {"anthropic": settings.anthropic_enabled, "elevenlabs": settings.elevenlabs_enabled}}
