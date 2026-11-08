"""Export the API contract to contract/:

- contract/openapi.json         OpenAPI schema (source of truth for types)
- contract/examples/*.json      real responses for the demo user (Ana, 2026-08-18) so a
                                frontend can be built against fixtures without the backend

Usage: python scripts/export_contract.py   (or: make contract)
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

CONTRACT = ROOT / "contract"

EXAMPLES = [
    ("state", "GET", "/api/state", None),
    ("get_days_by_country", "GET", "/api/tools/days", None),
    ("get_residency_status", "GET", "/api/tools/residency", None),
    ("get_day_budget", "GET", "/api/tools/budget", None),
    ("simulate_stay__PT_60", "POST", "/api/tools/simulate", {"country": "PT", "extra_days": 60}),
    ("get_tax_reserve", "GET", "/api/tools/reserve", None),
    ("get_alerts", "GET", "/api/tools/alerts", None),
    ("register_expense", "POST", "/api/tools/expenses", {"concept": "Coworking en Lisboa", "amount_eur": 80, "country": "PT"}),
    ("answer_question__habitual_home_PT", "POST", "/api/tools/answers", {"question_key": "has_habitual_home_in_PT", "value": True}),
    ("generate_dossier", "POST", "/api/tools/dossier", None),
    ("trips_parse__bangkok", "POST", "/api/trips/parse", "SAMPLE:alojamiento_bangkok"),
    ("trips_samples", "GET", "/api/trips/samples", None),
    ("clock", "GET", "/api/clock", None),
    ("clock_advance__30", "POST", "/api/clock/advance", {"days": 30}),
]


def render() -> str:
    from app.main import app

    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def export_examples() -> None:
    # Isolated, deterministic run in mock mode.
    os.environ.update(RUNTIME_DIR=tempfile.mkdtemp(prefix="rumbo-contract-"), DEMO_TODAY="2026-08-18",
                      ANTHROPIC_API_KEY="", ELEVENLABS_API_KEY="")
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    out = CONTRACT / "examples"
    out.mkdir(parents=True, exist_ok=True)
    for name, method, path, body in EXAMPLES:
        client.post("/api/demo/reset")  # every example starts from the initial demo state
        if isinstance(body, str) and body.startswith("SAMPLE:"):
            body = {"text": (ROOT / "data" / "samples" / f"{body[7:]}.txt").read_text(encoding="utf-8")}
        r = client.request(method, path, json=body)
        r.raise_for_status()
        doc = {"request": {"method": method, "path": path, "body": body}, "response": r.json()}
        (out / f"{name}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    client.post("/api/demo/reset")


if __name__ == "__main__":
    export_examples()
    (CONTRACT / "openapi.json").write_text(render(), encoding="utf-8")
    print(f"Wrote contract/openapi.json and {len(EXAMPLES)} examples in contract/examples/")
