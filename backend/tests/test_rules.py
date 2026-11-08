from datetime import date

from app.engine import days as days_mod
from app.engine.residency import NO_RESIDENCE_WARNING_ES, get_residency_status
from app.engine.rules import all_rules
from tests.helpers import profile, stay_days, trip

AS_OF = date(2026, 12, 31)


def status_for(res, country):
    return {c.country for c in res.claims}, [e for e in res.evaluations if e.country == country]


def test_th_179_not_resident_180_resident():
    r179 = get_residency_status([stay_days("TH", "2026-01-01", 179)], profile(), {}, 2026, AS_OF)
    r180 = get_residency_status([stay_days("TH", "2026-01-01", 180)], profile(), {}, 2026, AS_OF)
    assert "TH" not in {c.country for c in r179.claims}
    assert "TH" in {c.country for c in r180.claims}


def test_co_window_spanning_two_years():
    trips = [stay_days("CO", "2025-09-23", 100), stay_days("CO", "2026-01-01", 90)]
    # 100 days ending 2025-12-31 + 90 days in 2026 = 190 > 183 within 365 days
    assert trips[0].end_date == date(2025, 12, 31)
    res = get_residency_status(trips, profile(), {}, 2026, AS_OF)
    assert "CO" in {c.country for c in res.claims}
    assert days_mod.days_in_calendar_year(trips, "CO", 2026, AS_OF) == 90


def test_mx_without_answer_needs_answer_not_resident():
    res = get_residency_status([stay_days("MX", "2026-01-01", 200)], profile(), {}, 2026, AS_OF)
    assert "MX" not in {c.country for c in res.claims}
    mx_home = next(e for e in res.evaluations if e.rule_id == "MX_HOME")
    assert mx_home.status == "needs_answer"
    assert any(q.question_key == "has_home_in_MX" for q in res.pending_questions)


def test_mx_home_answer_makes_resident():
    res = get_residency_status([stay_days("MX", "2026-01-01", 20)], profile(), {"has_home_in_MX": True}, 2026, AS_OF)
    assert "MX" in {c.country for c in res.claims}


def test_pt_habitual_home_with_140_days():
    trips = [stay_days("PT", "2026-04-01", 140)]
    res = get_residency_status(trips, profile(), {"has_habitual_home_in_PT": True}, 2026, AS_OF)
    claim = next(c for c in res.claims if c.country == "PT")
    assert claim.rule_id == "PT_HABITUAL_HOME"


def test_no_country_claims_shows_warning():
    trips = [stay_days("TH", "2026-01-01", 100), stay_days("CO", "2026-05-01", 100)]
    res = get_residency_status(trips, profile(), {}, 2026, AS_OF)
    assert res.claims == []
    assert NO_RESIDENCE_WARNING_ES in res.warnings_es
    assert "No ser residente en ningún país" in NO_RESIDENCE_WARNING_ES


def test_entry_exit_day_counts_in_both_countries():
    trips = [trip("ES", "2026-01-01", "2026-01-10"), trip("PT", "2026-01-10", "2026-01-20")]
    assert days_mod.days_in_calendar_year(trips, "ES", 2026, AS_OF) == 10
    assert days_mod.days_in_calendar_year(trips, "PT", 2026, AS_OF) == 11
    assert days_mod.days_in_calendar_year(trips, "ES", 2026, AS_OF, count_entry_exit=False) == 9


def test_ongoing_trip_counts_until_clock():
    trips = [trip("PT", "2026-04-01", None)]
    assert days_mod.days_in_calendar_year(trips, "PT", 2026, date(2026, 8, 18)) == 140


def test_dual_residency_has_tie_breakers():
    trips = [stay_days("TH", "2026-01-01", 182), stay_days("PT", "2026-07-02", 183)]
    res = get_residency_status(trips, profile(), {"has_habitual_home_in_PT": True}, 2026, AS_OF)
    assert res.dual_residency
    assert [t.order for t in res.tie_breakers] == [1, 2, 3, 4]
    assert res.confidence == "baja"  # rules are not verified yet


def test_all_rules_have_source_url_and_list_unverified():
    rules = all_rules()
    assert rules, "no rules loaded"
    for r in rules:
        assert r.source_url.startswith("https://"), r.id
    unverified = [r.id for r in rules if r.verified_at is None]
    print("\nReglas pendientes de verificar (verified_at = null):", ", ".join(unverified) or "ninguna")
