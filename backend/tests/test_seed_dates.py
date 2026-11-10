"""The relative seed tells the same story on any demo day (from 19/08, when Medellín and Lisboa fit, to 17/11,
the last day on which two more months in Lisboa still cross 183 days within the same year)."""
from datetime import date, timedelta

import pytest

from app.engine import days as days_mod
from app.engine.budget import get_day_budget
from app.engine.residency import get_residency_status
from app.engine.simulate import simulate_stay
from app.store import load_seed, resolve_dates

DEMO_DAYS = [date(2026, 8, 19), date(2026, 10, 1), date(2026, 11, 12), date(2026, 11, 17), date(2027, 9, 30)]


def test_resolve_dates_tokens():
    base = date(2026, 11, 12)
    assert resolve_dates({"{Y-1}": ["today", "today-139", "today+13", "{Y}-01-01"]}, base) == {
        "2025": ["2026-11-12", "2026-06-26", "2026-11-25", "2026-01-01"]}
    assert resolve_dates("Coworking today", base) == "Coworking today"


@pytest.mark.parametrize("base", DEMO_DAYS, ids=str)
def test_ana_story_holds_on_any_demo_day(base):
    s = load_seed(base)
    assert s.user.prior_tax_residence == {str(base.year - 1): "ES"}
    assert days_mod.days_in_calendar_year(s.trips, "ES", base.year, base) == 90
    assert days_mod.days_in_calendar_year(s.trips, "PT", base.year, base) == 140
    assert all(i.date <= base for i in s.invoices) and all(e.date <= base for e in s.expenses)

    res = get_residency_status(s.trips, s.user, s.answers, base.year, base)
    assert {c.country for c in res.claims} == {"ES"}

    pt = next(i for i in get_day_budget(s.trips, s.planned_trips, base.year, base, False).items if i.country == "PT")
    assert (pt.days_used, pt.days_left) == (140, 43)

    sim = simulate_stay(s.trips, s.planned_trips, s.user, s.answers, base, "PT", 60, None, 0, 0)
    assert sim.crosses_threshold and sim.cross_date == base + timedelta(days=44)
    assert {c.country for c in sim.after.claims} == {"ES", "PT"}


def test_state_saved_on_another_day_is_reseeded(client):
    from app import clock, store

    with store.lock():
        store.get_state().seed_date = clock.base_date() - timedelta(days=1)
        store.save()
        store._state = None  # simulate a restart the next day
    assert store.get_state().seed_date == clock.base_date()
    assert client.get("/api/tools/days").json()["days"]["PT"] == 140
