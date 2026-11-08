import ast
from decimal import Decimal
from pathlib import Path

import pytest

from app.engine.tax import estimate_tax, progressive
from app.money import eur_to_cents, format_eur, to_eur_cents

APP = Path(__file__).resolve().parent.parent / "app"


def test_conversions_are_integer_cents():
    assert to_eur_cents(150000, "USD") == 138000
    assert isinstance(to_eur_cents(1, "USD"), int)
    assert eur_to_cents("80") == 8000 and eur_to_cents(Decimal("12.345")) == 1235
    with pytest.raises(TypeError):
        to_eur_cents(10.5, "EUR")


def test_format_eur():
    assert format_eur(540000) == "5.400 €"
    assert format_eur(3825, decimals=True) == "38,25 €"


def test_progressive_brackets():
    brackets = [{"up_to_cents": 1000, "rate": "0.1"}, {"up_to_cents": None, "rate": "0.5"}]
    assert progressive(3000, brackets) == 100 + 1000


def test_estimates_are_ints_and_flagged():
    for c in ("ES", "PT", "MX", "CO", "TH"):
        est = estimate_tax(c, 4800000)
        assert isinstance(est.amount_cents, int) and est.amount_cents > 0
        assert est.source_url
    assert estimate_tax("PT", 4800000).placeholder is True
    assert estimate_tax("TH", 4800000).is_estimate is True


def test_no_float_in_money_domain():
    """No float literals or float() calls in money/engine/banking modules."""
    offenders = []
    for folder in ("engine", "banking"):
        for path in (APP / folder).glob("*.py"):
            offenders += _floats(path)
    for name in ("money.py", "services.py"):
        offenders += _floats(APP / name)
    assert not offenders, offenders


def _floats(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, float):
            out.append(f"{path.name}:{node.lineno} float literal")
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "float":
            out.append(f"{path.name}:{node.lineno} float()")
    return out


def test_invoice_reserve_goes_to_piggy_bank(client):
    before = client.get("/api/tools/reserve").json()["reserved_cents"]
    r = client.post("/api/invoices", json={"client": "Acme", "client_country": "DE", "amount_cents": 100000}).json()
    assert isinstance(r["reserved_cents"], int) and r["reserved_cents"] > 0
    after = client.get("/api/tools/reserve").json()["reserved_cents"]
    assert after - before == r["reserved_cents"]


def test_register_expense(client):
    r = client.post("/api/tools/expenses", json={"concept": "Coworking en Medellín", "amount_eur": 80, "country": "co"})
    assert r.status_code == 200
    body = r.json()
    assert body["expense"]["amount_cents"] == 8000 and body["expense"]["country"] == "CO"
    assert body["expense"]["category"] == "coworking"
