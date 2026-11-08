"""Application services: glue between the store, the clock and the pure engine.

Routers stay thin and every computation here is in-memory (tool endpoints < 300 ms).
"""
from __future__ import annotations

import uuid
from datetime import date

from . import clock, store
from .banking.myinvestor_mock import MyInvestorMock
from .config import get_settings
from .countries import MVP_COUNTRIES, name_es
from .engine import days as days_mod
from .engine.budget import get_day_budget
from .engine.residency import get_residency_status
from .engine.simulate import simulate_stay
from .engine.tax import conservative_tax, tax_country_for
from .models import (Alert, AlertList, AnswerRequest, AnswerResult, ClockState, DayBudget, DaysByCountry, Expense,
                     ExpenseRequest, ExpenseResult, FullState, Invoice, InvoiceCreate, InvoiceResult, ResidencyStatus,
                     SimulateRequest, SimulationResult, TaxReserve, Trip, TripCreate, UserState)
from .money import apply_rate, eur_to_cents, format_eur, to_eur_cents

PROVIDER_NOTE_ES = "Cuenta remunerada simulada. El tipo es un valor de demostración, no una oferta real de MyInvestor."


# ------------------------------------------------------------------ helpers
def _year() -> int:
    return clock.today().year


def provider(state: UserState) -> MyInvestorMock:
    return MyInvestorMock(state.piggy, get_settings().mock_savings_rate)


def projected_income_cents(state: UserState, year: int, as_of: date) -> int:
    """Annualised EUR income: average per invoiced month x 12."""
    invoices = [i for i in state.invoices if i.date.year == year and i.date <= as_of]
    if not invoices:
        return 0
    total = sum(to_eur_cents(i.amount_cents, i.currency) for i in invoices)
    months = len({i.date.month for i in invoices})
    return total * 12 // months


def deductible_expenses_cents(state: UserState, year: int, as_of: date) -> int:
    return sum(to_eur_cents(e.amount_cents, e.currency) for e in state.expenses
               if e.deductible and e.date.year == year and e.date <= as_of)


def _fallback_country(state: UserState, year: int) -> str:
    return state.user.prior_tax_residence.get(str(year - 1), state.user.nationality)


def _tax_plan(state: UserState, residency: ResidencyStatus, as_of: date):
    countries = tax_country_for([c.country for c in residency.claims], _fallback_country(state, residency.year))
    income = projected_income_cents(state, residency.year, as_of)
    expenses = deductible_expenses_cents(state, residency.year, as_of)
    country, estimates = conservative_tax(countries, income, expenses)
    return country, estimates[country], income


def initialise_seed(state: UserState) -> UserState:
    """Apply the reserve to each seed invoice and deposit it in the piggy bank."""
    today = clock.today()
    res = get_residency_status(state.trips, state.user, state.answers, today.year, today)
    _, estimate, _ = _tax_plan(state, res, today)
    bank = provider(state)
    for inv in sorted(state.invoices, key=lambda i: i.date):
        if inv.reserved_cents is None:
            inv.reserve_rate = estimate.effective_rate
            inv.reserved_cents = apply_rate(to_eur_cents(inv.amount_cents, inv.currency), estimate.effective_rate)
            bank.deposit(inv.reserved_cents, inv.date, f"Reserva factura {inv.id}")
    return state


# ------------------------------------------------------------------- reads
def days_by_country(year: int | None = None) -> DaysByCountry:
    state = store.get_state()
    today = clock.today()
    year = year or today.year
    countries = sorted({t.country for t in state.trips} | set(MVP_COUNTRIES))
    days = {c: days_mod.days_in_calendar_year(state.trips, c, year, today) for c in countries}
    days = {c: n for c, n in days.items() if n > 0}
    return DaysByCountry(year=year, as_of=today, days=days, country_names_es={c: name_es(c) for c in days})


def residency(year: int | None = None) -> ResidencyStatus:
    state = store.get_state()
    today = clock.today()
    return get_residency_status(state.trips, state.user, state.answers, year or today.year, today)


def budget() -> DayBudget:
    state = store.get_state()
    today = clock.today()
    cert = state.answers.get("has_foreign_residence_certificate")
    return get_day_budget(state.trips, state.planned_trips, today.year, today,
                          cert if isinstance(cert, bool) else None)


