"""Minimal public instance capability state.

Unauthenticated clients need to distinguish planned maintenance and disabled
registration from an ordinary connectivity failure. This endpoint deliberately
exposes only the public effective state and no privileged configuration.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import Field

from eimir.administration import service as administration
from eimir.api.deps import DbSession
from eimir.api.schema import ApiModel
from eimir.auth.policy import (
    AuthCapabilities,
    AuthPolicy,
    resolve_auth_capabilities,
    self_service_signup_supported,
)

router = APIRouter(tags=["instance"])


class InstanceAccessStatus(ApiModel):
    """Public access state.

    Three independent questions are answered separately so a client never
    derives one from another:

    - ``registrationAvailable``: does the administrator currently admit new
      Accounts at all (``false`` during maintenance)?
    - ``accountCreation``: through which path can a new Account come into being
      on this deployment?
    - ``auth``: which methods can an existing Account use to sign in?
    """

    maintenance_mode: bool
    registration_available: bool = Field(
        description=(
            "Whether the administrator currently admits new Accounts. It does not say how an "
            "Account is created and does not affect sign-in of existing Accounts."
        )
    )
    registration_unavailable_reason: Literal["maintenance", "administrator"] | None
    auth: AuthCapabilities = Field(default_factory=resolve_auth_capabilities)
    account_creation: Literal["self_service", "invitation"] = Field(
        default="invitation",
        description=(
            "Deployment policy for new Accounts. `self_service`: a person proves control of "
            "an email address and creates their own Account (Cloud/Managed). `invitation`: a "
            "new Account requires an invitation; the first Self-Hosted Account is an operator "
            "bootstrap, which is not a client path."
        ),
    )
    self_service_signup_available: bool = Field(
        default=False,
        description=(
            "Whether a client should offer self-service signup right now: `accountCreation` is "
            "`self_service` and `registrationAvailable` is true."
        ),
    )


@router.get("/instance/status", response_model=InstanceAccessStatus)
def instance_status(
    session: DbSession,
    auth_policy: AuthPolicy,
) -> InstanceAccessStatus:
    """Return the minimum public state required by login/onboarding clients."""
    state = administration.get_access_state(session)
    reason: Literal["maintenance", "administrator"] | None = None
    if state.maintenance_mode:
        reason = "maintenance"
    elif not state.registration_enabled:
        reason = "administrator"

    self_service = self_service_signup_supported()
    return InstanceAccessStatus(
        maintenance_mode=state.maintenance_mode,
        registration_available=state.effective_registration_enabled,
        registration_unavailable_reason=reason,
        auth=auth_policy,
        account_creation="self_service" if self_service else "invitation",
        self_service_signup_available=self_service and state.effective_registration_enabled,
    )
