"""What-if simulation: clone the trips, extend or add a stay, recompute."""
from __future__ import annotations

from datetime import date, timedelta

from ..countries import name_es
from ..models import AnswerValue, SimulationResult, Trip, UserProfile
from . import days as days_mod
from .residency import get_residency_status
from .rules import day_rule, max_allowed, meets
from .tax import conservative_tax, tax_country_for


def _current_trip(trips: list[Trip], today: date) -> Trip | None:
    for t in trips:
        if t.start_date <= today and (t.end_date is None or t.end_date >= today):
            return t
    return None


def build_simulated_trips(trips: list[Trip], country: str, extra_days: int, today: date,
                          start_date: date | None) -> tuple[list[Trip], date, date]:
    sim = [t.model_copy(deep=True) for t in trips]
    current = _current_trip(sim, today)
    if start_date is None and current is not None and current.country == country:
        start = today + timedelta(days=1)
        end = today + timedelta(days=extra_days)
        idx = sim.index(current)
        sim[idx] = current.model_copy(update={"end_date": end})
        return sim, start, end
    start = start_date or today + timedelta(days=1)
    end = start + timedelta(days=extra_days - 1)
    if current is not None and current.country != country and current.end_date is None:
        idx = sim.index(current)
        sim[idx] = current.model_copy(update={"end_date": max(current.start_date, start)})
    sim.append(Trip(id="simulated", country=country, city="", start_date=start, end_date=end, source="manual"))
    return sim, start, end


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def simulate_stay(trips: list[Trip], planned: list[Trip], profile: UserProfile, answers: dict[str, AnswerValue],
                  today: date, country: str, extra_days: int, start_date: date | None,
                  income_cents: int, expenses_cents: int) -> SimulationResult:
    country = country.upper()
    year = today.year
    sim_trips, sim_start, sim_end = build_simulated_trips(trips, country, extra_days, today, start_date)
    as_of_after = max(today, sim_end)
    before = get_residency_status(trips, profile, answers, year, today)
    after = get_residency_status(sim_trips, profile, answers, year, min(as_of_after, date(year, 12, 31)))

    rule = day_rule(country)
    days_before = days_after = 0
    threshold = None
    crosses = False
    cross_date = None
    if rule is not None:
        p = rule.params
        threshold = p["threshold"]
        window = p.get("window_days") if rule.type == "rolling_window_days" else None
        cee = p.get("count_entry_exit", True)
        if window:
            days_before = days_mod.max_days_in_rolling_window(trips, country, window, year, today, cee)[0]
            days_after = days_mod.max_days_in_rolling_window(sim_trips, country, window, year, as_of_after, cee)[0]
        else:
            days_before = days_mod.days_in_calendar_year(trips, country, year, today, cee)
            days_after = days_mod.days_in_calendar_year(sim_trips, country, year, as_of_after, cee)
        crosses = not meets(days_before, threshold, p["comparator"]) and meets(days_after, threshold, p["comparator"])
        if crosses:
            cross_date = days_mod.first_day_exceeding(sim_trips, country, max_allowed(threshold, p["comparator"]) + 1,
                                                      as_of_after, window, year, cee)
    else:
        days_before = days_mod.days_in_calendar_year(trips, country, year, today)
        days_after = days_mod.days_in_calendar_year(sim_trips, country, year, as_of_after)

    fallback = profile.prior_tax_residence.get(str(year - 1), profile.nationality)
    c_before, est_before = conservative_tax(tax_country_for([c.country for c in before.claims], fallback),
                                            income_cents, expenses_cents)
    c_after, est_after = conservative_tax(tax_country_for([c.country for c in after.claims], fallback),
                                          income_cents, expenses_cents)
    tax_before = est_before[c_before].amount_cents
    tax_after = est_after[c_after].amount_cents

    overlaps = [f"{p.city or name_es(p.country)} ({_fmt(p.start_date)})" for p in planned
                if p.start_date <= sim_end and (p.end_date or p.start_date) >= sim_start]

    cname = name_es(country)
    parts = [f"Con {extra_days} días más en {cname} llegarías a {days_after} días."]
    if crosses and cross_date:
        parts.append(f"Superarías el umbral de {threshold} días el {_fmt(cross_date)} y {cname} te consideraría residente fiscal.")
    elif rule is not None and threshold is not None and not crosses:
        if meets(days_before, threshold, rule.params["comparator"]):
            parts.append(f"Ya superabas el umbral de {threshold} días en {cname}.")
        else:
            parts.append(f"Seguirías por debajo del umbral de {threshold} días en {cname}.")
    elif rule is None:
        parts.append(f"{cname} no usa una regla de días: depende de dónde tengas tu casa habitación.")
    if after.dual_residency:
        others = ", ".join(c.country_name_es for c in after.claims)
        parts.append(f"Tendrías doble residencia ({others}): decide el convenio, empezando por dónde tienes vivienda permanente.")
    elif after.claims:
        parts.append(f"Residencia estimada: {', '.join(c.country_name_es for c in after.claims)}.")
    if overlaps:
        parts.append(f"Ojo: se solapa con tu viaje planificado a {', '.join(overlaps)}.")
    parts.append("Es una estimación; confírmalo con un asesor.")

    return SimulationResult(
        country=country, extra_days=extra_days, start_date=sim_start, end_date=sim_end,
        before=before, after=after, crosses_threshold=crosses, cross_date=cross_date,
        days_before=days_before, days_after=days_after, threshold=threshold,
        tax_country_before=c_before, tax_country_after=c_after,
        tax_before_cents=tax_before, tax_after_cents=tax_after, tax_delta_cents=tax_after - tax_before,
        tax_by_country_after_cents={c: e.amount_cents for c, e in est_after.items()},
        tax_is_estimate=any(e.is_estimate for e in [*est_before.values(), *est_after.values()]),
        overlaps_planned_es=overlaps, explanation_es=" ".join(parts),
    )
