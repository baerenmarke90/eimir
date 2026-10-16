"""The public demo cannot be made unresettable by an ordinary visitor.

create/ensure/reset resolve the two reserved personas by their reserved
address and a durable technical marker (`eimir.demo.models`), never by
`display_name` (#633): that is presentation state in the domain model and
must never serve as durable technical demo identity. Legacy data from before
this marker existed, an operator edit, or a direct database change can leave
it drifted, and reset restores it rather than depending on it being correct.
Everything a visitor does inside the Space is disposable, because the reset
replaces the Space wholesale.

Independently of that -- and not what create/ensure/reset rely on -- an
ordinary Demo visitor is already prevented from causing that drift at all
through the normal profile API (#697): this Account-global name is protected
between resets so a persona is not visibly mislabeled to other visitors in
the meantime.

Every check here goes through the HTTP API with a real bearer token, because a
client that hides the control is not the boundary: a visitor holds an ordinary
session and can call the endpoint directly.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.auth import passwords
from eimir.config import Environment, Settings
from eimir.demo import canonical
from eimir.demo.canonical import ALEX_EMAIL, ALEX_NAME, LEA_EMAIL, LEA_NAME
from eimir.demo.models import DemoCanonicalIdentity
from eimir.demo.service import create_demo_space, reset_demo_space
from eimir.identity import service as identity_service
from eimir.identity.models import Account
from eimir.profiles.models import (
    PreferenceCategory,
    PreferenceSentiment,
    ProfileVisibility,
)
from eimir.relationship import offboarding
from eimir.relationship.models import Membership, MembershipStatus, Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-guard-test-password"


def profile_path(space_id: object, account_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profiles/{account_id}"


def seed(session: Session):  # type: ignore[no-untyped-def]
    return create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )


def preference_payload(account_id: object) -> dict[str, object]:
    """A perfectly ordinary Space-scoped write the reset replaces wholesale."""
    return {
        "accountId": str(account_id),
        "visibility": ProfileVisibility.SELF_PROFILE.value,
        "category": PreferenceCategory.FOOD.value,
        "sentiment": PreferenceSentiment.LIKE.value,
        "topic": "Zimtschnecken",
        "value": "Am liebsten sonntags.",
    }


def demo_deployment(monkeypatch: pytest.MonkeyPatch, *, enabled: bool = True) -> None:
    """Make the guard see the deployment the public demo actually runs as."""
    settings = Settings.model_validate({"demo_mode": True}) if enabled else Settings()
    monkeypatch.setattr(canonical, "get_settings", lambda: settings)


def account_by_email(session: Session, email: str) -> Account:
    account = identity_service.find_by_email(session, email)
    assert account is not None
    return account


def space_of(session: Session, account: Account):  # type: ignore[no-untyped-def]
    return session.execute(
        select(Membership.space_id).where(
            Membership.account_id == account.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one()


@pytest.fixture
def demo(session: Session, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    """A seeded canonical demo running as the public demo deployment."""
    seed(session)
    demo_deployment(monkeypatch)
    lea = account_by_email(session, LEA_EMAIL)
    alex = account_by_email(session, ALEX_EMAIL)
    return {
        "lea": lea,
        "alex": alex,
        "space_id": space_of(session, lea),
        "lea_token": sign_in(session, lea),
        "alex_token": sign_in(session, alex),
    }


def rename(client, demo, persona: str, new_name: str):  # type: ignore[no-untyped-def]
    account = demo[persona]
    current = client.get(
        profile_path(demo["space_id"], account.id),
        headers=auth(demo[f"{persona}_token"]),
    )
    assert current.status_code == 200, current.text
    return client.patch(
        profile_path(demo["space_id"], account.id),
        json={"displayName": new_name},
        headers={
            **auth(demo[f"{persona}_token"]),
            "If-Match": current.headers["etag"],
        },
    )


class TestCanonicalIdentityIsImmutable:
    def test_demo_lea_cannot_rename_herself(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        response = rename(client, demo, "lea", "Nicht mehr Lea")

        assert response.status_code == 403, response.text
        assert response.json()["code"] == "DEMO_CANONICAL_IDENTITY_IMMUTABLE"

    def test_demo_alex_cannot_rename_himself(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        response = rename(client, demo, "alex", "Nicht mehr Alex")

        assert response.status_code == 403, response.text
        assert response.json()["code"] == "DEMO_CANONICAL_IDENTITY_IMMUTABLE"

    def test_rejection_changes_neither_name_nor_version(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        "A refused mutation must not consume the Account-global version either."
        before = session.get(Account, demo["lea"].id)
        assert before is not None
        version_before = before.version

        assert rename(client, demo, "lea", "Nicht mehr Lea").status_code == 403

        session.expire_all()
        after = session.get(Account, demo["lea"].id)
        assert after is not None
        assert after.display_name == LEA_NAME
        assert after.version == version_before

    def test_refusal_names_no_internal_reserved_state(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        """The personas are public; the identifiers behind them are not.

        The entry page offers Lea and Alex by name and `docs/DEMO-SPACE.md`
        documents that the demo resets, so explaining the refusal in those
        terms discloses nothing. The reserved addresses and the internal
        Account and Space identifiers stay out of it, and the response is the
        same whichever persona is signed in.
        """
        response = rename(client, demo, "lea", "Nicht mehr Lea")

        assert LEA_EMAIL not in response.text
        assert ALEX_EMAIL not in response.text
        assert str(demo["lea"].id) not in response.text
        assert str(demo["alex"].id) not in response.text
        assert str(demo["space_id"]) not in response.text

    def test_keeping_the_canonical_name_is_not_a_mutation(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        "A save that leaves the name alone must not be refused."
        response = rename(client, demo, "lea", LEA_NAME)

        assert response.status_code == 200, response.text
        assert response.json()["displayName"] == LEA_NAME


class TestPermittedDemoMutationsRemainOpen:
    def test_space_content_stays_editable(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        "Only the reset-critical identity is protected, not the demo itself."
        response = client.post(
            f"/api/v1/spaces/{demo['space_id']}/profile-preferences",
            json=preference_payload(demo["lea"].id),
            headers=auth(demo["lea_token"]),
        )

        assert response.status_code == 201, response.text

    def test_avatar_stays_removable(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        """The avatar is Account-global but the reset purges it with the Space.

        It therefore stays mutable: the guard protects what the reset cannot
        rebuild, not everything that happens to live on the Account.
        """
        current = client.get(
            profile_path(demo["space_id"], demo["lea"].id),
            headers=auth(demo["lea_token"]),
        )
        response = client.patch(
            profile_path(demo["space_id"], demo["lea"].id),
            json={"profileAttachmentId": None},
            headers={**auth(demo["lea_token"]), "If-Match": current.headers["etag"]},
        )

        assert response.status_code == 200, response.text


class TestOrdinaryDeploymentsAreUnaffected:
    def test_a_normal_account_still_renames_itself(self, client, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        "Nothing about this guard applies where no reserved persona exists."
        demo_deployment(monkeypatch, enabled=False)
        anna = make_account(session, "Anna")
        space = make_space(session, anna)
        token = sign_in(session, anna)

        current = client.get(profile_path(space.id, anna.id), headers=auth(token))
        response = client.patch(
            profile_path(space.id, anna.id),
            json={"displayName": "Änne"},
            headers={**auth(token), "If-Match": current.headers["etag"]},
        )

        assert response.status_code == 200, response.text
        assert response.json()["displayName"] == "Änne"

    def test_a_normal_account_renames_itself_inside_a_demo_deployment(
        self, client, session, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        "The guard is about the reserved identities, not about demo mode."
        demo_deployment(monkeypatch)
        anna = make_account(session, "Anna")
        space = make_space(session, anna)
        token = sign_in(session, anna)

        current = client.get(profile_path(space.id, anna.id), headers=auth(token))
        response = client.patch(
            profile_path(space.id, anna.id),
            json={"displayName": "Änne"},
            headers={**auth(token), "If-Match": current.headers["etag"]},
        )

        assert response.status_code == 200, response.text

    def test_the_reserved_persona_renames_outside_a_demo_deployment(
        self, client, session, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """Development keeps the existing contract.

        Outside a demo deployment the reset's own fail-closed validation stays
        the operator-facing protection, exactly as for the Account-deletion and
        Space-offboarding guards, which are also deployment-scoped.
        """
        seed(session)
        demo_deployment(monkeypatch, enabled=False)
        lea = account_by_email(session, LEA_EMAIL)
        token = sign_in(session, lea)
        space_id = space_of(session, lea)

        current = client.get(profile_path(space_id, lea.id), headers=auth(token))
        response = client.patch(
            profile_path(space_id, lea.id),
            json={"displayName": "Lokale QA"},
            headers={**auth(token), "If-Match": current.headers["etag"]},
        )

        assert response.status_code == 200, response.text


class TestExistingDemoGuardsRemainIntact:
    def test_space_offboarding_stays_blocked(self, session, monkeypatch, demo) -> None:  # type: ignore[no-untyped-def]
        from eimir.core.errors import ForbiddenError

        with pytest.raises(ForbiddenError) as rejected:
            offboarding.leave_space(session, demo["lea"], demo["space_id"])

        assert rejected.value.code == "SPACE_OFFBOARDING_DEMO_FORBIDDEN"

    def test_account_self_deletion_stays_blocked(self, session, monkeypatch, demo) -> None:  # type: ignore[no-untyped-def]
        from eimir.core.errors import ForbiddenError
        from eimir.identity import deletion_self_service

        monkeypatch.setattr(
            deletion_self_service.canonical,
            "get_settings",
            lambda: Settings.model_validate({"demo_mode": True}),
        )

        with pytest.raises(ForbiddenError) as rejected:
            deletion_self_service.accept_self_deletion(demo["lea"].id)

        assert rejected.value.code == "ACCOUNT_DELETION_DEMO_FORBIDDEN"


class TestResetStaysUsableAndFailsClosed:
    def test_reset_still_runs_after_permitted_demo_mutations(self, client, session, demo) -> None:  # type: ignore[no-untyped-def]
        "Everything a visitor is still allowed to do must remain resettable."
        assert (
            client.post(
                f"/api/v1/spaces/{demo['space_id']}/profile-preferences",
                json=preference_payload(demo["lea"].id),
                headers=auth(demo["lea_token"]),
            ).status_code
            == 201
        )
        assert rename(client, demo, "lea", LEA_NAME).status_code == 200

        result = reset_demo_space(
            session,
            environment=Environment.TEST,
            reference_date=REFERENCE_DATE,
        )

        assert result.space_id != demo["space_id"]
        session.expire_all()
        assert account_by_email(session, LEA_EMAIL).display_name == LEA_NAME
        assert account_by_email(session, ALEX_EMAIL).display_name == ALEX_NAME

    def test_reset_still_runs_after_a_drifted_display_name(self, session, demo) -> None:  # type: ignore[no-untyped-def]
        """#633: a drifted display name alone must never break reset.

        An ordinary Demo visitor cannot cause this through the normal profile
        API (#697 already blocks that); this simulates legacy data or a direct
        database/operator edit instead. This is the regression the durable
        marker exists for: reset must still recognize the Account by its
        technical identity and put the canonical name back, not refuse.
        """
        lea = account_by_email(session, LEA_EMAIL)
        alex = account_by_email(session, ALEX_EMAIL)
        lea.display_name = "Legacy-Datenstand"
        alex.display_name = "Auch abgewichen"
        session.flush()

        result = reset_demo_space(
            session,
            environment=Environment.TEST,
            reference_date=REFERENCE_DATE,
        )

        assert result.lea_id == lea.id
        assert result.alex_id == alex.id
        session.expire_all()
        assert account_by_email(session, LEA_EMAIL).display_name == LEA_NAME
        assert account_by_email(session, ALEX_EMAIL).display_name == ALEX_NAME

    def test_ensure_after_a_drifted_display_name_is_idempotent(self, session, demo) -> None:  # type: ignore[no-untyped-def]
        """#633: a drifted display name alone must never break `ensure`.

        The idempotent `create_demo_space` path is what Compose's `demo-init`
        actually calls on every redeploy; it must keep observing the existing
        Space rather than raising or duplicating it, even against legacy data
        or a direct database/operator edit (see the module docstring for why
        this isn't simulating an ordinary visitor request).
        """
        lea = account_by_email(session, LEA_EMAIL)
        alex = account_by_email(session, ALEX_EMAIL)
        lea.display_name = "Legacy-Datenstand"
        alex.display_name = "Auch abgewichen"
        session.flush()

        result = create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )

        assert result.created is False
        assert result.space_id == demo["space_id"]
        assert result.lea_id == lea.id
        assert result.alex_id == alex.id

    def test_reset_still_refuses_a_marker_bound_to_a_different_account(  # type: ignore[no-untyped-def]
        self, session, demo
    ) -> None:
        """The guard does not replace the reset's own validation.

        An operator or a direct database edit can still bind the durable
        marker to an unexpected Account, and the reset must keep refusing
        rather than guessing which Account was meant. A mere display-name
        change (covered above) must not trigger this refusal; only the
        marker itself binding to the wrong Account may.
        """
        impostor = make_account(session, LEA_NAME)
        marker = session.get(DemoCanonicalIdentity, "LEA")
        assert marker is not None
        marker.account_id = impostor.id
        session.flush()

        with pytest.raises(RuntimeError, match="does not resolve to the expected"):
            reset_demo_space(
                session,
                environment=Environment.TEST,
                reference_date=REFERENCE_DATE,
            )

    def test_reset_adopts_a_pre_existing_demo_database_without_a_marker(  # type: ignore[no-untyped-def]
        self, session, demo
    ) -> None:
        """Compatibility: a demo deployed before the marker existed still resets.

        Simulates the exact state an already-running public demo has right
        after this migration ships: verified reserved-address Accounts with
        no marker row yet. Reset must adopt them rather than requiring manual
        SQL repair, while keeping their Account IDs stable.
        """
        lea = account_by_email(session, LEA_EMAIL)
        alex = account_by_email(session, ALEX_EMAIL)
        session.execute(
            delete(DemoCanonicalIdentity).where(
                DemoCanonicalIdentity.account_id.in_([lea.id, alex.id])
            )
        )
        session.flush()

        result = reset_demo_space(
            session,
            environment=Environment.TEST,
            reference_date=REFERENCE_DATE,
        )

        assert result.lea_id == lea.id
        assert result.alex_id == alex.id
        session.expire_all()
        markers = {
            marker.persona: marker.account_id
            for marker in session.execute(select(DemoCanonicalIdentity)).scalars()
        }
        assert markers == {"LEA": lea.id, "ALEX": alex.id}

    def test_ensure_adopts_a_pre_existing_demo_database_without_a_marker(  # type: ignore[no-untyped-def]
        self, session, demo
    ) -> None:
        """Compatibility, via the idempotent `create_demo_space`/`ensure` path.

        Same simulated pre-#633 state as the reset case above, but exercised
        through the path Compose's `demo-init` actually calls on redeploy:
        the two reserved-address Accounts already share exactly one verified
        Space, so the still-missing markers are safe to backfill.
        """
        lea = account_by_email(session, LEA_EMAIL)
        alex = account_by_email(session, ALEX_EMAIL)
        session.execute(
            delete(DemoCanonicalIdentity).where(
                DemoCanonicalIdentity.account_id.in_([lea.id, alex.id])
            )
        )
        session.flush()

        result = create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )

        assert result.created is False
        assert result.space_id == demo["space_id"]
        assert result.lea_id == lea.id
        assert result.alex_id == alex.id
        session.expire_all()
        markers = {
            marker.persona: marker.account_id
            for marker in session.execute(select(DemoCanonicalIdentity)).scalars()
        }
        assert markers == {"LEA": lea.id, "ALEX": alex.id}


class TestMarkerAdoptionRequiresAVerifiedSpace:
    """Owning the reserved address is necessary, never sufficient, to adopt.

    Adoption -- writing a still-missing marker -- may only happen once the
    *existing* demo structure already proves an Account is the canonical
    persona (the two reserved-address Accounts share exactly one active,
    verified Space). Two reserved-address Accounts that exist without a
    marker and without such a Space must fail closed instead of being
    silently treated as the legitimate pair and seeded a brand-new Space.
    """

    def test_create_refuses_markerless_reserved_accounts_without_an_existing_space(  # type: ignore[no-untyped-def]
        self, session
    ) -> None:
        """The exact ambiguous state a pre-#633 upgrade must NOT auto-resolve.

        Unlike the compatibility tests above, these reserved-address Accounts
        were never seeded through `create_demo_space` at all -- there is no
        marker *and* no pre-existing canonical Space linking them, e.g. an
        operator pre-created them for an unrelated purpose. `create`/`ensure`
        must abort rather than guess, creating neither a marker nor a Space.
        """
        lea = identity_service.create_account(
            session,
            display_name=LEA_NAME,
            email=LEA_EMAIL,
            password_hash=passwords.hash_password(DEMO_PASSWORD),
        )
        alex = identity_service.create_account(
            session,
            display_name=ALEX_NAME,
            email=ALEX_EMAIL,
            password_hash=passwords.hash_password(DEMO_PASSWORD),
        )
        session.flush()

        with pytest.raises(RuntimeError, match="without a durable identity marker"):
            create_demo_space(
                session,
                environment=Environment.TEST,
                lea_password=DEMO_PASSWORD,
                alex_password=DEMO_PASSWORD,
                reference_date=REFERENCE_DATE,
            )

        session.expire_all()
        assert session.execute(select(DemoCanonicalIdentity)).scalars().all() == []
        assert session.execute(select(Space)).scalars().all() == []
        assert session.get(Account, lea.id) is not None
        assert session.get(Account, alex.id) is not None


class TestGuardPrimitive:
    def test_only_reserved_addresses_are_canonical(self, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        "Recognition follows the reserved address, never the current name."
        seed(session)
        demo_deployment(monkeypatch)
        lea = account_by_email(session, LEA_EMAIL)
        impostor = make_account(session, LEA_NAME)

        assert canonical.is_canonical_reserved_account(session, lea) is True
        assert canonical.is_canonical_reserved_account(session, impostor) is False

    def test_recognition_survives_a_name_that_already_drifted(self, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        "Otherwise the guard would stop working exactly once it was needed."
        seed(session)
        demo_deployment(monkeypatch)
        lea = account_by_email(session, LEA_EMAIL)
        lea.display_name = "Bereits abgewichen"
        session.flush()

        assert canonical.is_canonical_reserved_account(session, lea) is True
