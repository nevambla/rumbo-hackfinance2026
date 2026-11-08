"""Rule loading and per-type evaluators. Pure functions, no I/O after load."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from ..countries import name_es
from ..models import AnswerValue, CountryRules, PendingQuestion, Rule, RuleEvaluation, Trip, UserProfile
from . import days as days_mod


@dataclass
class EvalContext:
    trips: list[Trip]
    year: int
    as_of: date
    answers: dict[str, AnswerValue]
    profile: UserProfile
    _cache: dict = field(default_factory=dict)

    def calendar_days(self, country: str, count_entry_exit: bool = True) -> int:
        key = ("cal", country, count_entry_exit)
        if key not in self._cache:
            self._cache[key] = days_mod.days_in_calendar_year(self.trips, country, self.year, self.as_of, count_entry_exit)
        return self._cache[key]

    def rolling_days(self, country: str, window: int, count_entry_exit: bool = True) -> int:
        key = ("roll", country, window, count_entry_exit)
        if key not in self._cache:
            self._cache[key] = days_mod.max_days_in_rolling_window(
                self.trips, country, window, self.year, self.as_of, count_entry_exit)[0]
        return self._cache[key]


@lru_cache
def load_rules() -> dict[str, CountryRules]:
    rules_dir = Path(get_settings().data_dir) / "rules"
    out: dict[str, CountryRules] = {}
    for path in sorted(rules_dir.glob("*.json")):
        cr = CountryRules.model_validate(json.loads(path.read_text(encoding="utf-8")))
        out[cr.country] = cr
    return out


def all_rules() -> list[Rule]:
    return [r for cr in load_rules().values() for r in cr.rules]


def meets(count: int, threshold: int, comparator: str) -> bool:
    return count > threshold if comparator == ">" else count >= threshold


def max_allowed(threshold: int, comparator: str) -> int:
    """Largest day count that does NOT meet the rule."""
    return threshold if comparator == ">" else threshold - 1


def _cmp_es(comparator: str, threshold: int) -> str:
    return f"más de {threshold}" if comparator == ">" else f"{threshold} o más"


def _result(rule: Rule, status: str, reason: str, days: int | None = None, threshold: int | None = None) -> RuleEvaluation:
    return RuleEvaluation(country=rule.country, rule_id=rule.id, status=status, reason_es=reason,
                          source_url=rule.source_url, verified=rule.verified_at is not None,
                          days=days, threshold=threshold)


def question_for(rule: Rule) -> PendingQuestion | None:
    p = rule.params
    key = p.get("question_key") or p.get("certificate_question_key")
    text = p.get("question_es") or p.get("certificate_question_es")
    if not key:
        return None
    return PendingQuestion(question_key=key, question_es=text, country=rule.country, rule_id=rule.id)


def eval_calendar_year_days(rule: Rule, ctx: EvalContext) -> RuleEvaluation:
    p = rule.params
    n = ctx.calendar_days(rule.country, p.get("count_entry_exit", True))
    thr, cmp = p["threshold"], p["comparator"]
    country = name_es(rule.country)
    if meets(n, thr, cmp):
        return _result(rule, "resident", f"{n} días en {country} en {ctx.year}: cumple la regla de {_cmp_es(cmp, thr)} días.", n, thr)
    return _result(rule, "not_resident", f"{n} días en {country} en {ctx.year}; la regla exige {_cmp_es(cmp, thr)}.", n, thr)


def eval_rolling_window_days(rule: Rule, ctx: EvalContext) -> RuleEvaluation:
    p = rule.params
    n = ctx.rolling_days(rule.country, p["window_days"], p.get("count_entry_exit", True))
    thr, cmp = p["threshold"], p["comparator"]
    country = name_es(rule.country)
    if meets(n, thr, cmp):
        return _result(rule, "resident",
                       f"{n} días en {country} en un periodo de {p['window_days']} días: supera el umbral de {_cmp_es(cmp, thr)}.", n, thr)
    return _result(rule, "not_resident",
                   f"Máximo de {n} días en {country} en cualquier periodo de {p['window_days']} días; el umbral es {_cmp_es(cmp, thr)}.", n, thr)


def eval_qualitative(rule: Rule, ctx: EvalContext) -> RuleEvaluation:
    p = rule.params
    country = name_es(rule.country)
    if p.get("requires_presence") and ctx.calendar_days(rule.country) == 0:
        return _result(rule, "not_applicable", f"Sin presencia en {country} en {ctx.year}.")
    for key, expected in (p.get("requires_answers") or {}).items():
        if ctx.answers.get(key) != expected:
            return _result(rule, "not_applicable", "No aplica con tus respuestas actuales.")
    answer = ctx.answers.get(p["question_key"])
    if answer is None:
        return _result(rule, "needs_answer", f"Falta tu respuesta: {p['question_es']}")
    if answer is True:
        return _result(rule, "resident", p.get("resident_reason_es", rule.description_es))
    return _result(rule, "not_resident", p.get("not_resident_reason_es", "No se cumple el criterio."))


def eval_sporadic_absences(rule: Rule, ctx: EvalContext) -> RuleEvaluation:
    p = rule.params
    thr, cmp = p["threshold"], p["comparator"]
    n = ctx.calendar_days(rule.country, p.get("count_entry_exit", True))
    country = name_es(rule.country)
    if meets(n, thr, cmp):
        return _result(rule, "resident", f"{n} días en {country} en {ctx.year}: {_cmp_es(cmp, thr)} días.", n, thr)
    prior = ctx.profile.prior_tax_residence.get(str(ctx.year - 1)) == rule.country
    if p.get("requires_prior_residence") and not prior:
        return _result(rule, "not_resident", f"{n} días en {country} en {ctx.year}; la regla exige {_cmp_es(cmp, thr)}.", n, thr)
    cert = ctx.answers.get(p["certificate_question_key"])
    if cert is None:
        return _result(rule, "needs_answer",
                       f"{n} días físicos en {country}. Si no acreditas residencia fiscal en otro país, tus ausencias "
                       f"cuentan como días en {country}. {p['certificate_question_es']}", n, thr)
    if cert is True:
        return _result(rule, "not_resident",
                       f"Acreditas residencia fiscal en otro país: tus ausencias no se suman. {n} días en {country}; "
                       f"la regla exige {_cmp_es(cmp, thr)}.", n, thr)
    elapsed = days_mod.elapsed_days_in_year(ctx.year, ctx.as_of)
    absences = max(0, elapsed - n)
    counted = n + absences
    if meets(counted, thr, cmp):
        return _result(rule, "resident",
                       f"Llevas {n} días en {country} y {absences} fuera sin certificado de residencia fiscal en otro país. "
                       f"{country} suma esas ausencias: {counted} días, {_cmp_es(cmp, thr)}.", counted, thr)
    return _result(rule, "not_resident",
                   f"{n} días en {country} más {absences} de ausencias esporádicas suman {counted}; "
                   f"todavía no llegan a {_cmp_es(cmp, thr)}.", counted, thr)


EVALUATORS = {
    "calendar_year_days": eval_calendar_year_days,
    "rolling_window_days": eval_rolling_window_days,
    "qualitative": eval_qualitative,
    "sporadic_absences": eval_sporadic_absences,
}


def evaluate_rule(rule: Rule, ctx: EvalContext) -> RuleEvaluation:
    return EVALUATORS[rule.type](rule, ctx)


def day_rule(country: str) -> Rule | None:
    """The day-count rule of a country, if it has one."""
    cr = load_rules().get(country)
    if not cr:
        return None
    for r in cr.rules:
        if r.type in ("calendar_year_days", "rolling_window_days", "sporadic_absences"):
            return r
    return None
