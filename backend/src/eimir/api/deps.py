"""Dependencies for the API layer.

The tenant context is established here: a bearer token resolves to an account,
and the account plus path ID resolves to a verified membership. Routes receive
only the completed result so they neither repeat nor accidentally omit the
check.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Path, Request
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.auth.sessions import resolve
from eimir.authorization import AuthorizationContext
from eimir.authorization.server_admin import require_server_admin
from eimir.core.errors import ErrorCode, NotFoundError, UnauthenticatedError
from eimir.core.ids import parse_id
from eimir.db.session import get_session
from eimir.identity.models import Account, DeviceSession
from eimir.observability import bind_actor_context
from eimir.relationship.models import Membership
from eimir.relationship.service import SpaceErrorCode, require_membership

# The unit-of-work exit commits the request transaction. FastAPI's default
# scope for yield dependencies is "request", which runs that exit after the
# response has already been sent. Function scope closes the dependency after
# the route returns but before response serialization is exposed to the client,
# so a successful response cannot race ahead of its commit.
DbSession = Annotated[Session, Depends(get_session, scope="function")]


def _bearer_token(request: Request) -> str:
    """Extract the bearer token from the Authorization header.

    Native clients authenticate exclusively this way, without a session
    cookie. A browser would send a cookie automatically, which would require
    CSRF protection.
    """
    header = request.headers.get("Authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        raise UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)
    return value.strip()


def current_session(request: Request, session: DbSession) -> DeviceSession:
    """Return the device session represented by the bearer token.

    Logout and session management need the session itself; other operations
    normally need only the account.
    """
    return resolve(session, _bearer_token(request))[0]


def current_account(request: Request, session: DbSession) -> Account:
    account = resolve(session, _bearer_token(request))[1]
    bind_actor_context(account_id=account.id)
    return account


CurrentAccount = Annotated[Account, Depends(current_account)]
CurrentSession = Annotated[DeviceSession, Depends(current_session)]


def current_server_admin(session: DbSession, account: CurrentAccount) -> Account:
    """Return the caller only after instance-wide ServerAdmin authorization."""
    return require_server_admin(session, account)


CurrentServerAdmin = Annotated[Account, Depends(current_server_admin)]


def require_normal_operation(session: DbSession) -> None:
    """Block ordinary product routes while maintenance mode is active."""
    administration.ensure_normal_operation(session)


@dataclass(frozen=True)
class TenantContext:
    """A verified account/space pair.

    Holding this context proves membership has already been checked. Anything
    a route loads afterwards must still be constrained by ``space_id``: the
    context proves membership in the space, not ownership of an individual
    resource.
    """

    account: Account
    space_id: UUID
    membership: Membership


def tenant_context(
    session: DbSession,
    account: CurrentAccount,
    space_id: Annotated[str, Path(alias="spaceId")],
) -> TenantContext:
    """Verify access to a space.

    A malformed ID yields 404 rather than 422. Otherwise the response would
    reveal whether a syntactically valid ID exists and create an existence
    oracle from the difference.
    """
    parsed_id = parse_id(space_id)
    if parsed_id is None:
        raise NotFoundError("Space not found.", SpaceErrorCode.NOT_FOUND)

    membership = require_membership(session, account, parsed_id)
    bind_actor_context(account_id=account.id, space_id=parsed_id)
    return TenantContext(account=account, space_id=parsed_id, membership=membership)


Tenant = Annotated[TenantContext, Depends(tenant_context)]


def authorization_context(tenant: Tenant) -> AuthorizationContext:
    """Build the context used for ownership and privacy decisions.

    It is created exclusively from an already verified tenant context. There
    is no second construction path, so a route cannot make a visibility
    decision using an account or space that has not passed membership checks.
    """
    return AuthorizationContext(account_id=tenant.account.id, space_id=tenant.space_id)


Authorization = Annotated[AuthorizationContext, Depends(authorization_context)]


def ensure_capability(
    session: Session,
    space_id: UUID,
    capability: str,
    *,
    lock_grants: bool = True,
) -> None:
    """Verify a commercial capability for a protected operation.

    Protected writes keep the default row lock so concurrent revocation cannot
    race an already-authorized mutation. Read-only product seams may disable
    locking while retaining the same centralized entitlement authority.
    """
    from eimir.core.errors import PremiumEntitlementRequiredError
    from eimir.entitlements import service as entitlement_service

    if not entitlement_service.has_capability(
        session,
        space_id,
        capability,
        lock_grants=lock_grants,
    ):
        raise PremiumEntitlementRequiredError(capability)