def tax_reserve(res: ResidencyStatus | None = None) -> TaxReserve:
    state = store.get_state()
    today = clock.today()
    res = res or residency()
    country, estimate, income = _tax_plan(state, res, today)
    bank = provider(state)
    reserved = bank.principal(today)
    interest = bank.accrued_interest(today)
    pending = max(0, estimate.amount_cents - reserved)
    summary = f"Hucha fiscal (MyInvestor): {format_eur(reserved)} · +{format_eur(interest)} de intereses"
    return TaxReserve(as_of=today, tax_country=country, tax_country_name_es=name_es(country),
                      projected_annual_income_cents=income, reserved_cents=reserved,
                      estimated_cents=estimate.amount_cents, pending_cents=pending, interest_cents=interest,
                      balance_cents=reserved + interest, savings_rate=bank.annual_rate, provider_name=bank.name,
                      provider_note_es=PROVIDER_NOTE_ES, effective_rate=estimate.effective_rate,
                      is_estimate=estimate.is_estimate, source_url=estimate.source_url, summary_es=summary)


def alerts(res: ResidencyStatus | None = None, bud: DayBudget | None = None,
           reserve: TaxReserve | None = None) -> AlertList:
    state = store.get_state()
    today = clock.today()
    res = res or residency()
    bud = bud or budget()
    reserve = reserve or tax_reserve(res)
    out: list[Alert] = []
    claimed = {c.country for c in res.claims}

    if res.dual_residency:
        names = " y ".join(c.country_name_es for c in res.claims)
        out.append(Alert(id="dual_residency", level="danger", title_es="Doble residencia fiscal",
                         message_es=f"{names} te consideran residente a la vez. Decide el convenio: "
                                    f"empieza por dónde tienes vivienda permanente."))
    for item in bud.items:
        if item.days_used == 0 and item.days_used_with_planned == 0:
            continue
        if item.status == "crossed":
            if item.country in claimed:
                out.append(Alert(id=f"crossed_{item.country}", level="danger",
                                 title_es=f"Umbral superado en {item.country_name_es}",
                                 message_es=item.message_es, country=item.country, rule_id=item.rule_id,
                                 source_url=item.source_url))
        elif item.status == "warn":
            out.append(Alert(id=f"budget_{item.country}", level="warn",
                             title_es=f"Te quedan {item.days_left} días en {item.country_name_es}",
                             message_es=item.message_es + " Antes de alargar la estancia, simúlalo.",
                             country=item.country, rule_id=item.rule_id, source_url=item.source_url))
    if state.answers.get("has_foreign_residence_certificate") is False:
        out.append(Alert(id="missing_certificate", level="warn",
                         title_es="Te falta el certificado de residencia fiscal",
                         message_es="Sin un certificado de residencia fiscal de otro país, España suma tus ausencias "
                                    "como días en España.", country="ES", rule_id="ES_183_SPORADIC",
                         source_url="https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764"))
    for q in res.pending_questions:
        out.append(Alert(id=f"question_{q.question_key}", level="info", title_es="Pregunta pendiente",
                         message_es=q.question_es, country=q.country, rule_id=q.rule_id))
    if any(p.country == "TH" for p in state.planned_trips):
        out.append(Alert(id="notice_TH", level="info", title_es="Tailandia: renta extranjera",
                         message_es="Si llegas a ser residente en Tailandia, la renta extranjera tributa cuando la "
                                    "ingresas allí (desde 2024). Pendiente de verificar.", country="TH"))
    if reserve.pending_cents > 0:
        out.append(Alert(id="reserve_pending", level="info", title_es="Reserva de impuestos",
                         message_es=f"Te faltan {format_eur(reserve.pending_cents)} por apartar para llegar a la "
                                    f"estimación anual ({format_eur(reserve.estimated_cents)}).", country=reserve.tax_country))
    order = {"danger": 0, "warn": 1, "info": 2}
    out.sort(key=lambda a: order[a.level])
    return AlertList(as_of=today, alerts=out)


def clock_state() -> ClockState:
    return ClockState(today=clock.today(), base_date=clock.base_date(), offset_days=clock.offset_days())


def full_state() -> FullState:
    state = store.get_state()
    res = residency()
    bud = budget()
    reserve = tax_reserve(res)
    s = get_settings()
    return FullState(clock=clock_state(), user=state.user, trips=state.trips, planned_trips=state.planned_trips,
                     invoices=state.invoices, expenses=state.expenses, answers=state.answers,
                     days=days_by_country(), residency=res, budget=bud, reserve=reserve,
                     alerts=alerts(res, bud, reserve),
                     modes={"anthropic": s.anthropic_enabled, "elevenlabs": s.elevenlabs_enabled})


