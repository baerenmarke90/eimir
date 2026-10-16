"""Authoritative Daily Quote Resolver.

Determines the personal quote of the day for an authenticated caller within a Space:
- Stable across reloads for the same Account + Space Day.
- Bound to Space Pro capability (`daily.quote`).
- Account-scoped personal source and category preferences.
- Graceful 3-tier fallback when specific preferences yield no quote.
- Never blocks Today upon missing timezone or empty pool.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.daily_checkins.context import resolve_space_day
from eimir.identity.models import Account
from eimir.quotes import catalog
from eimir.quotes import service as preference_service
from eimir.quotes.catalog import DailyQuote
from eimir.quotes.models import DailyQuotePreference
from eimir.relationship import configuration as configuration_service


@dataclass(frozen=True)
class ResolvedDailyQuote:
    quote: DailyQuote | None
    checked_on: date
    enabled: bool


def _resolve_day(
    session: Session,
    authorization: AuthorizationContext,
    at: datetime | None = None,
) -> date:
    """Resolve current Space calendar day using the authoritative Space timezone.

    If daily_context_timezone is unset (None), falls back cleanly to UTC date.
    If daily_context_timezone is invalid or corrupted, resolve_space_day fails-closed.
    """
    instant = at if at is not None else clock.now()
    configuration = configuration_service.load(session, authorization.space_id)
    if configuration is not None and configuration.daily_context_timezone is not None:
        return resolve_space_day(configuration.daily_context_timezone, at=instant)

    return clock.ensure_utc(instant).date()


def _resolve_locale(
    session: Session,
    authorization: AuthorizationContext,
    preference: DailyQuotePreference,
) -> str:
    """Resolve effective locale: personal quote preference -> account profile -> 'de' default."""
    if preference.locale and preference.locale.strip():
        return preference.locale.strip().lower()

    account = session.execute(
        select(Account).where(Account.id == authorization.account_id)
    ).scalar_one_or_none()

    if account and account.locale and account.locale.strip():
        return account.locale.strip().lower()

    return "de"


def _normalize_lang(loc: str) -> str:
    return loc.split("-")[0].split("_")[0].lower()


def resolve_daily_quote(
    session: Session,
    authorization: AuthorizationContext,
    *,
    at: datetime | None = None,
    custom_quote_pool: Sequence[DailyQuote] | None = None,
) -> ResolvedDailyQuote:
    """Deterministically resolve today's quote for the authorized caller.

    Requires that the caller's Space possesses the `daily.quote` Pro capability.
    """
    checked_on = _resolve_day(session, authorization, at=at)

    preference = preference_service.get_or_default_preference(session, authorization.account_id)

    if not preference.enabled:
        return ResolvedDailyQuote(quote=None, checked_on=checked_on, enabled=False)

    effective_locale = _resolve_locale(session, authorization, preference)
    target_lang = _normalize_lang(effective_locale)

    # 1. Base pool: active quotes
    all_quotes = (
        custom_quote_pool if custom_quote_pool is not None else catalog.get_quotes(active_only=True)
    )
    active_quotes = [q for q in all_quotes if q.active]

    # Filter to matching language if available, otherwise consider all active
    locale_pool = [q for q in active_quotes if _normalize_lang(q.locale) == target_lang]
    if not locale_pool:
        locale_pool = active_quotes

    selected_sources = set(preference.selected_source_ids)
    selected_categories = set(preference.selected_category_ids)

    # Step 1: Matching BOTH user selected sources AND categories
    primary_pool = [
        q
        for q in locale_pool
        if q.source_id in selected_sources
        and any(cat in selected_categories for cat in q.category_ids)
    ]

    # Step 2: Fallback 1 - matching either selected source OR category
    if not primary_pool and (selected_sources or selected_categories):
        primary_pool = [
            q
            for q in locale_pool
            if q.source_id in selected_sources
            or any(cat in selected_categories for cat in q.category_ids)
        ]

    # Step 3: Fallback 2 - defined general curated Pro pool for the locale
    candidate_pool = primary_pool if primary_pool else locale_pool

    # Step 4: Fallback 3 - neutral No-Quote-State
    if not candidate_pool:
        return ResolvedDailyQuote(quote=None, checked_on=checked_on, enabled=True)

    # Deterministic selection based on (account_id, checked_on)
    # Sort deterministically by id
    sorted_candidates = sorted(candidate_pool, key=lambda q: q.id)
    hash_input = f"{authorization.account_id}:{checked_on.isoformat()}"
    digest = hashlib.sha256(hash_input.encode("utf-8")).digest()
    index = int.from_bytes(digest[:8], "big") % len(sorted_candidates)
    chosen_quote = sorted_candidates[index]

    return ResolvedDailyQuote(
        quote=chosen_quote,
        checked_on=checked_on,
        enabled=True,
    )
