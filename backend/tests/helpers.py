from datetime import date, timedelta

from app.models import Trip, UserProfile


def trip(country: str, start: str, end: str | None, tid: str | None = None) -> Trip:
    return Trip(id=tid or f"{country}-{start}", country=country, start_date=date.fromisoformat(start),
                end_date=date.fromisoformat(end) if end else None, source="manual")


def stay_days(country: str, start: str, n: int) -> Trip:
    s = date.fromisoformat(start)
    return Trip(id=f"{country}-{start}-{n}", country=country, start_date=s, end_date=s + timedelta(days=n - 1),
                source="manual")


def profile(nationality: str = "DE", prior: dict | None = None) -> UserProfile:
    return UserProfile(id="t", name="Test", occupation_es="Test", nationality=nationality,
                       prior_tax_residence=prior or {})
