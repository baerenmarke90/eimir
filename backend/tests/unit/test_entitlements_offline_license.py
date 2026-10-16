"""Unit tests for Self-Hosted Ed25519 offline license verification."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519

from eimir.entitlements.offline_license import (
    LicenseValidationError,
    verify_offline_license,
)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sign_test_license(payload: dict[str, Any], private_key: ed25519.Ed25519PrivateKey) -> str:
    """Build test evidence without adding license-issuer behavior to runtime code."""
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    signature = private_key.sign(payload_bytes)
    return f"{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"


@pytest.fixture
def keypair() -> tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey]:
    priv = ed25519.Ed25519PrivateKey.generate()
    return priv, priv.public_key()


def test_valid_offline_license_verification(
    keypair: tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey],
) -> None:
    priv, pub = keypair
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)

    payload = {
        "licensee": "Acme Family",
        "tier": "PREMIUM",
        "capabilities": ["storage.cloud_quota_50gb", "recap.pdf_yearbook"],
        "issued_at": (now - timedelta(days=1)).isoformat(),
        "expires_at": (now + timedelta(days=365)).isoformat(),
        "instance_id": "inst-12345",
    }

    token = _sign_test_license(payload, priv)
    verified = verify_offline_license(
        token,
        pub,
        expected_instance_id="inst-12345",
        at=now,
    )

    assert verified.licensee == "Acme Family"
    assert verified.tier == "PREMIUM"
    assert verified.capabilities == ["storage.cloud_quota_50gb", "recap.pdf_yearbook"]
    assert verified.instance_id == "inst-12345"
    assert verified.expires_at == now + timedelta(days=365)


def test_offline_license_rejects_other_instance(
    keypair: tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey],
) -> None:
    priv, pub = keypair
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    payload = {
        "licensee": "Acme Family",
        "tier": "PREMIUM",
        "capabilities": ["recap.pdf_yearbook"],
        "issued_at": (now - timedelta(days=1)).isoformat(),
        "expires_at": (now + timedelta(days=365)).isoformat(),
        "instance_id": "inst-12345",
    }

    token = _sign_test_license(payload, priv)
    with pytest.raises(LicenseValidationError, match="not valid for this instance"):
        verify_offline_license(
            token,
            pub,
            expected_instance_id="inst-other",
            at=now,
        )


def test_expired_offline_license_rejected(
    keypair: tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey],
) -> None:
    priv, pub = keypair
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)

    payload = {
        "licensee": "Expired Licensee",
        "tier": "PREMIUM",
        "capabilities": [],
        "issued_at": (now - timedelta(days=400)).isoformat(),
        "expires_at": (now - timedelta(days=35)).isoformat(),
        "instance_id": "inst-expired",
    }

    token = _sign_test_license(payload, priv)
    with pytest.raises(LicenseValidationError, match="License token has expired"):
        verify_offline_license(
            token,
            pub,
            expected_instance_id="inst-expired",
            at=now,
        )


def test_tampered_signature_rejected(
    keypair: tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey],
) -> None:
    _, pub = keypair
    other_priv = ed25519.Ed25519PrivateKey.generate()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)

    payload = {
        "licensee": "Tampered",
        "tier": "PREMIUM",
        "capabilities": [],
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(days=30)).isoformat(),
        "instance_id": "inst-tampered",
    }

    # Signed with a different private key than the public key being used.
    token = _sign_test_license(payload, other_priv)
    with pytest.raises(LicenseValidationError, match="Invalid license signature"):
        verify_offline_license(
            token,
            pub,
            expected_instance_id="inst-tampered",
            at=now,
        )


def test_malformed_token_rejected(
    keypair: tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey],
) -> None:
    _, pub = keypair
    with pytest.raises(LicenseValidationError, match="Malformed license token"):
        verify_offline_license(
            "not-a-valid-token",
            pub,
            expected_instance_id="inst-test",
        )

    with pytest.raises(LicenseValidationError, match="Invalid base64 encoding"):
        verify_offline_license(
            "invalid!part1.invalid!part2",
            pub,
            expected_instance_id="inst-test",
        )
