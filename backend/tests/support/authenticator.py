"""A virtual authenticator for the WebAuthn tests.

It constructs `attestationObject`, `clientDataJSON`, and assertions directly
and signs with a real P-256 key. This makes the suite exercise signature, flag,
and counter verification for real. Recorded fixtures could not do that because
they would be bound to a fixed challenge and origin.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
from dataclasses import dataclass, field
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

FLAG_USER_PRESENT = 0x01
FLAG_USER_VERIFIED = 0x04
FLAG_BACKUP_ELIGIBLE = 0x08
FLAG_BACKUP_STATE = 0x10
FLAG_ATTESTED_DATA = 0x40


def b64url(raw_data: bytes) -> str:
    return base64.urlsafe_b64encode(raw_data).decode("ascii").rstrip("=")


def from_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass
class VirtualAuthenticator:
    """A device with exactly one key pair."""

    rp_id: str = "localhost"
    origin: str = "http://localhost:8000"
    aaguid: bytes = b"\x00" * 16
    sign_count: int = 0
    private_key: ec.EllipticCurvePrivateKey = field(
        default_factory=lambda: ec.generate_private_key(ec.SECP256R1())
    )
    credential_id: bytes = field(default_factory=lambda: os.urandom(32))
    backup_eligible: bool = False
    backup_state: bool = False
    supports_resident_key: bool = True

    def _cose_key(self) -> bytes:
        numbers = self.private_key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,  # kty: EC2
                3: -7,  # alg: ES256
                -1: 1,  # crv: P-256
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _flags(self, *, attested: bool, user_verified: bool) -> int:
        flags = FLAG_USER_PRESENT
        if user_verified:
            flags |= FLAG_USER_VERIFIED
        if self.backup_eligible:
            flags |= FLAG_BACKUP_ELIGIBLE
        if self.backup_state:
            flags |= FLAG_BACKUP_STATE
        if attested:
            flags |= FLAG_ATTESTED_DATA
        return flags

    def _auth_data(
        self,
        *,
        attested: bool,
        rp_id: str | None = None,
        user_verified: bool = True,
    ) -> bytes:
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode("utf-8")).digest()
        data = rp_hash + bytes([self._flags(attested=attested, user_verified=user_verified)])
        data += struct.pack(">I", self.sign_count)
        if attested:
            cose_key = self._cose_key()
            data += (
                self.aaguid
                + struct.pack(">H", len(self.credential_id))
                + self.credential_id
                + cose_key
            )
        return data

    def _client_data(
        self, *, ceremony_type: str, challenge: str, origin: str | None = None
    ) -> bytes:
        return json.dumps(
            {
                "type": ceremony_type,
                "challenge": challenge,
                "origin": origin or self.origin,
                "crossOrigin": False,
            },
            separators=(",", ":"),
        ).encode("utf-8")

    def register(
        self, options: dict[str, Any], *, origin: str | None = None, rp_id: str | None = None
    ) -> dict[str, Any]:
        selection = options.get("authenticatorSelection")
        if (
            isinstance(selection, dict)
            and selection.get("residentKey") == "required"
            and not self.supports_resident_key
        ):
            raise ValueError("Authenticator cannot create a required discoverable credential.")

        client_data = self._client_data(
            ceremony_type="webauthn.create",
            challenge=options["challenge"],
            origin=origin,
        )
        auth_data = self._auth_data(attested=True, rp_id=rp_id)
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64url(self.credential_id),
            "rawId": b64url(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64url(client_data),
                "attestationObject": b64url(attestation),
            },
            "clientExtensionResults": {},
            "transports": ["internal"],
        }

    def authenticate(
        self,
        options: dict[str, Any],
        *,
        origin: str | None = None,
        rp_id: str | None = None,
        increment_counter: bool = True,
        sign_with: ec.EllipticCurvePrivateKey | None = None,
        user_verified: bool = True,
    ) -> dict[str, Any]:
        if increment_counter:
            self.sign_count += 1
        client_data = self._client_data(
            ceremony_type="webauthn.get", challenge=options["challenge"], origin=origin
        )
        auth_data = self._auth_data(
            attested=False,
            rp_id=rp_id,
            user_verified=user_verified,
        )
        signature = (sign_with or self.private_key).sign(
            auth_data + hashlib.sha256(client_data).digest(),
            ec.ECDSA(hashes.SHA256()),
        )
        return {
            "id": b64url(self.credential_id),
            "rawId": b64url(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64url(client_data),
                "authenticatorData": b64url(auth_data),
                "signature": b64url(signature),
                "userHandle": None,
            },
            "clientExtensionResults": {},
        }
