"""Recent-authentication API for high-risk operations.

The first purpose is Account deletion. Endpoint names are purpose-specific so a
future ServerAdmin consumer can reuse the same domain without accidentally
accepting an Account-deletion grant for a different privileged action.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, status

from eimir.api.deps import CurrentAccount, CurrentServerAdmin, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import passkey_abuse, recent_auth, recent_oidc, recent_passkeys
from eimir.auth.policy import AuthPolicy

router = APIRouter(tags=["auth"])
PURPOSE = recent_auth.RecentAuthenticationPurpose.ACCOUNT_DELETION
SERVER_ADMIN_PURPOSE = recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION


class PasswordRequest(ApiModel):
    password: str


class PasskeyFinishRequest(ApiModel):
    credential: dict[str, Any]


class OidcCallbackRequest(ApiModel):
    code: str
    state: str


class OidcStartView(ApiModel):
    authorization_url: str
    state: str


class CapabilitiesView(ApiModel):
    local_password: bool
    passkey: bool
    oidc_connections: list[str]
    expires_in_seconds: int


class RecentAuthenticationView(ApiModel):
    purpose: str
    method: str
    achieved_at: datetime
    expires_at: datetime


def _view(result: recent_auth.RecentAuthenticationResult) -> RecentAuthenticationView:
    return RecentAuthenticationView(
        purpose=result.purpose.value,
        method=result.method.value,
        achieved_at=result.achieved_at,
        expires_at=result.expires_at,
    )


@router.get(
    "/auth/recent-authentication/account-deletion",
    response_model=CapabilitiesView,
    responses=problem_responses(401, 403),
)
def capabilities(
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    client: Annotated[
        recent_auth.RecentAuthenticationClient, Query()
    ] = recent_auth.RecentAuthenticationClient.WEB,
) -> CapabilitiesView:
    available = recent_auth.capabilities(session, account, device_session, policy, client=client)
    return CapabilitiesView(
        local_password=available.local_password,
        passkey=available.passkey,
        oidc_connections=list(available.oidc_connections),
        expires_in_seconds=int(recent_auth.RECENT_AUTH_LIFETIME.total_seconds()),
    )


@router.post(
    "/auth/recent-authentication/account-deletion/password",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 429),
)
def password(
    body: PasswordRequest,
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> RecentAuthenticationView:
    policy.ensure_local_password_allowed()
    return _view(
        recent_auth.authenticate_password(
            session,
            account,
            device_session,
            password=body.password,
            purpose=PURPOSE,
        )
    )


@router.post(
    "/auth/recent-authentication/account-deletion/passkeys/start",
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 403, 422, 429),
)
def start_passkey(
    request: Request,
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> dict[str, Any]:
    policy.ensure_passkey_allowed()
    client_host = request.client.host if request.client is not None else None
    passkey_abuse.reserve_authentication_start(session, client_host)
    return recent_passkeys.start(
        session,
        account,
        device_session,
        purpose=PURPOSE,
    )


@router.post(
    "/auth/recent-authentication/account-deletion/passkeys/finish",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 422),
)
def finish_passkey(
    body: PasskeyFinishRequest,
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> RecentAuthenticationView:
    policy.ensure_passkey_allowed()
    return _view(
        recent_passkeys.finish(
            session,
            account,
            device_session,
            purpose=PURPOSE,
            credential=body.credential,
        )
    )


@router.post(
    "/auth/recent-authentication/account-deletion/oidc/{connectionId}/start",
    response_model=OidcStartView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 403, 422, 429),
)
def start_oidc(
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    connection_id: Annotated[str, Path(alias="connectionId")],
    client: Annotated[
        recent_auth.RecentAuthenticationClient, Query()
    ] = recent_auth.RecentAuthenticationClient.WEB,
) -> OidcStartView:
    policy.ensure_oidc_allowed()
    started = recent_oidc.start(
        session,
        connection_id,
        account,
        device_session,
        purpose=PURPOSE,
        client=client,
    )
    return OidcStartView(
        authorization_url=started.authorization_url,
        state=started.state,
    )


@router.post(
    "/auth/recent-authentication/account-deletion/oidc/{connectionId}/callback",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 422),
)
def complete_oidc(
    body: OidcCallbackRequest,
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    connection_id: Annotated[str, Path(alias="connectionId")],
) -> RecentAuthenticationView:
    policy.ensure_oidc_allowed()
    return _view(
        recent_oidc.complete(
            session,
            connection_id,
            account,
            device_session,
            purpose=PURPOSE,
            code=body.code,
            state=body.state,
        )
    )


@router.get(
    "/auth/recent-authentication/server-admin/capabilities",
    response_model=CapabilitiesView,
    responses=problem_responses(401, 403),
)
@router.get(
    "/auth/recent-authentication/server-admin",
    response_model=CapabilitiesView,
    responses=problem_responses(401, 403),
)
def server_admin_capabilities(
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    client: Annotated[
        recent_auth.RecentAuthenticationClient, Query()
    ] = recent_auth.RecentAuthenticationClient.WEB,
) -> CapabilitiesView:
    available = recent_auth.capabilities(session, admin, device_session, policy, client=client)
    return CapabilitiesView(
        local_password=available.local_password,
        passkey=available.passkey,
        oidc_connections=list(available.oidc_connections),
        expires_in_seconds=int(recent_auth.RECENT_AUTH_LIFETIME.total_seconds()),
    )


@router.post(
    "/auth/recent-authentication/server-admin/password",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 429),
)
def server_admin_password(
    body: PasswordRequest,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> RecentAuthenticationView:
    policy.ensure_local_password_allowed()
    return _view(
        recent_auth.authenticate_password(
            session,
            admin,
            device_session,
            password=body.password,
            purpose=SERVER_ADMIN_PURPOSE,
        )
    )


@router.post(
    "/auth/recent-authentication/server-admin/passkeys/start",
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 403, 422, 429),
)
def server_admin_start_passkey(
    request: Request,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> dict[str, Any]:
    policy.ensure_passkey_allowed()
    client_host = request.client.host if request.client is not None else None
    passkey_abuse.reserve_authentication_start(session, client_host)
    return recent_passkeys.start(
        session,
        admin,
        device_session,
        purpose=SERVER_ADMIN_PURPOSE,
    )


@router.post(
    "/auth/recent-authentication/server-admin/passkeys/finish",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 422),
)
def server_admin_finish_passkey(
    body: PasskeyFinishRequest,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
) -> RecentAuthenticationView:
    policy.ensure_passkey_allowed()
    return _view(
        recent_passkeys.finish(
            session,
            admin,
            device_session,
            purpose=SERVER_ADMIN_PURPOSE,
            credential=body.credential,
        )
    )


@router.post(
    "/auth/recent-authentication/server-admin/oidc/{connectionId}/start",
    response_model=OidcStartView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 403, 422, 429),
)
def server_admin_start_oidc(
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    connection_id: Annotated[str, Path(alias="connectionId")],
    client: Annotated[
        recent_auth.RecentAuthenticationClient, Query()
    ] = recent_auth.RecentAuthenticationClient.WEB,
) -> OidcStartView:
    policy.ensure_oidc_allowed()
    started = recent_oidc.start(
        session,
        connection_id,
        admin,
        device_session,
        purpose=SERVER_ADMIN_PURPOSE,
        client=client,
    )
    return OidcStartView(
        authorization_url=started.authorization_url,
        state=started.state,
    )


@router.post(
    "/auth/recent-authentication/server-admin/oidc/{connectionId}/callback",
    response_model=RecentAuthenticationView,
    responses=problem_responses(401, 403, 422),
)
def server_admin_complete_oidc(
    body: OidcCallbackRequest,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    policy: AuthPolicy,
    connection_id: Annotated[str, Path(alias="connectionId")],
) -> RecentAuthenticationView:
    policy.ensure_oidc_allowed()
    return _view(
        recent_oidc.complete(
            session,
            connection_id,
            admin,
            device_session,
            purpose=SERVER_ADMIN_PURPOSE,
            code=body.code,
            state=body.state,
        )
    )
