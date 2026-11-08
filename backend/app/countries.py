"""Country names (Spanish) and ISO-2 normalisation."""
from __future__ import annotations

import unicodedata

NAMES_ES: dict[str, str] = {
    "ES": "España", "PT": "Portugal", "MX": "México", "CO": "Colombia", "TH": "Tailandia",
    "DE": "Alemania", "US": "Estados Unidos", "FR": "Francia", "IT": "Italia", "GB": "Reino Unido",
    "NL": "Países Bajos", "AR": "Argentina", "BR": "Brasil", "ID": "Indonesia", "VN": "Vietnam",
}
MVP_COUNTRIES = ("ES", "PT", "MX", "CO", "TH")

_ALIASES = {
    "spain": "ES", "espana": "ES", "madrid": "ES", "barcelona": "ES", "mad": "ES", "bcn": "ES",
    "portugal": "PT", "lisboa": "PT", "lisbon": "PT", "porto": "PT", "lis": "PT", "opo": "PT",
    "mexico": "MX", "ciudad de mexico": "MX", "cdmx": "MX", "mex": "MX", "cancun": "MX",
    "colombia": "CO", "medellin": "CO", "bogota": "CO", "mde": "CO", "bog": "CO",
    "thailand": "TH", "tailandia": "TH", "bangkok": "TH", "bkk": "TH", "chiang mai": "TH",
    "germany": "DE", "alemania": "DE", "united states": "US", "estados unidos": "US", "usa": "US",
}


def _fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)).lower().strip()


def name_es(code: str) -> str:
    return NAMES_ES.get(code.upper(), code.upper())


def normalize_country(value: str) -> str | None:
    """Return ISO-2 code for a code, country name or major city, else None."""
    if not value:
        return None
    raw = value.strip()
    if len(raw) == 2 and raw.isalpha():
        return raw.upper()
    folded = _fold(raw)
    if folded in _ALIASES:
        return _ALIASES[folded]
    for code, name in NAMES_ES.items():
        if _fold(name) == folded:
            return code
    return None
