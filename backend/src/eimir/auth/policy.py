"""Server-authoritative authentication capability policy.

Enforces deployment-mode authentication restrictions on the server side so that
deployment boundaries (Cloud/Managed vs Self-Hosted) are cryptographic/authoritative
boundaries rather than merely UI conventions.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends

from eimir import config
from eimir.api.schema import ApiModel
from eimir.config import Deployment, MailTransport
from eimir.core.errors import AuthMethodDisabledError

if TYPE_CHECKING:
    from eimir.config import Settings


class AuthCapabilities(ApiModel):
    """Authoritative authentication capabilities for this instance.

    Reused across the backend auth router, service layers, and capability
    projections to clients.
    """

    local_password: bool
    passkey: bool
    magic_link: bool
    oidc: bool

    def ensure_local_password_allowed(self) -> None:
        """Reject local password operations if disabled by deployment policy."""
        if not self.local_password:
            raise AuthMethodDisabledError(
                "Local password authentication is not supported on this deployment."
            )

    def ensure_passkey_allowed(self) -> None:
        """Reject passkey ceremonies if disabled by deployment policy."""
        if not self.passkey:
            raise AuthMethodDisabledError(
                "Passkey authentication is not supported on this deployment."
            )

    def ensure_magic_link_allowed(self) -> None:
        """Reject magic link operations if disabled by deployment policy."""
        if not self.magic_link:
            raise AuthMethodDisabledError(
                "Magic link authentication is not supported on this deployment."
            )

    def ensure_oidc_allowed(self) -> None:
        """Reject OIDC authentication if disabled by deployment policy."""
        if not self.oidc:
            raise AuthMethodDisabledError(
                "OIDC authentication is not supported on this deployment."
            )


def resolve_auth_capabilities(settings: Settings | None = None) -> AuthCapabilities:
    """Derive authentication capabilities from deployment mode and configuration.

    Rules:
    - Local password: supported on Self-Hosted; disabled on Cloud.
    - Passkeys: supported in both deployment modes.
    - Magic Link: supported when mail transport is configured (not NONE).
    - OIDC: supported when one or more OIDC connections are configured.
    """
    if settings is None:
        settings = config.get_settings()

    local_password = settings.deployment is Deployment.SELF_HOSTED
    passkey = True
    magic_link = settings.mail_transport is not MailTransport.NONE
    oidc = len(settings.oidc_connections) > 0

    return AuthCapabilities(
        local_password=local_password,
        passkey=passkey,
        magic_link=magic_link,
        oidc=oidc,
    )


def self_service_signup_supported(settings: Settings | None = None) -> bool:
    """Return whether this deployment lets a verified person create their own Account.

    Only Cloud/Managed offers self-service Account creation (#923), and only
    through a method that proves control of an address before the Account
    exists, which today is the mailed signup proof. Self-Hosted never does: its
    first local Account needs the operator bootstrap proof and every later one
    an invitation.

    This is deployment policy only. Whether the administrator currently admits
    new Accounts remains the separate registration state, and neither of the two
    says which sign-in methods an existing Account may use.
    """
    if settings is None:
        settings = config.get_settings()
    return (
        settings.deployment is Deployment.CLOUD and resolve_auth_capabilities(settings).magic_link
    )


def ensure_self_service_signup_supported(settings: Settings | None = None) -> None:
    """Reject self-service onboarding before any address or proof is looked at."""
    if not self_service_signup_supported(settings):
        raise AuthMethodDisabledError("Self-service signup is not supported on this deployment.")


def get_auth_capabilities() -> AuthCapabilities:
    """FastAPI dependency returning current instance auth capabilities."""
    return resolve_auth_capabilities(config.get_settings())


AuthPolicy = Annotated[AuthCapabilities, Depends(get_auth_capabilities)]
