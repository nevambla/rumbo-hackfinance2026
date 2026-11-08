"""Single money layer. Amounts are integer cents in their original currency.

Conversions use FIXED DEMO RATES (documented below). They are not live FX
rates and must not be used for real decisions.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

# 1 unit of currency = N EUR. Demo rates, fixed so tests are deterministic.
DEMO_FX_TO_EUR: dict[str, Decimal] = {
    "EUR": Decimal("1"),
    "USD": Decimal("0.92"),
    "MXN": Decimal("0.050"),
    "COP": Decimal("0.00023"),
    "THB": Decimal("0.026"),
}
FX_NOTE_ES = "Tipos de cambio fijos de demostración, no de mercado."


def round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_eur_cents(amount_cents: int, currency: str) -> int:
    if not isinstance(amount_cents, int):
        raise TypeError("amount_cents must be int")
    rate = DEMO_FX_TO_EUR.get(currency.upper())
    if rate is None:
        raise ValueError(f"Unsupported currency: {currency}")
    return round_cents(Decimal(amount_cents) * rate)


def eur_to_cents(amount_eur: Decimal | str | int) -> int:
    """Parse a euro amount (e.g. from the voice agent) into integer cents."""
    return round_cents(Decimal(str(amount_eur)) * 100)


def apply_rate(amount_cents: int, rate: Decimal) -> int:
    return round_cents(Decimal(amount_cents) * rate)


def format_eur(cents: int, decimals: bool = False) -> str:
    """Spanish format: 5.400 € or 5.400,25 €."""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    if decimals:
        units, rest = divmod(cents, 100)
        return f"{sign}{units:,}".replace(",", ".") + f",{rest:02d} €"
    units = round_cents(Decimal(cents) / 100)
    return f"{sign}{units:,}".replace(",", ".") + " €"
