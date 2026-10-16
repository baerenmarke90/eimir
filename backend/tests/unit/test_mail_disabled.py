"""Behavior of an instance without a mail transport.

`EIMIR_MAIL_TRANSPORT=none` is an explicit opt-out. Mail-dependent sign-in paths
must report that condition instead of generating a token and returning
`202 Accepted`; acknowledging a message that will never exist is worse than
returning an error.
"""

from __future__ import annotations

import pytest

from eimir.config import MailTransport, Settings, get_settings
from eimir.mail import MailTransportError, MailUnavailableError, sender


@pytest.fixture
def without_mail_transport(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings().model_copy(update={"mail_transport": MailTransport.NONE})
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)


def test_sender_refuses_instead_of_sending_nowhere(without_mail_transport: None) -> None:
    with pytest.raises(MailUnavailableError):
        sender()


def test_error_is_not_a_delivery_failure() -> None:
    """Otherwise auth-flow intent hiding would swallow it.

    `_deliver` deliberately catches `MailTransportError` so the response does
    not reveal whether an address exists. If a missing mail path were a subtype,
    the endpoint would still return `202`.
    """
    assert not issubclass(MailUnavailableError, MailTransportError)


def test_response_uses_stable_code() -> None:
    error = MailUnavailableError()
    assert error.code == "MAIL_TRANSPORT_UNAVAILABLE"
    assert error.status == 503


def test_log_delivery_remains_development_path() -> None:
    """`none` does not replace `log`; both modes coexist."""
    assert Settings(mail_transport="log").mail_transport is MailTransport.LOG  # type: ignore[arg-type]
