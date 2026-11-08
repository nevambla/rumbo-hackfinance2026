"""Banking provider interface for the tax piggy bank."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date


class BankingProvider(ABC):
    name: str

    @abstractmethod
    def deposit(self, cents: int, on: date, concept: str) -> None: ...

    @abstractmethod
    def withdraw(self, cents: int, on: date, concept: str) -> None: ...

    @abstractmethod
    def balance(self, as_of: date) -> int:
        """Principal plus accrued interest, in EUR cents."""

    @abstractmethod
    def principal(self, as_of: date) -> int: ...

    @abstractmethod
    def accrued_interest(self, as_of: date) -> int: ...
