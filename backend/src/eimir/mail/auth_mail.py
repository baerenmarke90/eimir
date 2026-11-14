"""Authentication mail: sign-up, sign-in, address and password links.

Every mail of this family carries a one-time link. The wording never depends on
whether an account exists: sign-up mail goes to known and unknown addresses
alike and must not reveal which one it is. The layout lives in
:mod:`eimir.mail.service_mail`.
"""

from __future__ import annotations

from datetime import timedelta
from enum import StrEnum

from eimir.mail.base import MailMessage
from eimir.mail.service_mail import service_mail


class AuthMailKind(StrEnum):
    """Which message is being sent; also the i18n key segment."""

    SIGN_IN = "magic"
    SIGN_UP = "signup"
    VERIFY_EMAIL = "verification"
    RECOVERY = "recovery"


def auth_mail(
    kind: AuthMailKind,
    *,
    to: str,
    locale: str,
    url: str,
    lifetime: timedelta,
) -> MailMessage:
    """Build the localized HTML and plain-text message for one authentication link."""
    return service_mail(f"auth.{kind.value}", to=to, locale=locale, url=url, lifetime=lifetime)
