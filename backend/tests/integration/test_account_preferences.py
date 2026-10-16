"""Timezone and locale write boundary against the database."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from eimir.core.clock import today_in
from eimir.core.errors import ValidationError
from eimir.identity import preferences
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class TestWriteBoundary:
    def test_valid_values_are_persisted(self, session: Session) -> None:
        account = make_account(session)
        preferences.set_preferences(
            session,
            account,
            timezone="Pacific/Auckland",
            locale="en_nz",
        )
        session.flush()

        session.expire(account)
        assert account.timezone == "Pacific/Auckland"
        assert account.locale == "en-NZ"

    def test_invalid_timezone_is_not_persisted(self, session: Session) -> None:
        account = make_account(session)
        before = account.timezone

        with pytest.raises(ValidationError):
            preferences.set_preferences(session, account, timezone="Europe/Berlinn")
        session.flush()

        session.expire(account)
        assert account.timezone == before

    def test_one_invalid_value_leaves_both_values_unchanged(self, session: Session) -> None:
        """Avoid partially changed accounts: validate before assigning."""
        account = make_account(session)
        before = (account.timezone, account.locale)

        with pytest.raises(ValidationError):
            preferences.set_preferences(
                session,
                account,
                timezone="Pacific/Auckland",
                locale="deutsch",
            )
        session.flush()

        session.expire(account)
        assert (account.timezone, account.locale) == before

    def test_setting_one_field_leaves_the_other_unchanged(self, session: Session) -> None:
        account = make_account(session)
        preferences.set_preferences(session, account, locale="fr-FR")
        session.flush()

        session.expire(account)
        assert account.locale == "fr-FR"
        assert account.timezone == "Europe/Berlin"

    def test_stored_timezone_drives_calendar_day_boundary(self, session: Session) -> None:
        """The domain calendar day depends on the stored timezone value."""
        account = make_account(session)
        preferences.set_preferences(session, account, timezone="Pacific/Auckland")
        session.flush()

        assert today_in(account.timezone) == today_in("Pacific/Auckland")


class TestLegacyData:
    def test_reads_remain_fail_safe(self, session: Session) -> None:
        """A previously stored unusable value must not break presentation."""
        account = make_account(session)
        account.timezone = "Kein/Ort"
        session.flush()

        assert today_in(account.timezone) is not None
