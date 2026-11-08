"""Mock of a MyInvestor remunerated account.

Interest accrues daily (simple interest, actual/365) at MOCK_SAVINGS_RATE.
That rate is a DEMO value, not a real MyInvestor offer.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from ..models import PiggyMovement
from ..money import round_cents
from .provider import BankingProvider


class MyInvestorMock(BankingProvider):
    name = "MyInvestor (simulado)"

    def __init__(self, movements: list[PiggyMovement], annual_rate: Decimal):
        self.movements = movements  # shared with the user state, persisted by the store
        self.annual_rate = Decimal(annual_rate)

    def deposit(self, cents: int, on: date, concept: str) -> None:
        if cents <= 0:
            raise ValueError("deposit must be positive")
        self.movements.append(PiggyMovement(date=on, amount_cents=cents, concept=concept))

    def withdraw(self, cents: int, on: date, concept: str) -> None:
        if cents <= 0 or cents > self.principal(on):
            raise ValueError("invalid withdrawal")
        self.movements.append(PiggyMovement(date=on, amount_cents=-cents, concept=concept))

    def principal(self, as_of: date) -> int:
        return sum(m.amount_cents for m in self.movements if m.date <= as_of)

    def accrued_interest(self, as_of: date) -> int:
        events = sorted((m for m in self.movements if m.date <= as_of), key=lambda m: m.date)
        interest = Decimal(0)
        bal = 0
        prev: date | None = None
        for m in events:
            if prev is not None:
                interest += Decimal(bal) * self.annual_rate * (m.date - prev).days / 365
            bal += m.amount_cents
            prev = m.date
        if prev is not None:
            interest += Decimal(bal) * self.annual_rate * (as_of - prev).days / 365
        return round_cents(interest)

    def balance(self, as_of: date) -> int:
        return self.principal(as_of) + self.accrued_interest(as_of)
