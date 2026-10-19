"""Invitation continuation stays transient and outside HTTP callback queries."""

from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy.orm import Session

from eimir.auth import cloud
from eimir.mail import MailSender


@pytest.mark.parametrize("invitation", [None, "invite+&=#/with spaces"])
def test_signup_mail_preserves_only_an_encoded_fragment_continuation(
    monkeypatch: pytest.MonkeyPatch, invitation: str | None
) -> None:
    session = Mock(spec=Session)
    mail = Mock(spec=MailSender)
    issue = Mock(return_value=(None, SimpleNamespace(token="mailbox-proof")))
    monkeypatch.setattr(cloud, "ensure_self_service_signup_supported", lambda: None)
    monkeypatch.setattr(cloud.rate_limit, "check", Mock())
    monkeypatch.setattr(cloud.rate_limit, "record_attempt", Mock())
    monkeypatch.setattr(cloud.action_tokens, "issue_signup_proof", issue)
    monkeypatch.setattr(
        cloud,
        "get_settings",
        lambda: SimpleNamespace(public_base_url="https://eimir.invalid"),
    )

    cloud.request_signup(
        session,
        email="partner@example.invalid",
        mail=mail,
        client_host="127.0.0.1",
        invitation_token=invitation,
    )

    message = mail.send.call_args.args[0]
    link = next(line for line in message.body.splitlines() if line.startswith("https://"))
    parsed = urlsplit(link)
    assert parsed.scheme == "https"
    assert parsed.netloc == "eimir.invalid"
    assert parsed.path == "/auth/signup"
    assert parse_qs(parsed.query) == {"token": ["mailbox-proof"]}
    assert parse_qs(parsed.fragment) == (
        {"invitationToken": [invitation]} if invitation is not None else {}
    )
    assert message.to == "partner@example.invalid"
    issue.assert_called_once_with(session, "partner@example.invalid")
    assert session.mock_calls == []
