"""Tax estimates. Progressive brackets for ES and PT; demo effective rates elsewhere.

All arithmetic is Decimal on integer cents; results are integer cents.
"""
from __future__ import annotations

import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from ..models import TaxEstimate
from ..money import apply_rate, round_cents

BRACKET_COUNTRIES = ("ES", "PT")


@lru_cache
def load_brackets(country: str) -> dict:
    path = Path(get_settings().data_dir) / "tax" / f"{country}_brackets.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache
def load_effective_rates() -> dict:
    path = Path(get_settings().data_dir) / "tax" / "effective_rates.json"
    return json.loads(path.read_text(encoding="utf-8"))


def progressive(base_cents: int, brackets: list[dict]) -> int:
    tax = Decimal(0)
    lower = 0
    for b in brackets:
        upper = b["up_to_cents"]
        rate = Decimal(b["rate"])
        top = base_cents if upper is None else min(base_cents, upper)
        if top > lower:
            tax += Decimal(top - lower) * rate
        if upper is None or base_cents <= upper:
            break
        lower = upper
    return round_cents(tax)


def estimate_tax(country: str, annual_income_cents: int, deductible_expenses_cents: int = 0) -> TaxEstimate:
    country = country.upper()
    income = max(0, annual_income_cents)
    if country in BRACKET_COUNTRIES:
        cfg = load_brackets(country)
        share = Decimal(cfg.get("taxable_share_of_income", "1"))
        base = apply_rate(income, share)
        if share == 1:
            base = max(0, base - deductible_expenses_cents)
        tax = progressive(base, cfg["brackets"])
        allowance = cfg.get("personal_allowance_cents", 0)
        if allowance:
            tax = max(0, tax - progressive(min(allowance, base), cfg["brackets"]))
        return TaxEstimate(country=country, annual_income_cents=income, taxable_base_cents=base, amount_cents=tax,
                           effective_rate=_rate(tax, income), is_estimate=cfg.get("is_estimate", True) or cfg.get("verified_at") is None,
                           placeholder=cfg.get("placeholder", False), source_url=cfg["source_url"], note_es=cfg["note_es"])
    cfg = load_effective_rates()
    entry = cfg["rates"].get(country)
    if entry is None:
        return TaxEstimate(country=country, annual_income_cents=income, taxable_base_cents=income, amount_cents=0,
                           effective_rate=Decimal(0), is_estimate=True, placeholder=True, source_url="",
                           note_es="Sin datos fiscales para este país en el MVP.")
    tax = apply_rate(income, Decimal(entry["rate"]))
    return TaxEstimate(country=country, annual_income_cents=income, taxable_base_cents=income, amount_cents=tax,
                       effective_rate=_rate(tax, income), is_estimate=True, placeholder=entry.get("placeholder", True),
                       source_url=entry["source_url"], note_es=cfg["note_es"])


def _rate(tax: int, income: int) -> Decimal:
    if income <= 0:
        return Decimal("0")
    return (Decimal(tax) / Decimal(income)).quantize(Decimal("0.0001"))


def tax_country_for(claims: list[str], fallback: str) -> list[str]:
    """Countries whose tax should be estimated for a residency outcome."""
    return claims or [fallback]


def conservative_tax(countries: list[str], income_cents: int, expenses_cents: int) -> tuple[str, dict[str, TaxEstimate]]:
    """With several candidate countries, reserve for the most expensive one."""
    estimates = {c: estimate_tax(c, income_cents, expenses_cents) for c in countries}
    worst = max(estimates, key=lambda c: estimates[c].amount_cents)
    return worst, estimates
