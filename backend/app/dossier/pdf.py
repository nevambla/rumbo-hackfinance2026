"""Defence dossier PDF: days per country, rules applied with sources, missing documents."""
from __future__ import annotations

import uuid
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .. import clock, services, store
from ..config import get_settings
from ..countries import name_es
from ..engine.rules import load_rules
from ..models import DossierResult, ResidencyStatus, UserState

INK = colors.HexColor("#040B18")
MUTED = colors.HexColor("#4A5A6E")
LINE = colors.HexColor("#E6EBF0")
ACCENT = colors.HexColor("#0B6C7F")

SOURCE_LABEL = {"seed": "Historial", "manual": "Manual", "booking": "Reserva", "parsed": "Reserva (extraída)"}
STATUS_LABEL = {"resident": "Residente", "not_resident": "No residente", "needs_answer": "Falta respuesta",
                "not_applicable": "No aplica"}
LEGAL_ES = ("Rumbo es un copiloto de planificación, no un asesor fiscal. Este expediente es una estimación orientativa "
            "basada en los datos que has introducido y en reglas resumidas con su fuente; algunas reglas están pendientes "
            "de verificación. No sustituye el asesoramiento profesional ni acredita por sí mismo tu residencia fiscal. "
            "Rumbo no ayuda a simular residencias, ocultar ingresos ni crear estructuras ficticias.")


def dossier_dir() -> Path:
    return Path(get_settings().runtime_dir) / "dossiers"


def dossier_path(dossier_id: str) -> Path:
    return dossier_dir() / f"{dossier_id}.pdf"


def missing_documents(state: UserState, res: ResidencyStatus) -> list[str]:
    docs: list[str] = []
    year = res.year
    abroad = {c: n for c, n in services.days_by_country(year).days.items() if c != "ES"}
    cert = state.answers.get("has_foreign_residence_certificate")
    if cert is not True and abroad:
        main = max(abroad, key=abroad.get)
        docs.append(f"Certificado de residencia fiscal en {name_es(main)}: sin él, España computa tus ausencias "
                    f"como días en España (art. 9.1.a LIRPF).")
    if any(t.source in ("seed", "manual") for t in state.trips):
        docs.append("Justificantes de entrada y salida de cada país (tarjetas de embarque, sellos del pasaporte, "
                    "facturas de alojamiento) para los viajes registrados a mano.")
    if state.answers.get("has_habitual_home_in_PT") is True:
        docs.append("Contrato de alquiler o escritura de tu vivienda en Portugal.")
    if res.dual_residency:
        docs.append("Pruebas para el desempate del convenio: vivienda permanente, centro de intereses vitales "
                    "(clientes, cuentas, familia) y tiempo de estancia habitual.")
    if res.pending_questions:
        docs.append("Respuestas a las preguntas pendientes: " +
                    "; ".join(q.question_es for q in res.pending_questions))
    return docs


def generate_dossier() -> DossierResult:
    state = store.get_state()
    res = services.residency()
    today = clock.today()
    did = uuid.uuid4().hex[:12]
    path = dossier_path(did)
    path.parent.mkdir(parents=True, exist_ok=True)
    docs = missing_documents(state, res)

    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=INK, alignment=0, fontSize=20, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=INK, fontSize=13, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", parent=ss["BodyText"], fontSize=9.5, leading=13, textColor=INK)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=11, textColor=MUTED)

    def table(rows, widths):
        t = Table([[Paragraph(str(c), body) for c in r] for r in rows], colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), LINE), ("GRID", (0, 0), (-1, -1), 0.3, LINE),
                               ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        return t

    story = [
        Paragraph("Rumbo · Expediente de residencia fiscal", h1),
        Paragraph(f"{state.user.name} · {state.user.occupation_es} · Nacionalidad: {name_es(state.user.nationality)}", body),
        Paragraph(f"Año evaluado: {res.year} · Datos a {today.strftime('%d/%m/%Y')} · Expediente {did}", small),
        Paragraph("1. Días por país", h2),
    ]
    days = services.days_by_country(res.year)
    story.append(table([["País", "Días"]] + [[name_es(c), n] for c, n in days.days.items()], [120 * mm, 40 * mm]))
    story.append(Spacer(1, 4))
    trip_rows = [["Destino", "Desde", "Hasta", "Fuente"]]
    for t in sorted(state.trips, key=lambda t: t.start_date):
        trip_rows.append([f"{t.city + ', ' if t.city else ''}{name_es(t.country)}", t.start_date.strftime("%d/%m/%Y"),
                          t.end_date.strftime("%d/%m/%Y") if t.end_date else "en curso", SOURCE_LABEL.get(t.source, t.source)])
    story.append(table(trip_rows, [65 * mm, 30 * mm, 30 * mm, 35 * mm]))

    story.append(Paragraph("2. Resultado de residencia", h2))
    if res.claims:
        story.append(Paragraph("Países que te reclaman: <b>" + ", ".join(c.country_name_es for c in res.claims)
                               + f"</b> · Confianza: {res.confidence}", body))
    for w in res.warnings_es:
        story.append(Paragraph(f"⚠ {w}", body))
    rules = {r.id: (r, cr.name_es) for cr in load_rules().values() for r in cr.rules}
    rule_rows = [["Regla", "Resultado", "Motivo y fuente"]]
    for e in res.evaluations:
        if e.status == "not_applicable":
            continue
        rule, _ = rules[e.rule_id]
        verified = "" if e.verified else " <font color='#4A5A6E'>(pendiente de verificar)</font>"
        rule_rows.append([f"{e.rule_id}<br/><font size=7>{name_es(e.country)}</font>", STATUS_LABEL[e.status],
                          f"{e.reason_es}<br/><font size=7 color='#4A5A6E'>{rule.description_es}</font><br/>"
                          f"<font size=7 color='#0B6C7F'>{e.source_url}</font>{verified}"])
    story.append(table(rule_rows, [35 * mm, 25 * mm, 100 * mm]))
    if res.dual_residency:
        story.append(Paragraph("Criterios de desempate del convenio (en orden)", h2))
        for tb in res.tie_breakers:
            story.append(Paragraph(f"{tb.order}. <b>{tb.criterion_es}</b>: {tb.question_es}"
                                   + (f" Respuesta: {tb.answer}." if tb.answer else ""), body))

    story.append(Paragraph("3. Documentos que te faltan", h2))
    for d in docs or ["No detectamos documentos pendientes con los datos actuales."]:
        story.append(Paragraph(f"• {d}", body))

    story.append(Paragraph("Aviso legal", h2))
    story.append(Paragraph(LEGAL_ES, small))

    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                      bottomMargin=16 * mm, title="Expediente Rumbo", author="Rumbo").build(story)
    rel = f"/api/dossier/{did}.pdf"
    base = get_settings().public_base_url.rstrip("/")
    return DossierResult(id=did, url=f"{base}{rel}", path=rel, missing_documents_es=docs)
