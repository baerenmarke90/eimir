"""Public entry boundary for an explicitly configured demo deployment.

The route is intentionally excluded from the product OpenAPI contract. It is a
deployment facility for the isolated public demo instance, not a supported
client authentication method for normal eimir. installations.
"""

from __future__ import annotations

from datetime import timedelta
from enum import StrEnum

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from eimir.api.deps import DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import action_tokens, passkey_abuse, rate_limit
from eimir.config import get_settings
from eimir.core.errors import NotFoundError
from eimir.demo import canonical
from eimir.demo.canonical import ALEX_EMAIL, LEA_EMAIL
from eimir.identity.models import AccountEmail

router = APIRouter(tags=["demo"])

DEMO_ENTRY_ACTION = "demo_entry"
DEMO_ENTRY_LIMIT = rate_limit.Limit(attempts=30, window=timedelta(minutes=15))


class DemoPersona(StrEnum):
    LEA = "LEA"
    ALEX = "ALEX"


class DemoEntryRequest(ApiModel):
    persona: DemoPersona


class DemoEntryView(ApiModel):
    token: str


def _demo_email(persona: DemoPersona) -> str:
    return LEA_EMAIL if persona is DemoPersona.LEA else ALEX_EMAIL


@router.post(
    "/demo/entry",
    response_model=DemoEntryView,
    responses=problem_responses(404, 429),
    include_in_schema=False,
)
def create_demo_entry(
    body: DemoEntryRequest,
    request: Request,
    response: Response,
    session: DbSession,
) -> DemoEntryView:
    """Issue a one-time sign-in proof for Lea or Alex on the demo instance only."""
    settings = get_settings()
    if not settings.demo_mode:
        raise NotFoundError("Demo entry is not available.", "DEMO_MODE_DISABLED")

    client_host = request.client.host if request.client is not None else None
    network_key = passkey_abuse.network_key(client_host)
    rate_limit.check(
        session,
        DEMO_ENTRY_ACTION,
        f"{network_key}:{body.persona.value}",
        DEMO_ENTRY_LIMIT,
    )

    email = _demo_email(body.persona)
    account = canonical.resolve_canonical_account(session, persona=body.persona.value)
    if account is None or not account.is_active:
        raise NotFoundError("Canonical demo identity is not available.", "DEMO_IDENTITY_MISSING")

    email_record = session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == account.id,
            AccountEmail.email == email,
            AccountEmail.is_primary.is_(True),
        )
    ).scalar_one_or_none()
    if email_record is None:
        raise NotFoundError("Canonical demo identity is not available.", "DEMO_IDENTITY_MISSING")

    _, issued = action_tokens.issue_demo_entry_proof(session, email_record.id)
    response.headers["Cache-Control"] = "no-store"
    return DemoEntryView(token=issued.token)
