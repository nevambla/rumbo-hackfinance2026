"""Pydantic models: domain state and API contract.

Money is always integer cents (`*_cents`). User-facing strings end in `_es`.
"""
from __future__ import annotations

import datetime as _dt
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

CountryCode = str  # ISO 3166-1 alpha-2, upper case
ResidencyStatusValue = Literal["resident", "not_resident", "needs_answer", "not_applicable"]
Confidence = Literal["alta", "media", "baja"]
AnswerValue = bool | str


# ---------------------------------------------------------------- domain state
class Trip(BaseModel):
    id: str
    country: CountryCode
    city: str = ""
    start_date: date
    end_date: date | None = None  # None = ongoing
    expected_end_date: date | None = None  # planning hint for ongoing trips
    source: Literal["seed", "manual", "booking", "parsed"] = "manual"

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.upper()

    @model_validator(mode="after")
    def _dates(self) -> "Trip":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class Invoice(BaseModel):
    id: str
    date: date
    client: str
    client_country: CountryCode
    amount_cents: int
    currency: str = "EUR"
    reserve_rate: Decimal | None = None  # fraction applied when created
    reserved_cents: int | None = None  # EUR cents moved to the tax piggy bank


class Expense(BaseModel):
    id: str
    date: date
    concept: str
    amount_cents: int
    currency: str = "EUR"
    country: CountryCode
    category: str = "otros"
    deductible: bool = True


class UserProfile(BaseModel):
    id: str
    name: str
    occupation_es: str
    nationality: CountryCode
    prior_tax_residence: dict[str, CountryCode] = Field(default_factory=dict)  # {"2025": "ES"}


class PiggyMovement(BaseModel):
    date: date
    amount_cents: int  # positive deposit, negative withdrawal (EUR)
    concept: str


class UserState(BaseModel):
    user: UserProfile
    trips: list[Trip] = Field(default_factory=list)
    planned_trips: list[Trip] = Field(default_factory=list)
    invoices: list[Invoice] = Field(default_factory=list)
    expenses: list[Expense] = Field(default_factory=list)
    answers: dict[str, AnswerValue] = Field(default_factory=dict)
    piggy: list[PiggyMovement] = Field(default_factory=list)
    clock_offset_days: int = 0
    seed_date: date | None = None  # day the relative seed dates were resolved against


# ---------------------------------------------------------------------- rules
RuleType = Literal["calendar_year_days", "rolling_window_days", "qualitative", "sporadic_absences"]


class Rule(BaseModel):
    id: str
    country: CountryCode
    type: RuleType
    params: dict[str, Any] = Field(default_factory=dict)
    description_es: str
    source_url: str
    verified_at: date | None = None


class Notice(BaseModel):
    id: str
    country: CountryCode
    text_es: str
    source_url: str
    verified_at: date | None = None


class CountryRules(BaseModel):
    country: CountryCode
    name_es: str
    rules: list[Rule]
    notices: list[Notice] = Field(default_factory=list)


# ------------------------------------------------------------------ residency
class RuleEvaluation(BaseModel):
    country: CountryCode
    rule_id: str
    status: ResidencyStatusValue
    reason_es: str
    source_url: str
    verified: bool
    days: int | None = None
    threshold: int | None = None


class Claim(BaseModel):
    country: CountryCode
    country_name_es: str
    rule_id: str
    status: Literal["resident"] = "resident"
    reason_es: str
    source_url: str
    verified: bool


class PendingQuestion(BaseModel):
    question_key: str
    question_es: str
    country: CountryCode
    rule_id: str


class TieBreaker(BaseModel):
    order: int
    criterion_key: str
    criterion_es: str
    question_key: str
    question_es: str
    answer: str | None = None
    points_to: CountryCode | None = None
    source_url: str


class ResidencyStatus(BaseModel):
    year: int
    as_of: date
    claims: list[Claim]
    evaluations: list[RuleEvaluation]
    pending_questions: list[PendingQuestion]
    dual_residency: bool
    tie_breakers: list[TieBreaker]
    treaty_hint_es: str | None = None
    warnings_es: list[str]
    notices_es: list[str]
    confidence: Confidence
    unverified_rule_ids: list[str]
    disclaimer_es: str = "Estimación orientativa. Confírmalo con un asesor."


class DaysByCountry(BaseModel):
    year: int
    as_of: date
    days: dict[CountryCode, int]
    country_names_es: dict[CountryCode, str]


