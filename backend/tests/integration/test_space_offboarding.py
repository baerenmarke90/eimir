"""Integration coverage for the #518 Space self-offboarding core."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import sleep

import pytest
from sqlalchemy import select

from eimir.authorization import PrivacyClass
from eimir.config import Environment, get_settings
from eimir.core.errors import ConflictError, NotFoundError
from eimir.identity.models import Account
from eimir.memories.models import Memory, MemoryPayload
from eimir.private_notes.models import PrivateNote, PrivateNotePayload
from eimir.relationship import invitations, offboarding, service
from eimir.relationship.models import Invitation, Membership, MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def _private_note(session, *, owner_id, space_id, title: str) -> PrivateNote:  # type: ignore[no-untyped-def]
    note = PrivateNote(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        pinned=False,
        payload=PrivateNotePayload(title=title, body="private"),
    )
    session.add(note)
    session.flush()
    return note


def _setup_relationship(maker):  # type: ignore[no-untyped-def]
    with maker() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        service.add_member(session, space.id, ben)
        result = {
            "anna_id": anna.id,
            "ben_id": ben.id,
            "space_id": space.id,
            "anna_token": sign_in(session, anna),
            "ben_token": sign_in(session, ben),
        }
        session.commit()
    return result


class TestSelfLeaveHttp:
    def test_leave_is_idempotent_and_account_session_survives(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        setup = _setup_relationship(maker)
        with maker() as session:
            anna = session.get(Account, setup["anna_id"])
            assert anna is not None
            other_space = make_space(session, anna)
            other_space_id = other_space.id
            session.commit()

        first = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(setup["anna_token"]),
        )
        assert first.status_code == 200
        assert first.json()["spaceId"] == str(setup["space_id"])
        assert first.json()["status"] == MembershipStatus.LEFT.value
        assert first.json()["endedAt"] is not None

        # The Account session remains valid; only this Space authorization ends.
        memberships = client.get(
            "/api/v1/auth/memberships",
            headers=auth(setup["anna_token"]),
        )
        assert memberships.status_code == 200
        assert all(item["spaceId"] != str(setup["space_id"]) for item in memberships.json())
        assert any(item["spaceId"] == str(other_space_id) for item in memberships.json())

        assert (
            client.get(
                f"/api/v1/spaces/{setup['space_id']}",
                headers=auth(setup["anna_token"]),
            ).status_code
            == 404
        )
        assert (
            client.get(
                f"/api/v1/spaces/{other_space_id}",
                headers=auth(setup["anna_token"]),
            ).status_code
            == 200
        )
        assert (
            client.get(
                f"/api/v1/spaces/{setup['space_id']}",
                headers=auth(setup["ben_token"]),
            ).status_code
            == 200
        )

        repeated = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(setup["anna_token"]),
        )
        assert repeated.status_code == 200
        assert repeated.json() == first.json()

        with maker() as session:
            memberships = (
                session.execute(select(Membership).where(Membership.space_id == setup["space_id"]))
                .scalars()
                .all()
            )
            assert len(memberships) == 2
            anna_membership = next(
                item for item in memberships if item.account_id == setup["anna_id"]
            )
            ben_membership = next(
                item for item in memberships if item.account_id == setup["ben_id"]
            )
            assert anna_membership.status == MembershipStatus.LEFT.value
            assert anna_membership.ended_at is not None
            assert ben_membership.status == MembershipStatus.ACTIVE.value

    def test_foreign_account_gets_privacy_safe_not_found(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        setup = _setup_relationship(maker)
        with maker() as session:
            outsider = make_account(session, "Outsider")
            outsider_token = sign_in(session, outsider)
            session.commit()

        response = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(outsider_token),
        )
        assert response.status_code == 404
        assert response.json()["code"] == service.SpaceErrorCode.NOT_FOUND

    def test_demo_rejection_happens_before_membership_mutation(
        self,
        production_client,
        monkeypatch,  # type: ignore[no-untyped-def]
    ) -> None:
        client, maker = production_client
        setup = _setup_relationship(maker)
        base = get_settings()
        demo_settings = base.model_copy(update={"environment": Environment.DEMO, "demo_mode": True})
        # The Demo-deployment predicate is shared by every Demo guard and
        # lives in eimir.demo.canonical, so patch it there.
        monkeypatch.setattr(offboarding.canonical, "get_settings", lambda: demo_settings)

        response = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(setup["anna_token"]),
        )
        assert response.status_code == 403
        assert response.json()["code"] == offboarding.SpaceOffboardingErrorCode.DEMO_FORBIDDEN

        with maker() as session:
            membership = session.execute(
                select(Membership).where(
                    Membership.space_id == setup["space_id"],
                    Membership.account_id == setup["anna_id"],
                )
            ).scalar_one()
            assert membership.status == MembershipStatus.ACTIVE.value
            assert membership.ended_at is None


class TestOffboardingPrivacy:
    def test_exit_deletes_only_leavers_private_rows_in_exited_space(
        self,
        production_client,
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        setup = _setup_relationship(maker)
        with maker() as session:
            anna = session.get(Account, setup["anna_id"])
            assert anna is not None
            second_space = make_space(session, anna)
            own_exited = _private_note(
                session,
                owner_id=setup["anna_id"],
                space_id=setup["space_id"],
                title="Anna in exited Space",
            )
            partner_private = _private_note(
                session,
                owner_id=setup["ben_id"],
                space_id=setup["space_id"],
                title="Ben private",
            )
            own_other_space = _private_note(
                session,
                owner_id=setup["anna_id"],
                space_id=second_space.id,
                title="Anna elsewhere",
            )
            shared = Memory(
                space_id=setup["space_id"],
                owner_id=setup["anna_id"],
                privacy_class=PrivacyClass.SPACE_SHARED.value,
                payload=MemoryPayload(title="Together", body="shared history"),
            )
            session.add(shared)
            session.flush()
            ids = {
                "own_exited": own_exited.id,
                "partner_private": partner_private.id,
                "own_other_space": own_other_space.id,
                "shared": shared.id,
            }
            session.commit()

        response = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(setup["anna_token"]),
        )
        assert response.status_code == 200

        with maker() as session:
            assert session.get(PrivateNote, ids["own_exited"]) is None
            assert session.get(PrivateNote, ids["partner_private"]) is not None
            assert session.get(PrivateNote, ids["own_other_space"]) is not None
            shared_after = session.get(Memory, ids["shared"])
            assert shared_after is not None
            assert shared_after.owner_id == setup["anna_id"]
            assert shared_after.privacy_class == PrivacyClass.SPACE_SHARED.value


class TestRelationshipHistoryLock:
    def test_exit_revokes_open_invitation_and_blocks_stale_acceptance(
        self,
        production_client,
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        with maker() as session:
            anna = make_account(session, "Anna")
            space = make_space(session, anna)
            issued = invitations.create(session, space.id, anna)
            anna_token = sign_in(session, anna)
            space_id = space.id
            invitation_id = issued.invitation.id
            token = issued.token
            session.commit()

        left = client.post(
            f"/api/v1/spaces/{space_id}/membership/leave",
            headers=auth(anna_token),
        )
        assert left.status_code == 200

        with maker() as session:
            invitation = session.get(Invitation, invitation_id)
            assert invitation is not None and invitation.revoked_at is not None
            new_account = make_account(session, "New Partner")
            with pytest.raises(ConflictError) as error:
                service.add_member(session, space_id, new_account)
            assert error.value.code == service.SpaceErrorCode.RELATIONSHIP_ENDED

        with maker() as session:
            newcomer = make_account(session, "Token Recipient")
            newcomer_token = sign_in(session, newcomer)
            session.commit()
        rejected = client.post(
            "/api/v1/invitations/accept",
            headers=auth(newcomer_token),
            json={"token": token},
        )
        assert rejected.status_code == 422
        assert rejected.json()["code"] == invitations.InvitationErrorCode.INVALID

    def test_surviving_partner_cannot_invite_a_new_partner_into_old_history(
        self,
        production_client,
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        setup = _setup_relationship(maker)

        left = client.post(
            f"/api/v1/spaces/{setup['space_id']}/membership/leave",
            headers=auth(setup["anna_token"]),
        )
        assert left.status_code == 200

        create = client.post(
            f"/api/v1/spaces/{setup['space_id']}/invitations",
            headers=auth(setup["ben_token"]),
        )
        assert create.status_code == 409
        assert create.json()["code"] == service.SpaceErrorCode.RELATIONSHIP_ENDED


class TestLifecycleBarrier:
    def test_self_exit_waits_for_already_authorized_request(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        setup = _setup_relationship(maker)
        authorized = Event()
        release = Event()

        def hold_authorized_request() -> None:
            with maker() as session:
                account = session.get(Account, setup["anna_id"])
                assert account is not None
                service.require_membership(session, account, setup["space_id"])
                authorized.set()
                assert release.wait(timeout=5)
                session.commit()

        def leave() -> None:
            assert authorized.wait(timeout=5)
            with maker() as session:
                account = session.get(Account, setup["anna_id"])
                assert account is not None
                offboarding.leave_space(session, account, setup["space_id"])
                session.commit()

        with ThreadPoolExecutor(max_workers=2) as pool:
            holder = pool.submit(hold_authorized_request)
            assert authorized.wait(timeout=5)
            leaver = pool.submit(leave)
            sleep(0.2)
            assert not leaver.done(), "self-exit must wait for the shared Membership lock"
            release.set()
            holder.result(timeout=5)
            leaver.result(timeout=5)

        with maker() as session:
            account = session.get(Account, setup["anna_id"])
            assert account is not None
            with pytest.raises(NotFoundError):
                service.require_membership(session, account, setup["space_id"])
