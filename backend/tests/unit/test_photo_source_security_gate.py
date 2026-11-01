"""Google safety gating stays closed independently of operator configuration."""

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import Response

from eimir.api.v1 import photo_sources as api
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ServiceUnavailableError
from eimir.photo_sources import service
from eimir.photo_sources.models import PhotoSelection, PhotoSelectionPayload
from eimir.security.keyring import EncryptionMode


@pytest.fixture
def secure_configuration(monkeypatch):
    settings = SimpleNamespace(
        photo_sources_enabled=True,
        encryption_mode=EncryptionMode.REQUIRED,
        public_base_url="https://eimir.example",
        google_photos_client_id="synthetic-client-id",
        google_photos_client_secret="synthetic-client-secret",
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    monkeypatch.setattr(api, "get_settings", lambda: settings)
    monkeypatch.setattr(service, "ensure_capability", Mock())
    return settings


def context():
    return AuthorizationContext(account_id=uuid4(), space_id=uuid4())


def test_configured_encrypted_premium_deployment_still_hides_google(
    secure_configuration, monkeypatch
):
    session = Mock()
    monkeypatch.setattr(service, "connection", Mock(return_value=None))
    monkeypatch.setattr(api, "has_capability", Mock(return_value=True))
    availability = api.sources(context(), session, Response())
    assert service.enabled() is True
    assert service.google_import_available() is False
    assert availability.enabled is True
    assert availability.can_import is True
    assert availability.google_available is False


def test_direct_google_start_cannot_create_provider_or_local_state(
    secure_configuration, monkeypatch
):
    session = Mock()
    authorization = Mock()
    monkeypatch.setattr(service.google_photos, "authorization", authorization)
    with pytest.raises(ServiceUnavailableError):
        service.start(session, context(), SimpleNamespace(id=uuid4()), "google", 2)
    authorization.assert_not_called()
    session.execute.assert_not_called()
    session.add.assert_not_called()


def test_google_callback_cannot_exchange_even_a_known_state(secure_configuration, monkeypatch):
    session = Mock()
    exchange = Mock()
    monkeypatch.setattr(service.google_photos, "exchange", exchange)
    assert service.callback(session, "synthetic-state", "synthetic-code") is None
    session.execute.assert_not_called()
    exchange.assert_not_called()


def test_legacy_google_ownership_allows_erasure_but_not_commercial_access(secure_configuration):
    auth = context()
    device = SimpleNamespace(id=uuid4())
    identifier = uuid4()
    row = PhotoSelection(
        id=identifier,
        account_id=auth.account_id,
        space_id=auth.space_id,
        device_session_id=device.id,
        provider="google",
        payload=PhotoSelectionPayload(
            selection_id=identifier,
            account_id=auth.account_id,
            space_id=auth.space_id,
            device_session_id=device.id,
        ),
    )
    session = Mock()
    session.execute.return_value.scalar_one_or_none.return_value = row
    with pytest.raises(ServiceUnavailableError):
        service.owned(session, auth, device, str(identifier))
    assert service.owned(session, auth, device, str(identifier), commercial=False) is row


@pytest.mark.parametrize("operation", ["poll", "read"])
def test_direct_legacy_google_transfer_seams_fail_before_network(
    secure_configuration, monkeypatch, operation
):
    session = Mock()
    row = SimpleNamespace(provider="google")
    picker = Mock()
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", picker)
    with pytest.raises(ServiceUnavailableError):
        if operation == "poll":
            service.advance(session, row)
        else:
            service.read_item(session, row, "synthetic-item", thumbnail=False)
    picker.assert_not_called()
    session.execute.assert_not_called()


def test_google_cleanup_still_deletes_remote_session_when_new_imports_are_blocked(
    secure_configuration, monkeypatch
):
    session = Mock()
    row = SimpleNamespace(
        provider="google",
        payload=SimpleNamespace(
            access_token="synthetic-access-token", provider_session_id="synthetic-picker"
        ),
    )
    picker = Mock()
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Mock(return_value=picker))
    service.remove(session, row)
    picker.delete.assert_called_once_with("synthetic-picker")
    session.delete.assert_called_once_with(row)
    session.flush.assert_called_once()
