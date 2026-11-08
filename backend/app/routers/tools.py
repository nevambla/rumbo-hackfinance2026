"""Endpoints backing the voice agent's client tools. In-memory only (< 300 ms)."""
from __future__ import annotations

from fastapi import APIRouter, Query

from .. import services
from ..dossier.pdf import generate_dossier
from ..models import (AlertList, AnswerRequest, AnswerResult, DayBudget, DaysByCountry, DossierResult, ExpenseRequest,
                      ExpenseResult, ResidencyStatus, SimulateRequest, SimulationResult, TaxReserve)

router = APIRouter(prefix="/api/tools", tags=["agent tools"])


@router.get("/days", response_model=DaysByCountry, summary="get_days_by_country")
def get_days_by_country(year: int | None = Query(None, ge=2000, le=2100)):
    return services.days_by_country(year)


@router.get("/residency", response_model=ResidencyStatus, summary="get_residency_status")
def get_residency_status(year: int | None = Query(None, ge=2000, le=2100)):
    return services.residency(year)


@router.get("/budget", response_model=DayBudget, summary="get_day_budget")
def get_day_budget():
    return services.budget()


@router.post("/simulate", response_model=SimulationResult, summary="simulate_stay")
def simulate_stay(req: SimulateRequest):
    return services.simulate(req)


@router.get("/reserve", response_model=TaxReserve, summary="get_tax_reserve")
def get_tax_reserve():
    return services.tax_reserve()


@router.post("/expenses", response_model=ExpenseResult, summary="register_expense")
def register_expense(req: ExpenseRequest):
    return services.register_expense(req)


@router.post("/answers", response_model=AnswerResult, summary="answer_question")
def answer_question(req: AnswerRequest):
    return services.answer(req)


@router.get("/alerts", response_model=AlertList, summary="get_alerts")
def get_alerts():
    return services.alerts()


@router.post("/dossier", response_model=DossierResult, summary="generate_dossier")
def create_dossier():
    return generate_dossier()
