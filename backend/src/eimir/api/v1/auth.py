"""Authentication API.

Responses are intentionally terse. An authentication endpoint that helpfully
explains which part was wrong provides the same information to an attacker
trying to enumerate accounts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, Response, status

from eimir.api.deps import CurrentAccount, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import cloud, local, oidc, passkey_abuse, passkeys, sessions
from eimir.auth.local import SignedIn
from eimir.auth.policy import AuthPolicy
from eimir.config import get_settings
from eimir.mail import MailSender, sender

router = APIRouter(tags=["auth"])

MAX_DEVICE_NAME = 120

Mail = Annotated[MailSender, Depends(sender)]
"""Mail delivery dependency.

The boundary is replaceable: tests use a collector, while production uses the
configured adapter.

On an instance without a mail path (``EIMIR_MAIL_TRANSPORT=none``), resolving
this dependency already raises ``MailUnavailableError``. The endpoint then
does not begin work at all; otherwise it could create a token, consume a
rate-limit reservation, and return ``202 Accepted`` even though no message can
be delivered.
"""


class RegisterRequest(ApiModel):
    display_name: str
    email: str
    password: str
    invitation_token: str | None = None
    bootstrap_token: str | None = None
    device_name: str = ""
    platform: str = ""


class SignInRequest(ApiModel):
    email: str
    password: str
    device_name: str = ""
    platform: str = ""


class RefreshRequest(ApiModel):
    refresh_token: str


class ChangePasswordRequest(ApiModel):
    current_password: str
    new_password: str


class EmailRequest(ApiModel):
    email: str


class MagicLinkConsumeRequest(ApiModel):
    token: str
    device_name: str = ""
    platform: str = ""


class SignupConsumeRequest(ApiModel):
    token: str
    display_name: str | None = None
    """Used only when the proof creates a new Account; ignored for an existing one."""
    device_name: str = ""
    platform: str = ""


class TokenOnlyRequest(ApiModel):
    token: str


class PasskeyRegistrationRequest(ApiModel):
    credential: dict[str, Any]
    name: str = ""


class PasskeyAuthenticationRequest(ApiModel):
    credential: dict[str, Any]
    device_name: str = ""
    platform: str = ""


class PasskeyView(ApiModel):
    id: UUID
    name: str
    created_at: datetime


class OidcStartRequest(ApiModel):
    invitation_token: str | None = None


class OidcCallbackRequest(ApiModel):
    code: str
    state: str
    device_name: str = ""
    platform: str = ""


class OidcStartView(ApiModel):
    authorization_url: str
    state: str
    """The client retains state and sends it back on the callback."""


class RecoveryConsumeRequest(ApiModel):
    token: str
    new_password: str
    device_name: str = ""
    platform: str = ""


class AccountView(ApiModel):
    id: UUID
    display_name: str


class TokenView(ApiModel):
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


class SessionView(ApiModel):
    account: AccountView
    tokens: TokenView


class SignupSessionView(SessionView):
    account_created: bool
    """True when this redemption created the Account.

    Only the holder of the mailed one-time proof receives this response, so it
    reveals nothing to someone probing addresses. Clients use it to continue
    with name confirmation and Space creation instead of guessing.
    """


def _view(result: SignedIn | cloud.SignedIn | oidc.SignedIn | passkeys.SignedIn) -> SessionView:
    return SessionView(
        account=AccountView(id=result.account.id, display_name=result.account.display_name),
        tokens=TokenView(
            access_token=result.tokens.access_token,
            refresh_token=result.tokens.refresh_token,
            access_expires_at=result.tokens.access_expires_at,
            refresh_expires_at=result.tokens.refresh_expires_at,
        ),
    )


@router.post(
    "/auth/register",
    response_model=SessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(403, 409, 422, 429),
)
def register(body: RegisterRequest, session: DbSession, policy: AuthPolicy) -> SessionView:
    """Create an account.

    The first account requires the one-time bootstrap proof. Every later
    registration requires a valid invitation.
    """
    policy.ensure_local_password_allowed()
    configured = get_settings().bootstrap_token
    return _view(
        local.register(
            session,
            display_name=body.display_name,
            email=body.email,
            password=body.password,
            invitation_token=body.invitation_token,
            bootstrap_token=body.bootstrap_token,
            configured_bootstrap_token=(
                configured.get_secret_value() if configured is not None else None
            ),
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )


@router.post(
    "/auth/sign-in",
    response_model=SessionView,
    responses=problem_responses(401, 403, 422, 429),
)
def sign_in(body: SignInRequest, session: DbSession, policy: AuthPolicy) -> SessionView:
    policy.ensure_local_password_allowed()
    return _view(
        local.sign_in(
            session,
            email=body.email,
            password=body.password,
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )


@router.post(
    "/auth/refresh",
    response_model=TokenView,
    responses=problem_responses(401, 422, 429),
)
def refresh(body: RefreshRequest, session: DbSession) -> TokenView:
    tokens = sessions.refresh_session(session, body.refresh_token)
    return TokenView(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        access_expires_at=tokens.access_expires_at,
        refresh_expires_at=tokens.refresh_expires_at,
    )


@router.post(
    "/auth/sign-out",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(401),
)
def sign_out(device_session: CurrentSession) -> None:
    """End this session while leaving other devices signed in."""
    sessions.revoke(device_session)


@router.post(
    "/auth/password",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(401, 403, 422),
)
def change_password(
    body: ChangePasswordRequest, account: CurrentAccount, session: DbSession, policy: AuthPolicy
) -> None:
    """Change the password and revoke every session.

    This includes the current session. A password change often follows a
    suspected compromise, in which case no device should remain authenticated.
    """
    policy.ensure_local_password_allowed()
    local.change_password(session, account, current=body.current_password, new=body.new_password)


@router.get(
    "/auth/me",
    response_model=AccountView,
    responses=problem_responses(401),
)
def me(account: CurrentAccount) -> AccountView:
    return AccountView(id=account.id, display_name=account.display_name)


@router.post(
    "/auth/magic-link/request",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=problem_responses(422, 429, 503),
)
def request_magic_link(body: EmailRequest, session: DbSession, mail: Mail) -> Response:
    """Request a passwordless sign-in link.

    The response is identical whether or not the address exists. Otherwise
    this endpoint would become an account directory.
    """
    cloud.request_magic_link(session, email=body.email, mail=mail)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/magic-link/consume",
    response_model=SessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422),
)
def consume_magic_link(body: MagicLinkConsumeRequest, session: DbSession) -> SessionView:
    return _view(
        cloud.consume_magic_link(
            session,
            token=body.token,
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )


@router.post(
    "/auth/signup/request",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=problem_responses(403, 422, 429, 503),
)
def request_signup(
    body: EmailRequest, request: Request, session: DbSession, mail: Mail
) -> Response:
    """Start Cloud/Managed self-service onboarding with an emailed one-time proof.

    One entry for everyone: the server does the same work for an address with
    and without an Account and always answers with an empty `202`. The mailed
    proof decides on redemption whether it signs into the existing Account or
    creates one. Rejected with `403 AUTH_METHOD_DISABLED` on deployments without
    self-service signup, including every Self-Hosted instance.
    """
    client_host = request.client.host if request.client is not None else None
    cloud.request_signup(session, email=body.email, mail=mail, client_host=client_host)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/signup/consume",
    response_model=SignupSessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(
        403,
        422,
        429,
        503,
        descriptions={
            403: (
                "`AUTH_METHOD_DISABLED` on deployments without self-service signup, or "
                "`REGISTRATION_DISABLED` when the proof would create a new Account while the "
                "administrator does not admit new Accounts. Nothing was created."
            ),
            503: "`MAINTENANCE_MODE`: no new Account is created during maintenance.",
        },
    ),
)
def consume_signup(
    body: SignupConsumeRequest, request: Request, session: DbSession
) -> SignupSessionView:
    """Redeem a signup proof into a normal session.

    Send the proof in the request body, never in a URL. After a successful
    redemption the client removes it from its address bar and history. A new
    Account has no Membership: continue with `POST /spaces` or accept an
    invitation.
    """
    client_host = request.client.host if request.client is not None else None
    result = cloud.consume_signup(
        session,
        token=body.token,
        client_host=client_host,
        display_name=body.display_name,
        device_name=body.device_name[:MAX_DEVICE_NAME],
        platform=body.platform,
    )
    view = _view(SignedIn(account=result.account, tokens=result.tokens))
    return SignupSessionView(
        account=view.account, tokens=view.tokens, account_created=result.account_created
    )


@router.post(
    "/auth/email/verification/request",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=problem_responses(401, 429, 503),
)
def request_email_verification(account: CurrentAccount, session: DbSession, mail: Mail) -> Response:
    """Request verification of the authenticated account's own email address."""
    cloud.request_email_verification(session, account, mail=mail)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/email/verification/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(422),
)
def confirm_email(body: TokenOnlyRequest, session: DbSession) -> Response:
    """Confirm the email address without requiring authentication.

    Verification links are frequently opened in a different application from
    the one that holds the current session.
    """
    cloud.confirm_email(session, token=body.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/auth/recovery/request",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
    responses=problem_responses(403, 422, 429, 503),
)
def request_recovery(
    body: EmailRequest, session: DbSession, mail: Mail, policy: AuthPolicy
) -> Response:
    """Request a password reset while always returning the same response."""
    policy.ensure_local_password_allowed()
    cloud.request_recovery(session, email=body.email, mail=mail)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/auth/recovery/consume",
    response_model=SessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(403, 422),
)
def consume_recovery(
    body: RecoveryConsumeRequest, session: DbSession, policy: AuthPolicy
) -> SessionView:
    """Set a new password and terminate all previous sessions."""
    policy.ensure_local_password_allowed()
    return _view(
        cloud.consume_recovery(
            session,
            token=body.token,
            new_password=body.new_password,
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )


@router.post(
    "/auth/oidc/{connectionId}/start",
    response_model=OidcStartView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422, 429),
)
def start_oidc(
    session: DbSession,
    connection_id: Annotated[str, Path(alias="connectionId")],
    body: OidcStartRequest | None = None,
) -> OidcStartView:
    """Begin authentication through an external identity provider.

    State, nonce, and PKCE verifier are created server-side. The client
    receives only the authorization URL and state. Any invitation remains
    bound server-side and is never forwarded to the provider.
    """
    started = oidc.start(
        session,
        connection_id,
        invitation_token=body.invitation_token if body is not None else None,
    )
    return OidcStartView(authorization_url=started.authorization_url, state=started.state)


