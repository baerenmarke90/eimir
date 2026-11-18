"""Only the mailed signup proof can create a Cloud Account under the terms of use."""

from __future__ import annotations

from unittest.mock import Mock

import pytest
from sqlalchemy.orm import Session

from eimir.auth import oidc
from eimir.core.errors import ConflictError
from eimir.legal import terms


def onboard() -> object:
    return oidc._onboard_with_invitation(
        Mock(spec=Session),
        request=Mock(invitation_token_hash="invitation-hash"),
        claims={},
        issuer="https://idp.example.invalid",
        subject="subject",
        connection_id="connection",
    )


def test_cloud_oidc_onboarding_cannot_create_an_account(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(terms, "required_terms_version", lambda: terms.TERMS_OF_USE_VERSION)
    accept = Mock()
    monkeypatch.setattr(oidc.invitations, "accept_with_new_account", accept)

    with pytest.raises(ConflictError) as raised:
        onboard()

    assert raised.value.code == terms.TermsErrorCode.ACCEPTANCE_REQUIRED
    accept.assert_not_called()


def test_self_hosted_oidc_onboarding_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(terms, "required_terms_version", lambda: None)
    account = Mock()
    accept = Mock(return_value=(account, None))
    monkeypatch.setattr(oidc.invitations, "accept_with_new_account", accept)

    assert onboard() is account
    accept.assert_called_once()


@pytest.mark.parametrize("version", [None, terms.TERMS_OF_USE_VERSION])
def test_current_or_missing_versions_pass_through(
    monkeypatch: pytest.MonkeyPatch, version: str | None
) -> None:
    monkeypatch.setattr(terms, "required_terms_version", lambda: terms.TERMS_OF_USE_VERSION)

    assert terms.ensure_current_version(version) == version


@pytest.mark.parametrize("required", [None, terms.TERMS_OF_USE_VERSION])
def test_any_other_version_is_outdated(
    monkeypatch: pytest.MonkeyPatch, required: str | None
) -> None:
    monkeypatch.setattr(terms, "required_terms_version", lambda: required)

    with pytest.raises(ConflictError) as raised:
        terms.ensure_current_version("2000-01-01")

    assert raised.value.code == terms.TermsErrorCode.VERSION_OUTDATED
