"""API and worker share one provider configuration lifecycle."""

from __future__ import annotations

import base64

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

from eimir.config import Settings
from eimir.engagement import fcm_push, push, push_providers, unified_push


def test_factory_replaces_only_owned_transports_and_closes_old_sender(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda _: object())
    private = ec.generate_private_key(ec.SECP256R1()).private_numbers().private_value
    key = base64.urlsafe_b64encode(private.to_bytes(32, "big")).rstrip(b"=").decode()
    settings = Settings(
        push_fcm_project_id="eimir-test",
        push_fcm_android_package="de.eimir.app",
        push_fcm_credentials_file="/unused/fixture.json",
        push_vapid_private_key=SecretStr(key),
        push_vapid_subject="mailto:push@example.org",
        push_webpush_allowed_origins=["https://push.example.org"],
    )
    push.providers.clear()
    # The registry is structural at runtime; this unrelated sentinel must survive.
    unrelated = unified_push.UnifiedPushProvider(settings)
    push.providers.register("unrelated", unrelated)
    try:
        push_providers.configure_push_providers(settings)
        first = push.providers.get("fcm")
        assert isinstance(first, fcm_push.FcmPushProvider)
        assert isinstance(push.providers.get("unifiedpush"), unified_push.UnifiedPushProvider)
        push_providers.configure_push_providers(settings)
        second = push.providers.get("fcm")
        assert second is not first
        assert first._client.is_closed
        assert push.providers.get("unrelated") is unrelated

        push_providers.configure_push_providers(Settings())
        assert push.providers.get("fcm") is None
        assert push.providers.get("unifiedpush") is None
        assert push.providers.get("unrelated") is unrelated
        assert isinstance(second, fcm_push.FcmPushProvider)
        assert second._client.is_closed
    finally:
        push_providers.configure_push_providers(Settings())
        push.providers.clear()
