"""Negative authorization coverage for self-service Account deletion."""

from __future__ import annotations

from sqlalchemy import func, select

from eimir.auth import sessions
from eimir.core.clock import now
from eimir.identity import deletion_jobs, deletion_self_service
from eimir.identity.deletion_models import AccountDeletion
from eimir.identity.models import Account, AccountEmail
from eimir.jobs.models import Job
from tests.conftest import auth, requires_database


@requires_database
def test_client_cannot_supply_a_different_account_id(
    production_client,
    monkeypatch,  # type: ignore[no-untyped-def]
) -> None:
    client, maker = production_client
    with maker() as session:
        caller = Account(display_name="Caller")
        other = Account(display_name="Other")
        session.add_all([caller, other])
        session.flush()
        session.add(
            AccountEmail(
                account_id=caller.id,
                email="caller@example.org",
                is_primary=True,
                verified_at=now(),
            )
        )
        _, tokens = sessions.start_session(session, caller)
        caller_id = caller.id
        other_id = other.id
        session.commit()

    def forbidden_authority():  # type: ignore[no-untyped-def]
        raise AssertionError("Schema rejection must happen before deletion authority access")

    monkeypatch.setattr(deletion_self_service, "_configured_journal", forbidden_authority)

    response = client.post(
        "/api/v1/account/deletion",
        headers=auth(tokens.access_token),
        json={
            "confirmation": "DELETE_ACCOUNT",
            "accountId": str(other_id),
        },
    )

    assert response.status_code == 422
    with maker() as session:
        caller = session.get(Account, caller_id)
        other = session.get(Account, other_id)
        assert caller is not None and caller.disabled_at is None
        assert other is not None and other.disabled_at is None
        assert session.get(AccountDeletion, caller_id) is None
        assert session.get(AccountDeletion, other_id) is None
        assert (
            session.execute(
                select(func.count())
                .select_from(Job)
                .where(Job.kind == deletion_jobs.CONVERGENCE_JOB)
            ).scalar_one()
            == 0
        )
