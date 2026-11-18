"""Terms-of-use versioning and acceptance for eimir. Cloud Accounts.

The canonical text is ``legal/de/terms-of-use.md`` at the repository root. Only
Cloud/Managed self-service signup creates Accounts under those terms.
Self-Hosted installations are governed by their operator, so they never
require an acceptance and expose no version.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.auth.policy import self_service_signup_supported
from eimir.core.clock import now
from eimir.core.errors import ConflictError
from eimir.legal.models import TermsAcceptance, TermsAcceptanceOrigin

TERMS_OF_USE_VERSION = "2026-11-06.draft-2"
"""Version a new Cloud Account must accept.

It must equal the ``version`` front matter of ``legal/de/terms-of-use.md``;
a unit test enforces that. Changing the text therefore means changing both.
"""


class TermsErrorCode:
    ACCEPTANCE_REQUIRED = "TERMS_ACCEPTANCE_REQUIRED"
    VERSION_OUTDATED = "TERMS_VERSION_OUTDATED"


def required_terms_version() -> str | None:
    """Return the version new Accounts must accept here, or None if none applies."""
    return TERMS_OF_USE_VERSION if self_service_signup_supported() else None


def ensure_current_version(version: str | None) -> str | None:
    """Accept only a statement about the version that is currently required.

    A client that rendered another text must not record it as accepted. The
    check never depends on Account state, so it cannot reveal whether an
    address is registered.
    """
    if version is None:
        return None
    if version != required_terms_version():
        raise ConflictError(
            "The accepted terms of use are not the current version.",
            TermsErrorCode.VERSION_OUTDATED,
        )
    return version


def acceptance_required_error() -> ConflictError:
    return ConflictError(
        "A new Account requires acceptance of the current terms of use.",
        TermsErrorCode.ACCEPTANCE_REQUIRED,
    )


def record_acceptance(
    session: Session,
    *,
    account_id: UUID,
    version: str,
    origin: TermsAcceptanceOrigin,
) -> TermsAcceptance:
    acceptance = TermsAcceptance(
        account_id=account_id,
        version=version,
        accepted_at=now(),
        origin=origin.value,
    )
    session.add(acceptance)
    session.flush()
    return acceptance
