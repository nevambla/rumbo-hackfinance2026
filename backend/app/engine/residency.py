"""Combine rule evaluations into a yearly residency status."""
from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from ..countries import name_es
from ..models import (AnswerValue, Claim, PendingQuestion, ResidencyStatus, RuleEvaluation, TieBreaker, Trip,
                      UserProfile)
from .rules import EvalContext, evaluate_rule, load_rules, question_for

NO_RESIDENCE_WARNING_ES = (
    "No ser residente en ningún país no es una opción real: algún país (normalmente el último donde fuiste "
    "residente) seguirá reclamándote. Revísalo con un asesor."
)
DUAL_WARNING_ES = (
    "Dos países te consideran residente a la vez. Decide el convenio de doble imposición entre ellos, "
    "aplicando sus criterios de desempate en orden."
)


@lru_cache
def load_tie_breakers() -> dict:
    path = Path(get_settings().data_dir) / "treaties.json"
    return json.loads(path.read_text(encoding="utf-8"))["tie_breakers"]


def tiebreak_question_key(criterion_key: str) -> str:
    return f"tiebreak_{criterion_key}"


def build_tie_breakers(countries: list[str], answers: dict[str, AnswerValue]) -> tuple[list[TieBreaker], str | None]:
    tb = load_tie_breakers()
    out: list[TieBreaker] = []
    hint = None
    for c in tb["criteria"]:
        qk = tiebreak_question_key(c["criterion_key"])
        ans = answers.get(qk)
        ans_str = str(ans).upper() if isinstance(ans, str) else None
        points_to = ans_str if ans_str in countries else None
        out.append(TieBreaker(order=c["order"], criterion_key=c["criterion_key"], criterion_es=c["criterion_es"],
                              question_key=qk, question_es=c["question_es"], answer=ans_str,
                              points_to=points_to, source_url=tb["source_url"]))
        if points_to and hint is None:
            hint = (f"Según tu respuesta sobre «{c['criterion_es'].lower()}», el convenio apuntaría a "
                    f"{name_es(points_to)}. Es una orientación: confírmalo con un asesor.")
            break
    if hint is None and all(t.answer for t in out):
        hint = tb["fallback_es"]
    return out, hint


def _country_status(evals: list[RuleEvaluation], decisive_ids: set[str]) -> str:
    for e in evals:
        if e.rule_id in decisive_ids and e.status in ("resident", "not_resident"):
            return e.status
    statuses = {e.status for e in evals}
    if "resident" in statuses:
        return "resident"
    if "needs_answer" in statuses:
        return "needs_answer"
    return "not_resident"


def get_residency_status(trips: list[Trip], profile: UserProfile, answers: dict[str, AnswerValue],
                         year: int, as_of: date) -> ResidencyStatus:
    ctx = EvalContext(trips=trips, year=year, as_of=as_of, answers=answers, profile=profile)
    rules_by_country = load_rules()
    evaluations: list[RuleEvaluation] = []
    claims: list[Claim] = []
    pending: list[PendingQuestion] = []
    notices: list[str] = []
    unverified: list[str] = []

    for country, cr in rules_by_country.items():
        evals = [evaluate_rule(r, ctx) for r in cr.rules]
        evaluations.extend(evals)
        decisive = {r.id for r in cr.rules if r.params.get("decisive")}
        status = _country_status(evals, decisive)
        rules_by_id = {r.id: r for r in cr.rules}
        if status == "resident":
            decisive_eval = next((e for e in evals if e.rule_id in decisive
                                  and e.status in ("resident", "not_resident")), None)
            winner = decisive_eval or next(e for e in evals if e.status == "resident")
            claims.append(Claim(country=country, country_name_es=cr.name_es, rule_id=winner.rule_id,
                                reason_es=winner.reason_es, source_url=winner.source_url, verified=winner.verified))
        for e in evals:
            # Only ask questions that can still change this country's outcome.
            if e.status == "needs_answer" and status != "resident":
                q = question_for(rules_by_id[e.rule_id])
                if q and all(p.question_key != q.question_key for p in pending):
                    pending.append(q)
            if e.status in ("resident", "needs_answer") and not e.verified:
                unverified.append(e.rule_id)
        present = ctx.calendar_days(country) > 0
        for n in cr.notices:
            if present or (country == profile.nationality and n.id == "ES_ART_8_2"):
                notices.append(n.text_es)

    warnings: list[str] = []
    dual = len(claims) > 1
    tie_breakers: list[TieBreaker] = []
    hint = None
    if not claims and not pending:
        warnings.append(NO_RESIDENCE_WARNING_ES)
    elif not claims and pending:
        warnings.append("Todavía ningún país te reclama con seguridad; responde a las preguntas pendientes. "
                        + NO_RESIDENCE_WARNING_ES)
    if dual:
        warnings.append(DUAL_WARNING_ES)
        tie_breakers, hint = build_tie_breakers([c.country for c in claims], answers)

    if pending or any(not c.verified for c in claims) or unverified:
        confidence = "baja"
    elif dual:
        confidence = "media"
    else:
        confidence = "alta"

    return ResidencyStatus(year=year, as_of=as_of, claims=claims, evaluations=evaluations,
                           pending_questions=pending, dual_residency=dual, tie_breakers=tie_breakers,
                           treaty_hint_es=hint, warnings_es=warnings, notices_es=notices,
                           confidence=confidence, unverified_rule_ids=sorted(set(unverified)))
