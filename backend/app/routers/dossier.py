from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..dossier.pdf import dossier_path

router = APIRouter(prefix="/api/dossier", tags=["dossier"])


@router.get("/{dossier_id}.pdf", response_class=FileResponse)
def get_dossier(dossier_id: str):
    if not re.fullmatch(r"[a-f0-9]{12}", dossier_id):
        raise HTTPException(404)
    path = dossier_path(dossier_id)
    if not path.exists():
        raise HTTPException(404, "Expediente no encontrado")
    return FileResponse(path, media_type="application/pdf", filename=f"expediente-rumbo-{dossier_id}.pdf")