# --------------------------------------------------------------------- budget
class BudgetItem(BaseModel):
    country: CountryCode
    country_name_es: str
    rule_id: str
    threshold: int
    comparator: Literal[">", ">="]
    window_days: int | None = None
    days_used: int
    days_left: int  # days you can still spend without meeting the rule
    days_used_with_planned: int
    days_left_with_planned: int
    projected_cross_date: date | None
    status: Literal["ok", "warn", "crossed"]
    message_es: str
    note_es: str | None = None
    source_url: str
    verified: bool


class DayBudget(BaseModel):
    year: int
    as_of: date
    items: list[BudgetItem]


# ---------------------------------------------------------------------- taxes
class TaxEstimate(BaseModel):
    country: CountryCode
    annual_income_cents: int
    taxable_base_cents: int
    amount_cents: int
    effective_rate: Decimal
    is_estimate: bool
    placeholder: bool
    source_url: str
    note_es: str


class SimulationResult(BaseModel):
    country: CountryCode
    extra_days: int
    start_date: date
    end_date: date
    before: ResidencyStatus
    after: ResidencyStatus
    crosses_threshold: bool
    cross_date: date | None
    days_before: int
    days_after: int
    threshold: int | None
    tax_country_before: CountryCode | None
    tax_country_after: CountryCode | None
    tax_before_cents: int
    tax_after_cents: int
    tax_delta_cents: int
    tax_by_country_after_cents: dict[CountryCode, int]
    tax_is_estimate: bool
    overlaps_planned_es: list[str]
    explanation_es: str


class TaxReserve(BaseModel):
    as_of: date
    tax_country: CountryCode
    tax_country_name_es: str
    projected_annual_income_cents: int
    reserved_cents: int
    estimated_cents: int
    pending_cents: int
    interest_cents: int
    balance_cents: int
    savings_rate: Decimal
    provider_name: str
    provider_note_es: str
    effective_rate: Decimal
    is_estimate: bool
    source_url: str
    summary_es: str


# --------------------------------------------------------------------- alerts
class Alert(BaseModel):
    id: str
    level: Literal["info", "warn", "danger"]
    title_es: str
    message_es: str
    country: CountryCode | None = None
    rule_id: str | None = None
    source_url: str | None = None


class AlertList(BaseModel):
    as_of: date
    alerts: list[Alert]


# ------------------------------------------------------------- requests/misc
class SimulateRequest(BaseModel):
    country: CountryCode
    extra_days: int = Field(ge=1, le=366)
    start_date: date | None = None

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class ExpenseRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=120)
    amount_eur: Decimal = Field(gt=0, le=Decimal("100000"))
    country: CountryCode

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class ExpenseResult(BaseModel):
    expense: Expense
    deductible: bool
    message_es: str


class AnswerRequest(BaseModel):
    question_key: str
    value: AnswerValue


class AnswerResult(BaseModel):
    question_key: str
    value: AnswerValue
    residency: ResidencyStatus


class TripCreate(BaseModel):
    country: CountryCode
    city: str = ""
    start_date: date
    end_date: date | None = None
    planned: bool | None = None  # None = infer from the clock
    source: Literal["manual", "booking", "parsed"] = "manual"

    @field_validator("country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def _dates(self) -> "TripCreate":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("La fecha de salida no puede ser anterior a la de llegada")
        return self


class ParseRequest(BaseModel):
    text: str = Field(min_length=10, max_length=20000)


class ParsedTrip(BaseModel):
    country_iso2: CountryCode
    city: str
    start_date: date
    end_date: date | None
    confidence: float = Field(ge=0, le=1)
    evidence_text: str
    needs_review: bool = False


class ParseResult(BaseModel):
    mode: Literal["claude", "mock"]
    trips: list[ParsedTrip]
    warnings_es: list[str] = Field(default_factory=list)


class InvoiceCreate(BaseModel):
    date: _dt.date | None = None
    client: str
    client_country: CountryCode
    amount_cents: int = Field(gt=0)
    currency: str = "EUR"


class InvoiceResult(BaseModel):
    invoice: Invoice
    reserved_cents: int
    message_es: str


class DossierResult(BaseModel):
    id: str
    url: str  # absolute URL (PUBLIC_BASE_URL + path), usable from any frontend origin
    path: str  # relative path under this API
    missing_documents_es: list[str]


class ClockState(BaseModel):
    today: date
    base_date: date
    offset_days: int


class AdvanceRequest(BaseModel):
    days: int = Field(ge=-366, le=366)


class FullState(BaseModel):
    clock: ClockState
    user: UserProfile
    trips: list[Trip]
    planned_trips: list[Trip]
    invoices: list[Invoice]
    expenses: list[Expense]
    answers: dict[str, AnswerValue]
    days: DaysByCountry
    residency: ResidencyStatus
    budget: DayBudget
    reserve: TaxReserve
    alerts: AlertList
    modes: dict[str, bool]
