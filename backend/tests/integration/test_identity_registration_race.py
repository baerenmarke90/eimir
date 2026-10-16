"""Concurrent local/OIDC account creation for the same email address.

`identity.service.create_account` and `create_oidc_account` each check
`find_by_email` before inserting a new `AccountEmail`. A concurrent creation
for the same address can commit between that check and the insert; the
resulting unique-constraint violation must be handled as the documented
outcome for each path, not surface as an unhandled `IntegrityError` (a 500 for
local registration, an aborted invitation acceptance for OIDC onboarding).

These tests simulate the race the same way
`test_cloud_self_service_onboarding.py`'s
`test_creation_racing_another_path_converges_on_the_committed_owner` does:
`find_by_email` is patched to (truthfully) miss an address that has, in fact,
already been committed by a concurrent path, which is exactly what the
in-flight state of a concurrent transaction looks like from inside this one.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError
from eimir.identity import service as identity_service
from eimir.identity.models import Account, AccountEmail

RACE_EMAIL = "race@example.test"


def test_concurrent_local_registration_for_the_same_email_is_a_conflict_not_a_crash(
    session: Session, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    winner = identity_service.create_account(
        session,
        display_name="First",
        email=RACE_EMAIL,
        password_hash="hash-1",
    )

    monkeypatch.setattr(identity_service, "find_by_email", lambda *_a, **_kw: None)

    try:
        identity_service.create_account(
            session,
            display_name="Second",
            email=RACE_EMAIL,
            password_hash="hash-2",
        )
        raise AssertionError("expected the losing registration to raise ConflictError")
    except ConflictError as error:
        assert error.code == identity_service.AccountErrorCode.EMAIL_TAKEN

    # The savepoint rolled back the loser's Account/AuthIdentity along with its
    # AccountEmail insert -- only the winner's account and address remain.
    assert session.execute(select(func.count()).select_from(AccountEmail)).scalar_one() == 1
    accounts_named_second = session.execute(
        select(func.count()).select_from(Account).where(Account.display_name == "Second")
    ).scalar_one()
    assert accounts_named_second == 0

    remaining_email = session.execute(
        select(AccountEmail).where(AccountEmail.email == RACE_EMAIL)
    ).scalar_one()
    assert remaining_email.account_id == winner.id


def test_concurrent_oidc_onboarding_discards_an_address_taken_by_the_race(
    session: Session, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    winner = identity_service.create_account(
        session,
        display_name="Existing Local Account",
        email=RACE_EMAIL,
        password_hash="hash-1",
    )

    monkeypatch.setattr(identity_service, "find_by_email", lambda *_a, **_kw: None)

    # Must not raise: per create_oidc_account's contract, an address already
    # claimed by a concurrent path is discarded, not treated as a hard failure.
    account = identity_service.create_oidc_account(
        session,
        display_name="OIDC User",
        verified_email=RACE_EMAIL,
    )

    assert account.id != winner.id

    # Exactly one AccountEmail exists for the address, still owned by the
    # original winner; the new OIDC account has none attached.
    assert session.execute(select(func.count()).select_from(AccountEmail)).scalar_one() == 1
    oidc_account_emails = session.execute(
        select(func.count()).select_from(AccountEmail).where(AccountEmail.account_id == account.id)
    ).scalar_one()
    assert oidc_account_emails == 0
