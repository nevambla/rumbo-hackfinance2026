"""Day budget: how many days are left per country before a day rule is met."""
from __future__ import annotations

from datetime import date, timedelta

from ..countries import name_es
from ..models import BudgetItem, DayBudget, Trip
from . import days as days_mod
from .rules import day_rule, load_rules, max_allowed

WARN_DAYS = 45


def projection_trips(trips: list[Trip], planned: list[Trip], as_of: date) -> list[Trip]:
    """Actual trips plus planned ones; ongoing trips run until their expected end
    (or until the day before the next planned departure)."""
    out: list[Trip] = []
    next_start = min((p.start_date for p in planned if p.start_date > as_of), default=None)
    for t in trips:
        if t.end_date is None:
            end = t.expected_end_date or (next_start - timedelta(days=1) if next_start else as_of)
            out.append(t.model_copy(update={"end_date": max(end, as_of)}))
        else:
            out.append(t)
    out.extend(planned)
    return out


def _count(trips: list[Trip], rule, year: int, as_of: date) -> int:
    p = rule.params
    cee = p.get("count_entry_exit", True)
    if rule.type == "rolling_window_days":
        return days_mod.max_days_in_rolling_window(trips, rule.country, p["window_days"], year, as_of, cee)[0]
    return days_mod.days_in_calendar_year(trips, rule.country, year, as_of, cee)


def get_day_budget(trips: list[Trip], planned: list[Trip], year: int, as_of: date,
                   has_foreign_certificate: bool | None = None) -> DayBudget:
    items: list[BudgetItem] = []
    proj = projection_trips(trips, planned, as_of)
    far = date(year + 1, 12, 31)
    for country in load_rules():
        rule = day_rule(country)
        if rule is None:
            continue
        p = rule.params
        thr, cmp = p["threshold"], p["comparator"]
        window = p.get("window_days") if rule.type == "rolling_window_days" else None
        used = _count(trips, rule, year, as_of)
        used_planned = _count(proj, rule, year, far)
        allowed = max_allowed(thr, cmp)
        left = max(0, allowed - used)
        left_planned = max(0, allowed - used_planned)
        cross = days_mod.first_day_exceeding(proj, country, allowed + 1, far, window, year, p.get("count_entry_exit", True))
        if cross and cross <= as_of:
            cross = None
        cname = name_es(country)
        if used > allowed:
            status = "crossed"
            msg = f"Has superado el umbral en {cname}: {used} días (límite {thr})."
        elif left <= WARN_DAYS or cross:
            status = "warn"
            msg = f"Te quedan {left} días en {cname}."
            if cross:
                msg += f" Con tus planes, cruzarías el umbral el {cross.strftime('%d/%m/%Y')}."
        else:
            status = "ok"
            msg = f"Te quedan {left} días en {cname}."
        note = None
        if rule.type == "sporadic_absences" and has_foreign_certificate is not True:
            note = ("Sin certificado de residencia fiscal en otro país, España suma tus ausencias: "
                    "este contador solo muestra tus días físicos en España.")
        items.append(BudgetItem(country=country, country_name_es=cname, rule_id=rule.id, threshold=thr,
                                comparator=cmp, window_days=window, days_used=used, days_left=left,
                                days_used_with_planned=used_planned, days_left_with_planned=left_planned,
                                projected_cross_date=cross, status=status, message_es=msg, note_es=note,
                                source_url=rule.source_url, verified=rule.verified_at is not None))
    items.sort(key=lambda i: (-i.days_used, i.days_left))
    return DayBudget(year=year, as_of=as_of, items=items)