# ------------------------------------------------------------------ writes
def simulate(req: SimulateRequest) -> SimulationResult:
    state = store.get_state()
    today = clock.today()
    return simulate_stay(state.trips, state.planned_trips, state.user, state.answers, today, req.country,
                         req.extra_days, req.start_date, projected_income_cents(state, today.year, today),
                         deductible_expenses_cents(state, today.year, today))


def answer(req: AnswerRequest) -> AnswerResult:
    value = req.value
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "si", "sí", "yes"):
            value = True
        elif low in ("false", "no"):
            value = False
        else:
            value = value.strip().upper() if len(value.strip()) == 2 else value.strip().lower()
    with store.lock():
        state = store.get_state()
        state.answers[req.question_key] = value
        store.save()
    return AnswerResult(question_key=req.question_key, value=value, residency=residency())


def register_expense(req: ExpenseRequest) -> ExpenseResult:
    with store.lock():
        state = store.get_state()
        exp = Expense(id=f"exp-{uuid.uuid4().hex[:8]}", date=clock.today(), concept=req.concept.strip(),
                      amount_cents=eur_to_cents(req.amount_eur), currency="EUR", country=req.country,
                      category=_categorise(req.concept), deductible=True)
        state.expenses.append(exp)
        store.save()
    msg = (f"Registrado: {exp.concept}, {format_eur(exp.amount_cents, decimals=True)} en {name_es(exp.country)} "
           f"el {exp.date.strftime('%d/%m/%Y')}, como gasto deducible de la actividad.")
    return ExpenseResult(expense=exp, deductible=True, message_es=msg)


def _categorise(concept: str) -> str:
    c = concept.lower()
    for key, cat in (("cowork", "coworking"), ("software", "software"), ("licencia", "software"),
                     ("vuelo", "viajes"), ("tren", "viajes"), ("portátil", "equipo"), ("ordenador", "equipo"),
                     ("internet", "suministros"), ("móvil", "suministros")):
        if key in c:
            return cat
    return "otros"


def create_invoice(req: InvoiceCreate) -> InvoiceResult:
    with store.lock():
        state = store.get_state()
        today = clock.today()
        res = residency()
        _, estimate, _ = _tax_plan(state, res, today)
        eur = to_eur_cents(req.amount_cents, req.currency)
        reserved = apply_rate(eur, estimate.effective_rate)
        inv = Invoice(id=f"inv-{uuid.uuid4().hex[:8]}", date=req.date or today, client=req.client,
                      client_country=req.client_country.upper(), amount_cents=req.amount_cents,
                      currency=req.currency.upper(), reserve_rate=estimate.effective_rate, reserved_cents=reserved)
        state.invoices.append(inv)
        if reserved > 0:
            provider(state).deposit(reserved, inv.date, f"Reserva factura {inv.id}")
        store.save()
    pct = (estimate.effective_rate * 100).quantize(1)
    return InvoiceResult(invoice=inv, reserved_cents=reserved,
                         message_es=f"Apartados {format_eur(reserved, decimals=True)} ({pct} %) en tu hucha fiscal.")


def add_trip(req: TripCreate) -> Trip:
    with store.lock():
        state = store.get_state()
        today = clock.today()
        planned = req.planned if req.planned is not None else req.start_date > today
        trip = Trip(id=f"trip-{uuid.uuid4().hex[:8]}", country=req.country, city=req.city,
                    start_date=req.start_date, end_date=req.end_date, source=req.source)
        (state.planned_trips if planned else state.trips).append(trip)
        store.save()
    return trip


def reset_demo() -> FullState:
    clock.reset()
    store.set_state(initialise_seed(store.load_seed()))
    return full_state()


def advance_clock(days: int) -> ClockState:
    """Advance the demo clock and move planned trips that have started into the actual trips."""
    clock.advance(days)
    today = clock.today()
    with store.lock():
        state = store.get_state()
        state.clock_offset_days = clock.offset_days()
        started = [p for p in state.planned_trips if p.start_date <= today]
        if started:
            for p in sorted(started, key=lambda t: t.start_date):
                for t in state.trips:  # close the ongoing trip the day the next one starts
                    if t.end_date is None and t.start_date < p.start_date:
                        t.end_date = p.start_date
                state.trips.append(p)
                state.planned_trips.remove(p)
        store.save()
    return clock_state()
