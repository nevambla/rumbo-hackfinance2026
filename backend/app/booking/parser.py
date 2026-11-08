"""'Paste your booking': extract trips from a flight or accommodation email.

With ANTHROPIC_API_KEY it asks Claude for structured output (validated with
Pydantic). Without a key, or if the API call fails, a deterministic mock
parser handles the sample emails in data/samples/ and similar texts.
Nothing is saved here: the user confirms the proposal first.
"""
from __future__ import annotations

import logging
import re
from datetime import date

from pydantic import BaseModel, Field, ValidationError

from ..config import get_settings
from ..countries import normalize_country
from ..models import ParsedTrip, ParseResult

log = logging.getLogger(__name__)
REVIEW_THRESHOLD = 0.6

EXTRACTION_PROMPT = """Extrae los viajes de este email de reserva (vuelo o alojamiento).

Para cada estancia devuelve:
- country: país de DESTINO donde la persona va a estar (código ISO 3166-1 alfa-2, p. ej. "CO").
- city: ciudad de destino.
- start_date: primer día en el destino (AAAA-MM-DD). Para un vuelo, la fecha de llegada.
- end_date: último día en el destino (AAAA-MM-DD) o null si el email no lo indica (por ejemplo, un vuelo solo de ida).
- confidence: de 0 a 1, cuánto te fías de la extracción.
- evidence_text: el fragmento literal del email del que sale la información.

Reglas: no inventes fechas ni destinos. Las escalas no son estancias. Si no hay ningún viaje, devuelve una lista vacía.

<email>
{text}
</email>"""


class _ExtractedTrip(BaseModel):
    country: str
    city: str
    start_date: str
    end_date: str | None = None
    confidence: float = Field(ge=0, le=1)
    evidence_text: str


class _Extraction(BaseModel):
    trips: list[_ExtractedTrip]


def parse_booking(text: str) -> ParseResult:
    settings = get_settings()
    if settings.anthropic_enabled:
        try:
            return _parse_with_claude(text, settings.anthropic_api_key, settings.anthropic_model)
        except Exception as exc:  # network, API or validation failure: degrade to the mock
            log.warning("Claude extraction failed, using mock parser: %s", exc)
            result = parse_mock(text)
            result.warnings_es.insert(0, "No se pudo contactar con Claude; se ha usado el extractor local.")
            return result
    return parse_mock(text)


def _parse_with_claude(text: str, api_key: str, model: str) -> ParseResult:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key, timeout=30.0, max_retries=1)
    response = client.messages.parse(
        model=model,
        max_tokens=4000,
        messages=[{"role": "user", "content": EXTRACTION_PROMPT.format(text=text)}],
        output_format=_Extraction,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise RuntimeError(f"No structured output (stop_reason={response.stop_reason})")
    return _normalise("claude", [t.model_dump() for t in response.parsed_output.trips])


def _normalise(mode: str, raw: list[dict]) -> ParseResult:
    trips: list[ParsedTrip] = []
    warnings: list[str] = []
    for item in raw:
        iso = normalize_country(item.get("country", "")) or normalize_country(item.get("city", ""))
        if not iso:
            warnings.append(f"País no reconocido: «{item.get('country')}». Revísalo a mano.")
            continue
        try:
            start = date.fromisoformat(item["start_date"])
            end = date.fromisoformat(item["end_date"]) if item.get("end_date") else None
        except (ValueError, TypeError, KeyError):
            warnings.append(f"Fechas no válidas para {item.get('city') or iso}; se descarta.")
            continue
        if end and end < start:
            warnings.append(f"La salida es anterior a la llegada en {item.get('city') or iso}; se descarta.")
            continue
        if not (2000 <= start.year <= 2100) or (end and (end - start).days > 730):
            warnings.append(f"Fechas incoherentes para {item.get('city') or iso}; se descarta.")
            continue
        conf = float(item.get("confidence", 0.5))
        try:
            trips.append(ParsedTrip(country_iso2=iso, city=item.get("city", ""), start_date=start, end_date=end,
                                    confidence=conf, evidence_text=item.get("evidence_text", "")[:400],
                                    needs_review=conf < REVIEW_THRESHOLD or end is None))
        except ValidationError:
            warnings.append("Un viaje no pasó la validación y se ha descartado.")
    if not trips and not warnings:
        warnings.append("No se ha encontrado ningún viaje en el texto.")
    if any(t.end_date is None for t in trips):
        warnings.append("Falta la fecha de salida en algún viaje: indícala antes de confirmar.")
    return ParseResult(mode=mode, trips=trips, warnings_es=warnings)


# ------------------------------------------------------------------ mock
_MONTHS = {
    "ene": 1, "enero": 1, "jan": 1, "january": 1, "feb": 2, "febrero": 2, "february": 2,
    "mar": 3, "marzo": 3, "march": 3, "abr": 4, "abril": 4, "apr": 4, "april": 4,
    "may": 5, "mayo": 5, "jun": 6, "junio": 6, "june": 6, "jul": 7, "julio": 7, "july": 7,
    "ago": 8, "agosto": 8, "aug": 8, "august": 8, "sep": 9, "sept": 9, "septiembre": 9, "september": 9,
    "oct": 10, "octubre": 10, "october": 10, "nov": 11, "noviembre": 11, "november": 11,
    "dic": 12, "diciembre": 12, "dec": 12, "december": 12,
}
_M = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), lambda m: date(int(m[1]), int(m[2]), int(m[3]))),
    (re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"), lambda m: date(int(m[3]), int(m[2]), int(m[1]))),
    (re.compile(rf"\b(\d{{1,2}})\s+(?:de\s+)?({_M})\.?\s+(?:de\s+)?(\d{{4}})\b", re.I),
     lambda m: date(int(m[3]), _MONTHS[m[2].lower()], int(m[1]))),
    (re.compile(rf"\b({_M})\.?\s+(\d{{1,2}}),?\s+(\d{{4}})\b", re.I),
     lambda m: date(int(m[3]), _MONTHS[m[1].lower()], int(m[2]))),
]
_PLACES = ["Ciudad de México", "CDMX", "Medellín", "Bogotá", "Bangkok", "Chiang Mai", "Lisboa", "Lisbon", "Porto",
           "Madrid", "Barcelona", "Cancún", "Tailandia", "Thailand", "Colombia", "México", "Mexico", "Portugal",
           "España", "Spain"]