@router.post(
    "/auth/oidc/{connectionId}/link",
    response_model=OidcStartView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 422, 429),
)
def link_oidc(
    account: CurrentAccount,
    session: DbSession,
    connection_id: Annotated[str, Path(alias="connectionId")],
) -> OidcStartView:
    """Link an external identity to the authenticated account."""
    started = oidc.start(session, connection_id, account_id=account.id)
    return OidcStartView(authorization_url=started.authorization_url, state=started.state)


@router.post(
    "/auth/oidc/{connectionId}/callback",
    response_model=SessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 409, 422),
)
def complete_oidc(
    body: OidcCallbackRequest,
    session: DbSession,
    connection_id: Annotated[str, Path(alias="connectionId")],
) -> SessionView:
    """Complete the callback from the external identity provider."""
    return _view(
        oidc.complete(
            session,
            connection_id,
            code=body.code,
            state=body.state,
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )


@router.post(
    "/auth/passkeys/registration/start",
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401),
)
def start_passkey_registration(account: CurrentAccount, session: DbSession) -> dict[str, Any]:
    """Begin passkey registration for an existing authenticated account.

    A passkey is an additional access method for an account that already
    exists, so registration starts only from an authenticated session.
    """
    return passkeys.start_registration(session, account)


@router.post(
    "/auth/passkeys/registration/finish",
    response_model=PasskeyView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 422),
)
def finish_passkey_registration(
    body: PasskeyRegistrationRequest, account: CurrentAccount, session: DbSession
) -> PasskeyView:
    passkey = passkeys.finish_registration(
        session, account, credential=body.credential, name=body.name
    )
    return PasskeyView(id=passkey.id, name=passkey.name, created_at=passkey.created_at)


@router.post(
    "/auth/passkeys/authentication/start",
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(422, 429),
)
def start_passkey_authentication(request: Request, session: DbSession) -> dict[str, Any]:
    """Begin passkey authentication without binding it to an account.

    The authenticator selects which discoverable credential to offer. An
    endpoint that returned credentials for a given address would be an account
    directory.
    """
    client_host = request.client.host if request.client is not None else None
    passkey_abuse.reserve_authentication_start(session, client_host)
    return passkeys.start_authentication(session)


@router.post(
    "/auth/passkeys/authentication/finish",
    response_model=SessionView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 422),
)
def finish_passkey_authentication(
    body: PasskeyAuthenticationRequest, session: DbSession
) -> SessionView:
    return _view(
        passkeys.finish_authentication(
            session,
            credential=body.credential,
            device_name=body.device_name[:MAX_DEVICE_NAME],
            platform=body.platform,
        )
    )
