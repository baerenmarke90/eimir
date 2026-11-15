"""Account mail without a token: notifications and the deletion confirmation.

Both use the shared layout of :mod:`eimir.mail.service_mail`. Neither carries a
one-time link, so neither shows a validity or security tip.
"""

from __future__ import annotations

from eimir.mail.base import MailMessage
from eimir.mail.service_mail import service_mail

_ACCOUNT_SERVICE = "mail.service.account"


def notification_mail(*, to: str, locale: str, app_url: str) -> MailMessage:
    """The generic external notification.

    It reveals no event kind, partner or content: mail is stored and relayed by
    systems outside eimir., so the message only says that something new exists.
    """
    return service_mail(
        "notification",
        to=to,
        locale=locale,
        url=app_url.rstrip("/"),
        service_key=_ACCOUNT_SERVICE,
    )


def deletion_confirmation_mail(*, to: str, locale: str) -> MailMessage:
    """Best-effort confirmation that an account deletion has started."""
    return service_mail("deletion", to=to, locale=locale, service_key=_ACCOUNT_SERVICE)
