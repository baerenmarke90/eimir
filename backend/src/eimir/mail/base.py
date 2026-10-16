"""Boundary for outgoing mail.

The application core knows neither SMTP nor a provider. It knows a message and
a sender.

One rule applies to every implementation: **message content does not belong in
logs.** Authentication mail carries a valid one-time token. Logging that token
would create a second copy of the authentication proof in a system with very
different retention and access controls.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from http import HTTPStatus

from eimir.core.errors import DomainError


class MailTransportError(RuntimeError):
    """The message could not be handed to the transport.

    This deliberately has its own type so callers can distinguish delivery
    failure from programming errors without parsing an exception message.
    """


class MailUnavailableError(DomainError):
    """This instance does not send email.

    Deliberately **not** a ``MailTransportError``: delivery failures are hidden
    by authentication flows so their responses cannot reveal whether an
    address exists. A missing mail path is instead an instance capability and
    may be disclosed because it is identical for every address.

    503 rather than 404: the endpoint exists, but the capability behind it is
    unavailable.
    """

    status = HTTPStatus.SERVICE_UNAVAILABLE
    type = "mail_unavailable"
    title = "Mail unavailable"

    def __init__(self) -> None:
        super().__init__(
            "This instance does not send email. "
            "Sign-in remains available through password, passkey, or OIDC.",
            "MAIL_TRANSPORT_UNAVAILABLE",
        )


@dataclass(frozen=True)
class MailMessage:
    """A message for exactly one recipient."""

    to: str
    subject: str
    body: str

    def __post_init__(self) -> None:
        # A newline in subject or address would permit header injection: text
        # following it would become another header field.
        for field, value in (("to", self.to), ("subject", self.subject)):
            if "\r" in value or "\n" in value:
                raise ValueError(f"{field} must not contain a newline")
        if not self.to.strip() or not self.subject.strip():
            raise ValueError("Recipient and subject are required")


class MailSender(ABC):
    @abstractmethod
    def send(self, message: MailMessage) -> None:
        """Hand off the message or raise ``MailTransportError``."""
