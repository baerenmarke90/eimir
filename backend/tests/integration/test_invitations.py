"""Invitation integration tests.

The specification names six abuse cases explicitly: expired, revoked, reused,
full space, race, and invalid token. Each has a dedicated test here.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.errors import ConflictError, NotFoundError, ValidationError
from eimir.relationship import invitations, service
from eimir.relationship.models import Invitation
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def anna_with_space(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()
    return {"anna": anna, "space": space, "token": sign_in(session, anna)}


class TestCreate:
    def test_token_is_returned_exactly_once(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        assert result.token
        # Only the hash is stored in the database.
        assert result.token not in str(result.invitation.__dict__)

    def test_is_initially_open(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        assert result.invitation.is_open(now())

    def test_list_does_not_expose_token(self, client, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        client.post(
            f"/api/v1/spaces/{anna_with_space['space'].id}/invitations",
            headers=auth(anna_with_space["token"]),
        )
        response = client.get(
            f"/api/v1/spaces/{anna_with_space['space'].id}/invitations",
            headers=auth(anna_with_space["token"]),
        )
        assert response.status_code == 200
        for entry in response.json():
            assert set(entry) == {"id", "expiresAt", "createdAt"}


class TestAccept:
    def test_partner_becomes_member(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        ben = make_account(session, "Ben")
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])

        membership = invitations.accept(session, result.token, ben)
        assert membership.space_id == anna_with_space["space"].id
        assert membership.is_active
        assert result.invitation.accepted_by == ben.id

    def test_over_http(self, client, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        ben = make_account(session, "Ben")
        ben_token = sign_in(session, ben)
        session.flush()

        created = client.post(
            f"/api/v1/spaces/{anna_with_space['space'].id}/invitations",
            headers=auth(anna_with_space["token"]),
        )
        assert created.status_code == 201
        token = created.json()["token"]

        accepted = client.post(
            "/api/v1/invitations/accept",
            json={"token": token},
            headers=auth(ben_token),
        )
        assert accepted.status_code == 201

        # Ben can now access the space.
        assert (
            client.get(
                f"/api/v1/spaces/{anna_with_space['space'].id}",
                headers=auth(ben_token),
            ).status_code
            == 200
        )


class TestAbuse:
    def test_invalid_token(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        ben = make_account(session, "Ben")
        for invalid_value in ["", "nicht-echt", "a" * 100]:
            with pytest.raises(ValidationError):
                invitations.accept(session, invalid_value, ben)

    def test_expired_token(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        ben = make_account(session, "Ben")
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        result.invitation.expires_at = now() - timedelta(seconds=1)
        session.flush()

        with pytest.raises(ValidationError):
            invitations.accept(session, result.token, ben)

    def test_revoked_token(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        ben = make_account(session, "Ben")
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        invitations.revoke(session, anna_with_space["space"].id, result.invitation.id)
        session.flush()

        with pytest.raises(ValidationError):
            invitations.accept(session, result.token, ben)

    def test_reused_token(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        """An invitation is valid exactly once."""
        ben = make_account(session, "Ben")
        third_person = make_account(session, "Dritte Person")
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])

        invitations.accept(session, result.token, ben)
        session.flush()

        with pytest.raises(ValidationError):
            invitations.accept(session, result.token, third_person)

    def test_full_space_does_not_create_invitation(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        """Do not send a link that can only disappoint when opened."""
        ben = make_account(session, "Ben")
        service.add_member(session, anna_with_space["space"].id, ben)
        session.flush()

        with pytest.raises(ConflictError) as error:
            invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        assert error.value.code == "SPACE_FULL"

    def test_full_space_rejects_existing_invitation(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        """The invitation may already be in transit when the space becomes full."""
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        ben = make_account(session, "Ben")
        service.add_member(session, anna_with_space["space"].id, ben)
        session.flush()

        third_person = make_account(session, "Dritte Person")
        with pytest.raises(ConflictError) as error:
            invitations.accept(session, result.token, third_person)
        assert error.value.code == "SPACE_FULL"

        # The invitation remains open because it did not cause the failure.
        assert result.invitation.accepted_at is None

    def test_creator_cannot_accept_own_invitation(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        with pytest.raises(ValidationError) as error:
            invitations.accept(session, result.token, anna_with_space["anna"])
        assert error.value.code == "CANNOT_ACCEPT_OWN_INVITATION"

    def test_every_failure_reports_the_same_diagnostic(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        """Different diagnostics could reveal which tokens exist."""
        ben = make_account(session, "Ben")

        expired = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        expired.invitation.expires_at = now() - timedelta(seconds=1)
        revoked = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        revoked.invitation.revoked_at = now()
        session.flush()

        diagnostics = set()
        for token in ["gibt-es-nicht", expired.token, revoked.token]:
            with pytest.raises(ValidationError) as error:
                invitations.accept(session, token, ben)
            diagnostics.add((str(error.value), error.value.code))
        assert len(diagnostics) == 1


class TestRace:
    def test_two_invitations_compete_for_last_slot(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        with maker() as setup:
            anna = make_account(setup, "Anna Wettlauf")
            space = make_space(setup, anna)
            first_invitation = invitations.create(setup, space.id, anna)
            second_invitation = invitations.create(setup, space.id, anna)
            ben = make_account(setup, "Ben Wettlauf")
            clara = make_account(setup, "Clara Wettlauf")
            ben_token = sign_in(setup, ben)
            clara_token = sign_in(setup, clara)
            space_id = space.id
            setup.commit()

        start = Barrier(2)

        def accept(data):  # type: ignore[no-untyped-def]
            invitation_token, access_token = data
            start.wait(timeout=5)
            return client.post(
                "/api/v1/invitations/accept",
                json={"token": invitation_token},
                headers=auth(access_token),
            )

        attempts = [
            (first_invitation.token, ben_token),
            (second_invitation.token, clara_token),
        ]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(accept, attempts))

        assert sorted(response.status_code for response in responses) == [201, 409]
        rejected = next(response for response in responses if response.status_code == 409)
        assert rejected.json() == {
            "type": "conflict",
            "title": "Conflict",
            "status": 409,
            "detail": "This space already has two partners.",
            "code": "SPACE_FULL",
        }

        with maker() as verifier:
            active_memberships = service.active_memberships(verifier, space_id)
            assert len(active_memberships) == 2  # Anna and exactly one of the two
            invitations_for_space = (
                verifier.execute(select(Invitation).where(Invitation.space_id == space_id))
                .scalars()
                .all()
            )
            assert (
                sum(invitation.accepted_at is not None for invitation in invitations_for_space) == 1
            )
            assert sum(invitation.is_open(now()) for invitation in invitations_for_space) == 1


class TestRevoke:
    def test_foreign_space_cannot_revoke(self, session, anna_with_space) -> None:  # type: ignore[no-untyped-def]
        """An invitation ID alone must not grant access."""
        foreign_account = make_account(session, "Fremde Person")
        foreign_space = make_space(session, foreign_account)
        result = invitations.create(session, anna_with_space["space"].id, anna_with_space["anna"])
        session.flush()

        with pytest.raises(NotFoundError):
            invitations.revoke(session, foreign_space.id, result.invitation.id)
