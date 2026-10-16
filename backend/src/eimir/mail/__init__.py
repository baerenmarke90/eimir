"""Outgoing email.

A magic link that only reaches a log is not a real sign-in path. This package
therefore exposes a boundary with three adapters: development logging, SMTP,
and an explicit no-mail mode.

Configuration selects the adapter. Production refuses to start with the
development adapter, while deliberately disabling mail is valid as long as the
instance reports that capability instead of silently losing tokens.
"""

from __future__ import annotations

from eimir.mail.base import (
    MailMessage,
    MailSender,
    MailTransportError,
    MailUnavailableError,
)
from eimir.mail.log import LoggingMailSender
from eimir.mail.smtp import SmtpMailSender

__all__ = [
    "LoggingMailSender",
    "MailMessage",
    "MailSender",
    "MailTransportError",
    "MailUnavailableError",
    "SmtpMailSender",
    "sender",
]


def sender() -> MailSender:
    """Build the configured adapter.

    Deliberately not a cached module singleton: adapters are cheap to create,
    and tests must be able to switch configuration without resetting hidden
    process state.
    """
    from eimir.config import MailTransport, get_settings

    settings = get_settings()
    if settings.mail_transport is MailTransport.NONE:
        raise MailUnavailableError
    if settings.mail_transport is MailTransport.SMTP:
        return SmtpMailSender(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=(
                settings.smtp_password.get_secret_value()
                if settings.smtp_password is not None
                else ""
            ),
            use_starttls=settings.smtp_starttls,
            sender_address=settings.mail_from,
        )
    return LoggingMailSender(sender_address=settings.mail_from)