_CITY_NAMES = {"CDMX": "Ciudad de México", "Lisbon": "Lisboa"}


def _dates(text: str) -> list[tuple[int, date]]:
    found: list[tuple[int, date]] = []
    for rx, build in _DATE_PATTERNS:
        for m in rx.finditer(text):
            try:
                found.append((m.start(), build(m)))
            except (ValueError, KeyError):
                continue
    return sorted(found)


def _places(text: str) -> list[tuple[int, str]]:
    out = []
    for p in _PLACES:
        for m in re.finditer(rf"(?<!\w){re.escape(p)}(?!\w)", text, re.I):
            out.append((m.start(), p))
    return sorted(out)


def _line_with(text: str, pos: int) -> str:
    start = text.rfind("\n", 0, pos) + 1
    end = text.find("\n", pos)
    return text[start:end if end != -1 else None].strip()


def parse_mock(text: str) -> ParseResult:
    dates = _dates(text)
    places = _places(text)
    if not dates or not places:
        return _normalise("mock", [])
    arrow = re.search(r"(→|->|\bto\b|\bdestino\b)", text, re.I)
    if arrow:  # flight: destination is the first place after the arrow
        after = [p for p in places if p[0] > arrow.start()]
        dest = after[0] if after else places[-1]
        start = dates[0][1]
        ret = re.search(r"(vuelta|regreso|return)[^\n]*", text, re.I)
        ret_dates = [d for pos, d in dates if ret and pos >= ret.start() and pos <= ret.end()]
        end = ret_dates[0] if ret_dates else None
        evidence = _line_with(text, arrow.start()) + " · " + _line_with(text, dates[0][0])
        conf = 0.85
    else:  # accommodation: first place, check-in / check-out dates
        dest = places[0]
        start = dates[0][1]
        end = dates[1][1] if len(dates) > 1 else None
        evidence = " · ".join(_line_with(text, pos) for pos, _ in dates[:2])
        conf = 0.9 if end else 0.6
    city = _CITY_NAMES.get(dest[1], dest[1])
    country = normalize_country(dest[1]) or ""
    if city in ("Tailandia", "Thailand", "Colombia", "México", "Mexico", "Portugal", "España", "Spain"):
        city = ""
    return _normalise("mock", [{"country": country, "city": city, "start_date": start.isoformat(),
                                "end_date": end.isoformat() if end else None, "confidence": conf,
                                "evidence_text": evidence}])
