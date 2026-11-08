"""The three demo scenes for Ana (section 5) plus the certificate case."""
from datetime import date


def claims(res):
    return {c["country"]: c["rule_id"] for c in res["claims"]}


def test_scene1_spain_claims_by_sporadic_absences(client):
    res = client.get("/api/tools/residency").json()
    assert claims(res) == {"ES": "ES_183_SPORADIC"}
    assert res["dual_residency"] is False
    days = client.get("/api/tools/days").json()["days"]
    assert days == {"ES": 90, "PT": 140}


def test_certificate_stops_spain_adding_absences(client):
    client.post("/api/tools/answers", json={"question_key": "has_foreign_residence_certificate", "value": True})
    res = client.get("/api/tools/residency").json()
    assert "ES" not in claims(res)
    es = next(e for e in res["evaluations"] if e["rule_id"] == "ES_183_SPORADIC")
    assert es["status"] == "not_resident"


def test_scene2_simulate_pt_60_days_crosses_on_oct_1_with_dual_residency(client):
    sim = client.post("/api/tools/simulate", json={"country": "PT", "extra_days": 60}).json()
    assert sim["crosses_threshold"] is True
    assert sim["cross_date"] == "2026-10-01"
    assert sim["days_before"] == 140 and sim["days_after"] == 200
    assert sim["after"]["dual_residency"] is True
    assert set(claims(sim["after"])) == {"ES", "PT"}
    assert [t["criterion_key"] for t in sim["after"]["tie_breakers"]] == [
        "permanent_home", "vital_interests", "habitual_abode", "nationality"]
    assert sim["before"]["dual_residency"] is False


def test_scene3_habitual_home_in_lisbon_makes_pt_claim(client):
    r = client.post("/api/tools/answers", json={"question_key": "has_habitual_home_in_PT", "value": True}).json()
    assert claims(r["residency"])["PT"] == "PT_HABITUAL_HOME"
    assert r["residency"]["dual_residency"] is True


def test_day_budget_shows_43_days_left_in_portugal(client):
    items = {i["country"]: i for i in client.get("/api/tools/budget").json()["items"]}
    assert items["PT"]["days_used"] == 140
    assert items["PT"]["days_left"] == 43
    assert items["PT"]["message_es"].startswith("Te quedan 43 días en Portugal")


def test_simulation_does_not_mutate_state(client):
    client.post("/api/tools/simulate", json={"country": "PT", "extra_days": 60})
    assert client.get("/api/tools/days").json()["days"]["PT"] == 140


def test_advance_clock_moves_today(client):
    r = client.post("/api/clock/advance", json={"days": 30}).json()
    assert r["today"] == "2026-09-17"
    assert client.get("/api/tools/days").json()["days"]["PT"] == 170
    assert client.post("/api/demo/reset").json()["clock"]["today"] == str(date(2026, 8, 18))
