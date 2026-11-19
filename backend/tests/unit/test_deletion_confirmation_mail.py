"""The deletion confirmation is localized, rich and still best effort."""

from __future__ import annotations

from uuid import uuid4

import pytest

from eimir.identity import deletion_self_service
from eimir.identity.deletion_models import DeletionConfirmationMailStatus
from eimir.mail import MailMessage, MailSender, MailTransportError


class _Recorder(MailSender):
    def __init__(self, error: Exception | None = None) -> None:
        self.messages: list[MailMessage] = []
        self.error = error

    def send(self, message: MailMessage) -> None:
        if self.error is not None:
            raise self.error
        self.messages.append(message)


@pytest.fixture
def results(monkeypatch: pytest.MonkeyPatch) -> list[DeletionConfirmationMailStatus]:
    recorded: list[DeletionConfirmationMailStatus] = []
    monkeypatch.setattr(
        deletion_self_service,
        "_record_confirmation_mail_result",
        lambda account_id, result: recorded.append(result),
    )
    return recorded


@pytest.mark.parametrize(
    ("locale", "subject"),
    [("de", "Deine Kontolöschung wurde gestartet"), ("en", "Your account deletion has started")],
)
def test_confirmation_uses_the_recipient_language_and_the_shared_layout(
    results: list[DeletionConfirmationMailStatus], locale: str, subject: str
) -> None:
    mail = _Recorder()
    deletion_self_service._deliver_confirmation(
        uuid4(), primary_email="gone@example.org", locale=locale, mail=mail
    )

    [message] = mail.messages
    assert message.to == "gone@example.org"
    assert message.subject == subject
    assert message.html is not None and message.language == locale
    assert results == [DeletionConfirmationMailStatus.SENT]


def test_transport_failure_is_recorded_and_never_raised(
    results: list[DeletionConfirmationMailStatus],
) -> None:
    deletion_self_service._deliver_confirmation(
        uuid4(),
        primary_email="gone@example.org",
        locale="de",
        mail=_Recorder(MailTransportError("down")),
    )
    assert results == [DeletionConfirmationMailStatus.FAILED]
