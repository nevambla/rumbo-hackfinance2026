"""Presence-day counting.

A presence day is any calendar day the user spends in a country, even
partially. With count_entry_exit=True a travel day counts for both countries;
with False the departure day is attributed only to the arrival country.
Ongoing trips (end_date None) and trips ending in the future are clipped to
`as_of` (the clock), so the current state never includes the future.
"""
from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta

from ..models import Trip


def _trip_range(trip: Trip, as_of: date) -> tuple[date, date] | None:
    if trip.start_date > as_of:
        return None
    end = trip.end_date or as_of
    return trip.start_date, min(end, as_of)


def presence_days(trips: Iterable[Trip], country: str, as_of: date, count_entry_exit: bool = True) -> set[date]:
    trips = list(trips)
    starts_by_day: dict[date, set[str]] = {}
    for t in trips:
        starts_by_day.setdefault(t.start_date, set()).add(t.country)
    days: set[date] = set()
    for t in trips:
        if t.country != country:
            continue
        rng = _trip_range(t, as_of)
        if rng is None:
            continue
        start, end = rng
        if not count_entry_exit and t.end_date and t.end_date <= as_of:
            if starts_by_day.get(t.end_date, set()) - {country}:
                end = t.end_date - timedelta(days=1)
        d = start
        while d <= end:
            days.add(d)
            d += timedelta(days=1)
    return days


def days_in_calendar_year(trips: Iterable[Trip], country: str, year: int, as_of: date, count_entry_exit: bool = True) -> int:
    return sum(1 for d in presence_days(trips, country, as_of, count_entry_exit) if d.year == year)


def max_days_in_rolling_window(
    trips: Iterable[Trip], country: str, window_days: int, year: int, as_of: date, count_entry_exit: bool = True
) -> tuple[int, date | None, date | None]:
    """Max presence days in any `window_days` window that overlaps `year`.

    Returns (count, window_start, window_end) for the best window.
    """
    days = presence_days(trips, country, as_of, count_entry_exit)
    if not days:
        return 0, None, None
    first = date(year, 1, 1) - timedelta(days=window_days - 1)
    last = date(year, 12, 31)
    total = (last - first).days + window_days
    flags = [0] * total
    for d in days:
        idx = (d - first).days
        if 0 <= idx < total:
            flags[idx] = 1
    best, best_start = -1, first
    running = sum(flags[:window_days])
    for i in range((last - first).days + 1):
        if i:
            running += flags[i + window_days - 1] - flags[i - 1]
        if running > best:
            best, best_start = running, first + timedelta(days=i)
    return best, best_start, best_start + timedelta(days=window_days - 1)


def first_day_exceeding(trips: Iterable[Trip], country: str, threshold_count: int, as_of: date,
                        window_days: int | None, year: int, count_entry_exit: bool = True) -> date | None:
    """First date on which the count reaches `threshold_count` (calendar year or rolling window)."""
    days = sorted(presence_days(trips, country, as_of, count_entry_exit))
    if window_days is None:
        in_year = [d for d in days if d.year == year]
        return in_year[threshold_count - 1] if len(in_year) >= threshold_count else None
    # Rolling: earliest day d such that the window ending at d holds >= threshold_count days,
    # with the window overlapping the evaluated year.
    j = 0
    for i, d in enumerate(days):
        while (d - days[j]).days >= window_days:
            j += 1
        if i - j + 1 >= threshold_count and d >= date(year, 1, 1) and days[j] <= date(year, 12, 31):
            return d
    return None


def elapsed_days_in_year(year: int, as_of: date) -> int:
    start, end = date(year, 1, 1), min(date(year, 12, 31), as_of)
    return max(0, (end - start).days + 1)
