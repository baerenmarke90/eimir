"""The reserved identities the public demo must be able to recognize again.

The demo is a shared, publicly reachable deployment whose content is thrown
away and rebuilt on a timer. That only works while the two reserved Accounts
stay recognizable: create/ensure/reset resolve them by their reserved address
and a durable technical identity marker (`eimir.demo.models`), never by
`display_name`, because a demo it cannot identify is one it must not delete a
Space for. `display_name` is presentation state in the domain model and must
never serve as durable technical demo identity: legacy data from before this
marker existed, an operator edit, or a direct database change can still leave
it drifted, and create/ensure/reset/demo-entry must remain recoverable when it
does (#633).

Public Demo visitors are currently prevented from changing an Account-global
reserved-persona name at all through the normal profile API (#697):
`DEMO_CANONICAL_IDENTITY_IMMUTABLE`, enforced by `ensure_account_identity_mutable`
below, keeps an ordinary visitor from causing that drift in the first place.
This is not what create/ensure/reset depend on, though -- they recognize and
recover from a drifted name on their own (#633) -- it exists so a persona is
never visibly mislabeled to other visitors in the meantime. It is enforced
here rather than by hiding a control in a client: a visitor holds an ordinary
bearer token and can call the API directly; UI visibility is a representation
of a server decision, never the decision itself.

This module deliberately depends only on configuration, the identity models,
and the lightweight demo identity-marker model. The services that must not
corrupt a reserved identity, and the public demo-entry endpoint, can therefore
import it without importing the demo seeding service that imports them.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from eimir.config import Environment, get_settings
from eimir.core.errors import ForbiddenError
from eimir.demo.models import DemoCanonicalIdentity
from eimir.identity.models import Account, AccountEmail

LEA_EMAIL = "demo-lea@eimir.invalid"
ALEX_EMAIL = "demo-alex@eimir.invalid"
LEA_NAME = "Lea Sommer"
ALEX_NAME = "Alex Winter"

RESERVED_IDENTITIES: Mapping[str, str] = MappingProxyType(
    {
        LEA_EMAIL: LEA_NAME,
        ALEX_EMAIL: ALEX_NAME,
    }
)
"""Reserved address to the canonical display name reset restores.

This is presentation data reset writes back, not an identity check: the
address is what the guard and the reset resolve accounts by. Adding a persona
in one place therefore cannot leave the other behind.
"""


class DemoPersona:
    """The two canonical demo personas, independent of any presentation data.

    Also the value space the durable marker `eimir.demo.models` stores:
    `display_name` is legacy/operator-driftable presentation state, and even
    the reserved address itself is only a claim to check, not proof on its
    own -- the marker is the technical fact create/ensure/reset ultimately
    trust once it has been established. See `eimir.demo.service` for how
    it is adopted for an already-deployed demo database that predates this
    marker, and only once an already-verified canonical Space proves it.
    """

    LEA = "LEA"
    ALEX = "ALEX"


class DemoIsolationErrorCode:
    CANONICAL_IDENTITY_IMMUTABLE = "DEMO_CANONICAL_IDENTITY_IMMUTABLE"
    """An Account-global mutation the demo reset could not reconstruct.

    The personas and their names are part of the public demo contract: the
    entry page offers them by name. Naming them in the refusal therefore
    discloses nothing, and the code is the same whichever persona is signed in.
    """


def demo_deployment() -> bool:
    """Whether this deployment is the public demo.

    ``EIMIR_ENVIRONMENT=demo`` requires ``EIMIR_DEMO_MODE=true``, and ordinary
    production rejects it, but both are read here so a deployment that enables
    only demo mode is still treated as a demo.
    """
    settings = get_settings()
    return settings.environment is Environment.DEMO or settings.demo_mode


def is_canonical_reserved_account(session: Session, account: Account) -> bool:
    """Whether the reset resolves this Account as one of its reserved personas.

    Membership is decided by the reserved address rather than by the current
    display name. Deciding it by the name would make the guard useless exactly
    once the name had already drifted.
    """
    return bool(
        session.execute(
            select(
                exists().where(
                    AccountEmail.account_id == account.id,
                    AccountEmail.email.in_(tuple(RESERVED_IDENTITIES)),
                )
            )
        ).scalar_one()
    )


def resolve_canonical_account(session: Session, *, persona: str) -> Account | None:
    """Resolve the Account currently recognized as ``persona``, or ``None``.

    Recognition requires both the reserved address and the durable marker to
    agree; a reserved address that exists without a matching marker is not
    (yet) a verified canonical demo Account from this function's point of
    view. This performs no write and never adopts a missing marker --
    create/ensure/reset own that (`eimir.demo.service`), and a demo
    deployment always runs `ensure` once at startup before serving requests,
    so a public caller such as the demo-entry endpoint never needs to.

    `display_name` plays no part here, so legacy or operator-caused drift in
    it can never hide a persona from its own public entry point (#633).
    """
    email = LEA_EMAIL if persona == DemoPersona.LEA else ALEX_EMAIL
    account = session.execute(
        select(Account)
        .join(AccountEmail, AccountEmail.account_id == Account.id)
        .where(AccountEmail.email == email)
    ).scalar_one_or_none()
    if account is None:
        return None
    marker = session.get(DemoCanonicalIdentity, persona)
    if marker is None or marker.account_id != account.id:
        return None
    return account


def ensure_account_identity_mutable(session: Session, account: Account) -> None:
    """Refuse an Account-global mutation of a canonical reserved persona (#697).

    Callers decide which of their mutations this guards, because that is a
    product decision, not a technical one: create/ensure/reset now recognize
    and recover a drifted name on their own (#633), so this is not about what
    the reset "cannot reconstruct" any more -- it keeps a live persona from
    ever being visibly mislabeled to other visitors in the first place. Space
    and product content stay mutable, since the reset replaces the Space
    wholesale regardless.

    Outside a demo deployment nothing is refused. The reserved accounts do not
    exist in production, and elsewhere the reset's own fail-closed validation
    remains the operator-facing protection.
    """
    if not demo_deployment():
        return
    if not is_canonical_reserved_account(session, account):
        return
    raise ForbiddenError(
        "The demo personas keep their name so the demo can be reset. "
        "Everything inside the demo Space can still be changed.",
        DemoIsolationErrorCode.CANONICAL_IDENTITY_IMMUTABLE,
    )
