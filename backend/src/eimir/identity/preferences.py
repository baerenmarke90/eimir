"""Account timezone and locale write boundary.

Both values control visible behavior: `timezone` determines which calendar
day currently applies to a person, while `locale` controls language and
formats. As free text they would be a silent source of errors because a typo
might surface only when an anniversary appears on the wrong day.

This module therefore defines exactly one write path for these fields. Every
future write path - account settings, imports, or legacy-data migration - goes
through `set_preferences`. The alternative would be to duplicate validation
at every new endpoint; the rationale for avoiding that is captured in
`authorization.guard`.

Reads remain unaffected: `clock.resolve_zone` still falls back to UTC, with
logging, for already persisted unusable values. Legacy data must not break a
view.
"""

from __future__ import annotations

import re
from zoneinfo import available_timezones

from sqlalchemy.orm import Session

from eimir.core.errors import ValidationError
from eimir.identity.models import Account
from eimir.reminders import runtime as reminder_runtime

MAX_TIMEZONE = 64
MAX_LOCALE = 16


class PreferenceErrorCode:
    TIMEZONE_INVALID = "ACCOUNT_TIMEZONE_INVALID"
    LOCALE_INVALID = "ACCOUNT_LOCALE_INVALID"


_LOCALE = re.compile(
    r"""
    ^
    (?P<language>[A-Za-z]{2,3})
    (?:-(?P<script>[A-Za-z]{4}))?
    (?:-(?P<region>[A-Za-z]{2}|[0-9]{3}))?
    $
    """,
    re.VERBOSE,
)
"""The subset of BCP 47 represented by this product.

Language, optional script, optional region. Variants, extensions, and private
use subtags are excluded because the UI does not expose them, and values the
product does not expose are not persisted.
"""


def validate_timezone(value: str) -> str:
    """Validate an IANA timezone name.

    Validation uses the actually available timezone database rather than a
    pattern: "Europe/Berlinn" looks like a timezone name but is not one.

    Only surrounding whitespace is removed. Casing itself is left untouched:
    "europe/berlin" is rejected rather than silently repaired. A client taking
    the name from the operating system already receives its canonical form;
    manually constructed values should surface mistakes.
    """
    zone = (value or "").strip()
    if not zone or len(zone) > MAX_TIMEZONE or zone not in available_timezones():
        raise ValidationError(
            "Enter a valid IANA time zone, for example Europe/Berlin.",
            PreferenceErrorCode.TIMEZONE_INVALID,
        )
    return zone


def normalize_locale(value: str) -> str:
    """Normalize a locale into canonical spelling.

    The complete rule lives here and applies to every write path:

    - `_` becomes `-`; Android and the JVM may provide `de_DE`.
    - Language is lowercase, script title-cased, and region uppercase. This is
      conventional BCP-47 spelling and only changes representation, not
      meaning.
    - Anything that still does not match the accepted subset is rejected.

    The persisted and returned value are therefore identical: normalizing
    twice does not change it again.
    """
    raw = (value or "").strip().replace("_", "-")
    match = _LOCALE.match(raw) if raw and len(raw) <= MAX_LOCALE else None
    if match is None:
        raise ValidationError(
            "Enter a valid locale, for example de-DE.",
            PreferenceErrorCode.LOCALE_INVALID,
        )

    parts = [match.group("language").lower()]
    if match.group("script"):
        parts.append(match.group("script").capitalize())
    if match.group("region"):
        parts.append(match.group("region").upper())
    return "-".join(parts)


def set_preferences(
    session: Session,
    account: Account,
    *,
    timezone: str | None = None,
    locale: str | None = None,
) -> Account:
    """Set timezone and/or locale through the single supported write path.

    Both values are fully validated before either is assigned. An invalid
    second value must not leave a partially changed account behind.
    """
    validated_zone = validate_timezone(timezone) if timezone is not None else None
    validated_locale = normalize_locale(locale) if locale is not None else None
    timezone_changed = validated_zone is not None and validated_zone != account.timezone

    if validated_zone is not None:
        account.timezone = validated_zone
    if validated_locale is not None:
        account.locale = validated_locale

    session.flush()
    if timezone_changed:
        reminder_runtime.reconcile_account(session, account, timezone_name=validated_zone)
    return account
