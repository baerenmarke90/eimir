"""Self-Hosted Ed25519 offline license token verification."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519

from eimir.core import clock
from eimir.entitlements.models import EntitlementTier


class LicenseValidationError(Exception):
    """Raised when an offline license token is invalid or expired."""


@dataclass(frozen=True)
class OfflineLicensePayload:
    """Validated contents of an offline license token."""

    licensee: str
    tier: str
    capabilities: list[str]
    issued_at: datetime
    expires_at: datetime | None
    instance_id: str


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.b64decode((data + padding).encode("ascii"), altchars=b"-_", validate=True)


def verify_offline_license(
    license_token: str,
    public_key: ed25519.Ed25519PublicKey,
    *,
    expected_instance_id: str,
    at: datetime | None = None,
) -> OfflineLicensePayload:
    """Verify one instance-bound Ed25519 license without outbound requests.

    Issuing/signing licenses is deliberately outside the runtime core. The
    caller supplies the embedded public key and the local instance identity;
    only signature verification and payload validation happen here.
    """
    if not expected_instance_id.strip():
        raise ValueError("expected_instance_id must not be blank.")

    current_time = clock.ensure_utc(at) if at is not None else clock.now()

    parts = license_token.strip().split(".")
    if len(parts) != 2:
        raise LicenseValidationError("Malformed license token format.")

    try:
        payload_bytes = _b64url_decode(parts[0])
        signature = _b64url_decode(parts[1])
    except Exception as error:
        raise LicenseValidationError("Invalid base64 encoding in license token.") from error

    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature as error:
        raise LicenseValidationError("Invalid license signature.") from error

    try:
        raw_payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as error:
        raise LicenseValidationError("Invalid JSON in license payload.") from error

    if not isinstance(raw_payload, dict):
        raise LicenseValidationError("License payload must be a JSON object.")

    licensee = raw_payload.get("licensee")
    if not isinstance(licensee, str) or not licensee.strip():
        raise LicenseValidationError("Missing or invalid licensee in license payload.")

    tier = raw_payload.get("tier", EntitlementTier.PREMIUM.value)
    if tier != EntitlementTier.PREMIUM.value:
        raise LicenseValidationError("Offline licenses must use the PREMIUM tier.")

    raw_capabilities = raw_payload.get("capabilities", [])
    if not isinstance(raw_capabilities, list) or not all(
        isinstance(capability, str) and capability for capability in raw_capabilities
    ):
        raise LicenseValidationError("Invalid capabilities in license payload.")

    instance_id = raw_payload.get("instance_id")
    if not isinstance(instance_id, str) or not instance_id.strip():
        raise LicenseValidationError("Missing or invalid instance_id in license payload.")
    if instance_id != expected_instance_id:
        raise LicenseValidationError("License token is not valid for this instance.")

    raw_issued_at = raw_payload.get("issued_at")
    if not isinstance(raw_issued_at, str):
        raise LicenseValidationError("Missing issued_at timestamp in license payload.")
    try:
        issued_at = clock.ensure_utc(datetime.fromisoformat(raw_issued_at))
    except Exception as error:
        raise LicenseValidationError("Invalid issued_at timestamp format.") from error

    expires_at: datetime | None = None
    raw_expires_at = raw_payload.get("expires_at")
    if raw_expires_at is not None:
        if not isinstance(raw_expires_at, str):
            raise LicenseValidationError("Invalid expires_at timestamp format.")
        try:
            expires_at = clock.ensure_utc(datetime.fromisoformat(raw_expires_at))
        except Exception as error:
            raise LicenseValidationError("Invalid expires_at timestamp format.") from error
        if expires_at < issued_at:
            raise LicenseValidationError("License expiry precedes its issue timestamp.")

    if current_time < issued_at:
        raise LicenseValidationError("License token is not yet valid (issued in future).")
    if expires_at is not None and current_time > expires_at:
        raise LicenseValidationError("License token has expired.")

    return OfflineLicensePayload(
        licensee=licensee.strip(),
        tier=tier,
        capabilities=raw_capabilities,
        issued_at=issued_at,
        expires_at=expires_at,
        instance_id=instance_id,
    )
