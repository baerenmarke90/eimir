from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError
from eimir.quotes import resolver
from eimir.quotes.catalog import DailyQuote, RightsClassification
from eimir.quotes.models import DailyQuotePreference
from eimir.relationship.models import SpaceConfiguration


def _mock_session_with_preference(
    preference: DailyQuotePreference | None,
    configuration: SpaceConfiguration | None = None,
) -> MagicMock:
    session = MagicMock()

    def _execute(statement, *args, **kwargs):  # type: ignore[no-untyped-def]
        res = MagicMock()
        stmt_str = str(statement).lower()
        if "space_configurations" in stmt_str:
            res.scalar_one_or_none.return_value = configuration
        elif "daily_quote_preferences" in stmt_str:
            res.scalar_one_or_none.return_value = preference
        else:
            res.scalar_one_or_none.return_value = None
        return res

    session.execute.side_effect = _execute
    return session


def test_resolver_is_deterministic_on_same_day() -> None:
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    fixed_time = datetime(2026, 9, 21, 10, 0, tzinfo=UTC)
    session = _mock_session_with_preference(None)  # Uses default preference

    res1 = resolver.resolve_daily_quote(session, auth, at=fixed_time)
    res2 = resolver.resolve_daily_quote(session, auth, at=fixed_time)

    assert res1.quote is not None
    assert res2.quote is not None
    assert res1.quote.id == res2.quote.id
    assert res1.checked_on == res2.checked_on
    assert res1.enabled is True


def test_resolver_different_accounts_receive_personalized_selection() -> None:
    account_a = uuid4()
    account_b = uuid4()
    space_id = uuid4()

    fixed_time = datetime(2026, 9, 21, 10, 0, tzinfo=UTC)

    # Account A: love + poetry
    pref_a = DailyQuotePreference(
        account_id=account_a,
        enabled=True,
        selected_source_ids=["poetic_wisdom"],
        selected_category_ids=["love"],
        locale="de",
        version=1,
    )
    # Account B: stoic philosophy
    pref_b = DailyQuotePreference(
        account_id=account_b,
        enabled=True,
        selected_source_ids=["stoic_philosophy"],
        selected_category_ids=["philosophy"],
        locale="de",
        version=1,
    )

    session_a = _mock_session_with_preference(pref_a)
    session_b = _mock_session_with_preference(pref_b)

    res_a = resolver.resolve_daily_quote(
        session_a,
        AuthorizationContext(account_id=account_a, space_id=space_id),
        at=fixed_time,
    )
    res_b = resolver.resolve_daily_quote(
        session_b,
        AuthorizationContext(account_id=account_b, space_id=space_id),
        at=fixed_time,
    )

    assert res_a.quote is not None
    assert res_b.quote is not None
    assert res_a.quote.source_id == "poetic_wisdom"
    assert "love" in res_a.quote.category_ids

    assert res_b.quote.source_id == "stoic_philosophy"
    assert "philosophy" in res_b.quote.category_ids


def test_disabled_preference_returns_no_quote() -> None:
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    pref = DailyQuotePreference(
        account_id=account_id,
        enabled=False,
        selected_source_ids=["classic_literature"],
        selected_category_ids=["love"],
        locale="de",
        version=1,
    )
    session = _mock_session_with_preference(pref)

    res = resolver.resolve_daily_quote(session, auth)
    assert res.enabled is False
    assert res.quote is None


def test_inactive_quotes_are_never_selected() -> None:
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    inactive_quote = DailyQuote(
        id="inactive-1",
        text="Inactive text",
        author_display="Nobody",
        source_display=None,
        source_id="classic_literature",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        active=False,
    )
    active_quote = DailyQuote(
        id="active-1",
        text="Active text",
        author_display="Someone",
        source_display=None,
        source_id="classic_literature",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        active=True,
    )

    custom_pool = [inactive_quote, active_quote]
    session = _mock_session_with_preference(None)

    res = resolver.resolve_daily_quote(session, auth, custom_quote_pool=custom_pool)
    assert res.quote is not None
    assert res.quote.id == "active-1"


def test_empty_pool_returns_neutral_no_quote_state() -> None:
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    session = _mock_session_with_preference(None)
    res = resolver.resolve_daily_quote(session, auth, custom_quote_pool=[])

    assert res.enabled is True
    assert res.quote is None


def test_fallback_pool_when_selected_preferences_empty() -> None:
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    # User selected category "nonexistent_cat"
    pref = DailyQuotePreference(
        account_id=account_id,
        enabled=True,
        selected_source_ids=["nonexistent_source"],
        selected_category_ids=["nonexistent_cat"],
        locale="de",
        version=1,
    )
    session = _mock_session_with_preference(pref)

    # Even though user selected non-matching preferences, resolver gracefully falls back to Pro pool
    res = resolver.resolve_daily_quote(session, auth)
    assert res.quote is not None
    assert res.quote.locale == "de"
    assert res.quote.rights_classification == RightsClassification.PUBLIC_DOMAIN
    assert res.quote.attribution_required is True


def test_resolver_respects_space_timezone(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    # 2026-09-21 23:30:00 UTC is 2026-09-22 08:30:00 in Asia/Tokyo (+9)
    fixed_time = datetime(2026, 9, 21, 23, 30, tzinfo=UTC)

    mock_config = MagicMock()
    mock_config.daily_context_timezone = "Asia/Tokyo"
    monkeypatch.setattr(
        "eimir.relationship.configuration.load",
        lambda session, s_id: mock_config,
    )

    session = _mock_session_with_preference(None)
    res = resolver.resolve_daily_quote(session, auth, at=fixed_time)
    assert res.checked_on.isoformat() == "2026-09-22"


def test_resolver_falls_back_to_utc_when_timezone_unset(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    fixed_time = datetime(2026, 9, 21, 23, 30, tzinfo=UTC)

    mock_config = MagicMock()
    mock_config.daily_context_timezone = None
    monkeypatch.setattr(
        "eimir.relationship.configuration.load",
        lambda session, s_id: mock_config,
    )

    session = _mock_session_with_preference(None)
    res = resolver.resolve_daily_quote(session, auth, at=fixed_time)
    # UTC date is 2026-09-21
    assert res.checked_on.isoformat() == "2026-09-21"


def test_resolver_fails_closed_on_invalid_timezone(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    account_id = uuid4()
    space_id = uuid4()
    auth = AuthorizationContext(account_id=account_id, space_id=space_id)

    mock_config = MagicMock()
    mock_config.daily_context_timezone = "Invalid/Corrupt_Timezone"
    monkeypatch.setattr(
        "eimir.relationship.configuration.load",
        lambda session, s_id: mock_config,
    )

    session = _mock_session_with_preference(None)
    with pytest.raises(ConflictError) as exc_info:
        resolver.resolve_daily_quote(session, auth)

    assert exc_info.value.code == "DAILY_CHECK_IN_CONTEXT_UNAVAILABLE"
