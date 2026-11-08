from __future__ import annotations

from fastapi import APIRouter

from .. import services
from ..models import InvoiceCreate, InvoiceResult

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.post("", response_model=InvoiceResult, summary="Create an invoice and move its tax reserve to the piggy bank")
def create_invoice(req: InvoiceCreate):
    return services.create_invoice(req)
