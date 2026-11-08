import time
from pathlib import Path

import pytest

SAMPLES = Path(__file__).resolve().parent.parent / "data" / "samples"

TOOL_CALLS = [
    ("get", "/api/tools/days", None),
    ("get", "/api/tools/residency", None),
    ("get", "/api/tools/budget", None),
    ("post", "/api/tools/simulate", {"country": "PT", "extra_days": 60}),
    ("get", "/api/tools/reserve", None),
    ("post", "/api/tools/expenses", {"concept": "Software", "amount_eur": 12.5, "country": "PT"}),
    ("post", "/api/tools/answers", {"question_key": "main_economic_interests_in_ES", "value": True}),
    ("get", "/api/tools/alerts", None),
    ("post", "/api/tools/dossier", None),
]


@pytest.mark.parametrize("method,url,body", TOOL_CALLS)
def test_tool_endpoints_under_300ms(client, method, url, body):
    getattr(client, method)(url, json=body) if body else getattr(client, method)(url)  # warm-up
    t0 = time.perf_counter()
    r = getattr(client, method)(url, json=body) if body else getattr(client, method)(url)
    elapsed = (time.perf_counter() - t0) * 1000
    assert r.status_code == 200, r.text
    assert elapsed < 300, f"{url} took {elapsed:.0f} ms"


def test_dossier_pdf_is_served(client):
    d = client.post("/api/tools/dossier").json()
    assert any("Certificado de residencia fiscal en Portugal" in x for x in d["missing_documents_es"])
    assert d["url"].startswith("http") and d["url"].endswith(d["path"])
    pdf = client.get(d["path"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert client.get("/api/dossier/../../etc.pdf").status_code == 404


@pytest.mark.parametrize("sample,country,start,end", [
    ("vuelo_lisboa_medellin.txt", "CO", "2026-10-15", None),
    ("alojamiento_bangkok.txt", "TH", "2026-12-16", "2027-03-15"),
    ("airbnb_cdmx.txt", "MX", "2027-01-08", "2027-02-26"),
])
def test_mock_booking_parser(client, sample, country, start, end):
    r = client.post("/api/trips/parse", json={"text": (SAMPLES / sample).read_text(encoding="utf-8")}).json()
    assert r["mode"] == "mock"
    t = r["trips"][0]
    assert (t["country_iso2"], t["start_date"], t["end_date"]) == (country, start, end)
    assert t["needs_review"] == (end is None)


def test_parse_never_saves(client):
    before = client.get("/api/state").json()
    client.post("/api/trips/parse", json={"text": (SAMPLES / "alojamiento_bangkok.txt").read_text(encoding="utf-8")})
    after = client.get("/api/state").json()
    assert before["trips"] == after["trips"] and before["planned_trips"] == after["planned_trips"]


def test_confirmed_trip_is_saved_as_planned(client):
    r = client.post("/api/trips", json={"country": "MX", "city": "Ciudad de México", "start_date": "2027-01-08",
                                        "end_date": "2027-02-26", "source": "parsed"})
    assert r.status_code == 200
    planned = client.get("/api/state").json()["planned_trips"]
    assert any(t["id"] == r.json()["id"] for t in planned)


def test_invalid_trip_dates_rejected(client):
    r = client.post("/api/trips", json={"country": "MX", "start_date": "2027-02-26", "end_date": "2027-01-08"})
    assert r.status_code == 422


def test_signed_url_unavailable_without_key(client):
    assert client.get("/api/voice/signed-url").status_code == 404
