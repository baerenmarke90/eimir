"""Cloud self-service onboarding: verified Account -> own private Space -> partner (#923).

The public Cloud journey must work without an operator bootstrap secret and
without an invitation, while Self-Hosted keeps its bootstrap-then-invitation
rule. These tests cover the four properties that make that safe:

- the public request cannot be used to learn whether an address has an Account;
- a signup proof is single-use, expiring, hash-only, and cannot create a second
  Account under replay, concurrency, or a creation race with another path;
- the first Space is created only for the authenticated caller, only while it
  has no active Membership, and exactly once under concurrent requests;
- Self-Hosted rejects the Cloud path before any proof or Account is touched.

Race tests run on the real request unit of work with independent transactions.
A shared test session never commits, so it could not show serialization.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.auth import action_tokens, cloud
from eimir.auth.tokens import hash_token
from eimir.config import Deployment, MailTransport, get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail, SignupProof
from eimir.mail import MailMessage, MailSender
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import TEST_BOOTSTRAP_TOKEN, auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SIGNUP_REQUEST = "/api/v1/auth/signup/request"
SIGNUP_CONSUME = "/api/v1/auth/signup/consume"
ANNA = "anna@example.org"
BEN = "ben@example.org"
CARA = "cara@example.org"
PUBLIC_BASE_URL = "https://eimir.example"


class Mailbox(MailSender):
    """Collect messages instead of sending them."""

    def __init__(self) -> None:
        self.messages: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)

    def token_for(self, address: str) -> str:
        for message in reversed(self.messages):
            if message.to == address:
                match = re.search(r"token=([A-Za-z0-9_\-]+)", message.body)
                assert match is not None, "The message contains no link"
                return match.group(1)
        raise AssertionError(f"No message to {address}")


def use_deployment(monkeypatch: pytest.MonkeyPatch, **update: Any) -> None:
    """Switch the runtime deployment policy for this test.

    Mail links are built in ``auth.cloud`` from the configured public base URL.
    That module gets a distinct base URL so a link can be proven to come from
    configuration rather than from the request.
    """
    values: dict[str, Any] = {
        "deployment": Deployment.CLOUD,
        "mail_transport": MailTransport.SMTP,
        "oidc_connections": [],
        **update,
    }
    settings = get_settings().model_copy(update=values)
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)
    link_settings = settings.model_copy(update={"public_base_url": PUBLIC_BASE_URL})
    monkeypatch.setattr(cloud, "get_settings", lambda: link_settings)


def app_client(session: Session, mailbox: Mailbox) -> TestClient:
    from eimir.db.session import get_session
    from eimir.mail import sender
    from eimir.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[sender] = lambda: mailbox
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def mailbox() -> Mailbox:
    return Mailbox()


@pytest.fixture
def cloud_client(session: Session, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    use_deployment(monkeypatch)
    return app_client(session, mailbox)


@pytest.fixture
def self_hosted_client(
    session: Session, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> TestClient:
    use_deployment(monkeypatch, deployment=Deployment.SELF_HOSTED, mail_transport=MailTransport.LOG)
    return app_client(session, mailbox)


@pytest.fixture
def production_cloud(production_client, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    from eimir.mail import sender

    client, maker = production_client
    use_deployment(monkeypatch)
    mailbox = Mailbox()
    client.app.dependency_overrides[sender] = lambda: mailbox
    return client, maker, mailbox


def request_signup(client: TestClient, address: str) -> None:
    response = client.post(SIGNUP_REQUEST, json={"email": address})
    assert response.status_code == 202, response.text


def consume(client: TestClient, token: str, **extra: Any):  # type: ignore[no-untyped-def]
    return client.post(SIGNUP_CONSUME, json={"token": token, **extra})


def signed_up(client: TestClient, mailbox: Mailbox, address: str, **extra: Any) -> dict[str, Any]:
    request_signup(client, address)
    response = consume(client, mailbox.token_for(address), **extra)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def existing_account(session: Session, address: str, name: str = "Bestehend") -> Account:
    account = make_account(session, name)
    session.add(AccountEmail(account_id=account.id, email=address, is_primary=True))
    session.flush()
    return account


def accounts_with(session: Session, address: str) -> int:
    return int(
        session.execute(
            select(func.count()).select_from(AccountEmail).where(AccountEmail.email == address)
        ).scalar_one()
    )


def active_memberships(session: Session, account_id: object) -> list[Membership]:
    return list(
        session.execute(
            select(Membership).where(
                Membership.account_id == account_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        ).scalars()
    )


def set_access(session: Session, *, registration: bool = True, maintenance: bool = False) -> None:
    settings = administration.get_settings(session, for_update=True)
    settings.registration_enabled = registration
    settings.maintenance_mode = maintenance
    session.flush()


def in_parallel(call, count: int):  # type: ignore[no-untyped-def]
    """Release the same request from independent threads at the same moment."""
    barrier = Barrier(count)

    def attempt(index: int):  # type: ignore[no-untyped-def]
        barrier.wait(timeout=15)
        return call(index)

    with ThreadPoolExecutor(max_workers=count) as pool:
        return list(pool.map(attempt, range(count)))


class TestNewCloudUser:
    def test_unknown_address_receives_a_proof_from_the_configured_base_url(
        self, cloud_client, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        response = cloud_client.post(SIGNUP_REQUEST, json={"email": " Anna@Example.org "})

        assert response.status_code == 202
        assert response.content == b""
        assert [message.to for message in mailbox.messages] == [ANNA]
        assert f"{PUBLIC_BASE_URL}/auth/signup?token=" in mailbox.messages[0].body

    def test_proof_creates_exactly_one_verified_account_and_a_session(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        body = signed_up(cloud_client, mailbox, ANNA, displayName="Anna")

        assert body["accountCreated"] is True
        assert body["account"]["displayName"] == "Anna"
        assert accounts_with(session, ANNA) == 1
        email = session.execute(select(AccountEmail).where(AccountEmail.email == ANNA)).scalar_one()
        assert str(email.account_id) == body["account"]["id"]
        assert email.verified_at is not None
        assert email.is_primary is True

        headers = auth(body["tokens"]["accessToken"])
        assert cloud_client.get("/api/v1/auth/me", headers=headers).json()["id"] == str(
            email.account_id
        )
        assert cloud_client.get("/api/v1/auth/memberships", headers=headers).json() == []

    def test_missing_name_uses_the_neutral_fallback_not_the_address(
        self, cloud_client, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        body = signed_up(cloud_client, mailbox, ANNA)
        assert body["account"]["displayName"] == "Partner"

    def test_new_account_founds_its_space_and_invites_a_partner(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        body = signed_up(cloud_client, mailbox, ANNA, displayName="Anna")
        headers = auth(body["tokens"]["accessToken"])

        created = cloud_client.post("/api/v1/spaces", headers=headers)
        assert created.status_code == 201, created.text
        space = created.json()
        assert [partner["id"] for partner in space["partners"]] == [body["account"]["id"]]

        memberships = cloud_client.get("/api/v1/auth/memberships", headers=headers).json()
        assert [membership["spaceId"] for membership in memberships] == [space["id"]]
        assert cloud_client.get(f"/api/v1/spaces/{space['id']}", headers=headers).status_code == 200

        invitation = cloud_client.post(f"/api/v1/spaces/{space['id']}/invitations", headers=headers)
        assert invitation.status_code == 201
        assert invitation.json()["token"]

    def test_the_proof_is_persisted_only_as_a_hash(self, cloud_client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        request_signup(cloud_client, ANNA)
        token = mailbox.token_for(ANNA)

        proof = session.execute(select(SignupProof)).scalar_one()
        assert proof.token_hash == hash_token(token)
        assert token not in {str(value) for value in vars(proof).values()}


class TestEnumerationNeutrality:
    def test_known_and_unknown_addresses_get_the_same_response_and_the_same_work(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        existing_account(session, ANNA)

        known = cloud_client.post(SIGNUP_REQUEST, json={"email": ANNA})
        unknown = cloud_client.post(SIGNUP_REQUEST, json={"email": BEN})

        assert known.status_code == unknown.status_code == 202
        assert known.content == unknown.content == b""
        assert known.headers.get("content-type") == unknown.headers.get("content-type")
        # Both addresses receive exactly one proof. Sending mail only for one of
        # them would be a timing and side-channel difference.
        assert sorted(message.to for message in mailbox.messages) == [ANNA, BEN]
        assert mailbox.messages[0].subject == mailbox.messages[1].subject
        assert session.execute(select(func.count()).select_from(SignupProof)).scalar_one() == 2

    def test_rate_limit_is_identical_for_known_and_unknown_addresses(
        self, cloud_client, session
    ) -> None:  # type: ignore[no-untyped-def]
        existing_account(session, ANNA)
        for address in (ANNA, BEN):
            statuses = [
                cloud_client.post(SIGNUP_REQUEST, json={"email": address}).status_code
                for _ in range(6)
            ]
            assert statuses == [202] * 5 + [429]

    def test_invalid_address_is_rejected_independently_of_accounts(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        response = cloud_client.post(SIGNUP_REQUEST, json={"email": "not-an-address"})
        assert response.status_code == 422
        assert response.json()["code"] == "EMAIL_INVALID"

    def test_registration_state_does_not_change_the_public_request(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        existing_account(session, ANNA)
        set_access(session, registration=False)

        known = cloud_client.post(SIGNUP_REQUEST, json={"email": ANNA})
        unknown = cloud_client.post(SIGNUP_REQUEST, json={"email": BEN})

        assert known.status_code == unknown.status_code == 202
        assert sorted(message.to for message in mailbox.messages) == [ANNA, BEN]


class TestExistingCloudUser:
    def test_proof_signs_into_the_existing_account_without_a_duplicate(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        anna = existing_account(session, ANNA, "Anna")
        space = relationship_service.create_space(session, anna)
        session.flush()

        body = signed_up(cloud_client, mailbox, ANNA, displayName="Ignoriert")

        assert body["accountCreated"] is False
        assert body["account"] == {"id": str(anna.id), "displayName": "Anna"}
        assert accounts_with(session, ANNA) == 1
        session.expire_all()
        email = session.execute(select(AccountEmail).where(AccountEmail.email == ANNA)).scalar_one()
        assert email.verified_at is not None

        headers = auth(body["tokens"]["accessToken"])
        again = cloud_client.post("/api/v1/spaces", headers=headers)
        assert again.status_code == 409
        assert again.json()["code"] == "ACCOUNT_HAS_ACTIVE_SPACE"
        memberships = cloud_client.get("/api/v1/auth/memberships", headers=headers).json()
        assert [membership["spaceId"] for membership in memberships] == [str(space.id)]

    def test_account_created_between_request_and_redemption_is_signed_into(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        request_signup(cloud_client, ANNA)
        anna = existing_account(session, ANNA, "Anna")

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 201
        assert response.json()["accountCreated"] is False
        assert response.json()["account"]["id"] == str(anna.id)
        assert accounts_with(session, ANNA) == 1

    def test_creation_racing_another_path_converges_on_the_committed_owner(
        self, cloud_client, session, mailbox, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """The unique address constraint turns a lost race into a sign-in.

        The first lookup is made to miss an owner that already exists, which is
        exactly what a concurrent OIDC onboarding committing the same address
        looks like from inside the redemption.
        """
        request_signup(cloud_client, ANNA)
        anna = existing_account(session, ANNA, "Anna")
        real_lookup = cloud._primary_email
        calls = {"count": 0}

        def stale_first_lookup(db: Session, address: str) -> AccountEmail | None:
            calls["count"] += 1
            return None if calls["count"] == 1 else real_lookup(db, address)

        monkeypatch.setattr(cloud, "_primary_email", stale_first_lookup)

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 201, response.text
        assert response.json()["accountCreated"] is False
        assert response.json()["account"]["id"] == str(anna.id)
        assert accounts_with(session, ANNA) == 1
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 1

    def test_disabled_account_is_not_signed_in(self, cloud_client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        anna = existing_account(session, ANNA)
        anna.disabled_at = now()
        session.flush()
        request_signup(cloud_client, ANNA)

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 422
        assert response.json()["code"] == "ACTION_TOKEN_INVALID"
        assert accounts_with(session, ANNA) == 1


class TestProofLifecycle:
    def test_consumed_proof_is_rejected(self, cloud_client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        request_signup(cloud_client, ANNA)
        token = mailbox.token_for(ANNA)
        assert consume(cloud_client, token).status_code == 201

        replay = consume(cloud_client, token)

        assert replay.status_code == 422
        assert replay.json()["code"] == "ACTION_TOKEN_INVALID"
        assert accounts_with(session, ANNA) == 1

    def test_expired_proof_is_rejected(self, cloud_client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        request_signup(cloud_client, ANNA)
        proof = session.execute(select(SignupProof)).scalar_one()
        proof.expires_at = now() - timedelta(seconds=1)
        session.flush()

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 422
        assert response.json()["code"] == "ACTION_TOKEN_INVALID"
        assert accounts_with(session, ANNA) == 0

    def test_a_newer_request_supersedes_the_older_proof(self, cloud_client, mailbox) -> None:  # type: ignore[no-untyped-def]
        request_signup(cloud_client, ANNA)
        older = mailbox.token_for(ANNA)
        request_signup(cloud_client, ANNA)
        newer = mailbox.token_for(ANNA)

        assert consume(cloud_client, older).status_code == 422
        assert consume(cloud_client, newer).status_code == 201

    @pytest.mark.parametrize("token", ["", "unknown-token"])
    def test_unknown_proof_is_rejected(self, cloud_client, session, token) -> None:  # type: ignore[no-untyped-def]
        response = consume(cloud_client, token)
        assert response.status_code == 422
        assert response.json()["code"] == "ACTION_TOKEN_INVALID"
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 0

    def test_a_signup_proof_is_not_a_magic_link_and_vice_versa(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        existing_account(session, ANNA)
        request_signup(cloud_client, ANNA)
        signup_token = mailbox.token_for(ANNA)
        assert (
            cloud_client.post(
                "/api/v1/auth/magic-link/consume", json={"token": signup_token}
            ).status_code
            == 422
        )

        assert (
            cloud_client.post("/api/v1/auth/magic-link/request", json={"email": ANNA}).status_code
            == 202
        )
        magic_token = mailbox.token_for(ANNA)
        assert magic_token != signup_token
        assert consume(cloud_client, magic_token).status_code == 422

    def test_security_retention_removes_only_proofs_that_cannot_be_redeemed(self, session) -> None:  # type: ignore[no-untyped-def]
        open_proof, _ = action_tokens.issue_signup_proof(session, ANNA)
        expired, _ = action_tokens.issue_signup_proof(session, BEN)
        expired.expires_at = now() - timedelta(seconds=1)
        _, consumed_token = action_tokens.issue_signup_proof(session, CARA)
        action_tokens.consume_signup_proof(session, consumed_token.token)
        superseded, _ = action_tokens.issue_signup_proof(session, "dora@example.org")
        action_tokens.issue_signup_proof(session, "dora@example.org")
        session.flush()

        assert action_tokens.prune_signup_proofs(session) == 3
        remaining = set(session.execute(select(SignupProof.email)).scalars())
        assert remaining == {ANNA, "dora@example.org"}
        assert session.get(SignupProof, open_proof.id) is not None
        assert superseded.id not in set(session.execute(select(SignupProof.id)).scalars())


class TestProductionTransactions:
    def test_concurrent_redemptions_of_one_proof_create_exactly_one_account(
        self, production_cloud
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = production_cloud
        request_signup(client, ANNA)
        token = mailbox.token_for(ANNA)

        statuses = in_parallel(lambda _: consume(client, token).status_code, count=6)

        assert sorted(statuses) == [201] + [422] * 5
        with maker() as session:
            assert accounts_with(session, ANNA) == 1
            assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 1

    def test_a_rejected_redemption_rolls_back_and_the_proof_stays_redeemable(
        self, production_cloud
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = production_cloud
        request_signup(client, ANNA)
        token = mailbox.token_for(ANNA)

        too_long = consume(client, token, displayName="x" * 121)
        assert too_long.status_code == 422
        assert too_long.json()["code"] == "DISPLAY_NAME_TOO_LONG"

        with maker() as session:
            set_access(session, registration=False)
            session.commit()
        disabled = consume(client, token, displayName="Anna")
        assert disabled.status_code == 403
        assert disabled.json()["code"] == "REGISTRATION_DISABLED"
        with maker() as session:
            assert accounts_with(session, ANNA) == 0
            set_access(session, registration=True)
            session.commit()

        response = consume(client, token, displayName="Anna")
        assert response.status_code == 201, response.text
        assert response.json()["accountCreated"] is True

    def test_concurrent_first_space_requests_create_exactly_one_space(
        self, production_cloud
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = production_cloud
        body = signed_up(client, mailbox, ANNA, displayName="Anna")
        headers = auth(body["tokens"]["accessToken"])

        responses = in_parallel(lambda _: client.post("/api/v1/spaces", headers=headers), count=6)

        assert sorted(response.status_code for response in responses) == [201] + [409] * 5
        assert {
            response.json()["code"] for response in responses if response.status_code == 409
        } == {"ACCOUNT_HAS_ACTIVE_SPACE"}
        with maker() as session:
            memberships = active_memberships(session, body["account"]["id"])
            assert len(memberships) == 1
            created = next(r.json() for r in responses if r.status_code == 201)
            assert str(memberships[0].space_id) == created["id"]


class TestFounderSpace:
    def test_retry_after_success_does_not_create_a_second_space(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        body = signed_up(cloud_client, mailbox, ANNA)
        headers = auth(body["tokens"]["accessToken"])

        assert cloud_client.post("/api/v1/spaces", headers=headers).status_code == 201
        retry = cloud_client.post("/api/v1/spaces", headers=headers)

        assert retry.status_code == 409
        assert retry.json()["code"] == "ACCOUNT_HAS_ACTIVE_SPACE"
        assert len(active_memberships(session, body["account"]["id"])) == 1

    def test_founder_cannot_be_chosen_by_the_client(self, cloud_client, session) -> None:  # type: ignore[no-untyped-def]
        caller = make_account(session, "Caller")
        other = make_account(session, "Other")
        token = sign_in(session, caller)

        response = cloud_client.post(
            "/api/v1/spaces",
            json={"founderAccountId": str(other.id), "accountId": str(other.id)},
            headers=auth(token),
        )

        assert response.status_code == 201
        assert [partner["id"] for partner in response.json()["partners"]] == [str(caller.id)]
        assert active_memberships(session, other.id) == []

    def test_joined_partner_is_not_given_another_space(self, cloud_client, session) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = relationship_service.create_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        session.flush()

        response = cloud_client.post("/api/v1/spaces", headers=auth(sign_in(session, ben)))

        assert response.status_code == 409
        assert response.json()["code"] == "ACCOUNT_HAS_ACTIVE_SPACE"

    def test_ended_history_is_neither_reactivated_nor_reused(self, cloud_client, session) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        former = relationship_service.create_space(session, anna)
        membership = relationship_service.add_member(session, former.id, ben)
        relationship_service.end_membership(session, membership)
        session.flush()

        response = cloud_client.post("/api/v1/spaces", headers=auth(sign_in(session, ben)))

        assert response.status_code == 201
        assert response.json()["id"] != str(former.id)
        session.refresh(membership)
        assert membership.status == MembershipStatus.LEFT.value
        assert [str(m.space_id) for m in active_memberships(session, ben.id)] == [
            response.json()["id"]
        ]

    def test_anonymous_callers_cannot_create_a_space(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        response = cloud_client.post("/api/v1/spaces")
        assert response.status_code == 401

    def test_space_creation_is_blocked_during_maintenance(self, cloud_client, session) -> None:  # type: ignore[no-untyped-def]
        token = sign_in(session, make_account(session, "Anna"))
        set_access(session, maintenance=True)

        response = cloud_client.post("/api/v1/spaces", headers=auth(token))

        assert response.status_code == 503
        assert response.json()["code"] == "MAINTENANCE_MODE"


class TestRegistrationDisabled:
    def test_unknown_address_creates_no_account_while_registration_is_disabled(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        set_access(session, registration=False)
        request_signup(cloud_client, ANNA)

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 403
        assert response.json()["code"] == "REGISTRATION_DISABLED"
        assert accounts_with(session, ANNA) == 0

    def test_unknown_address_creates_no_account_during_maintenance(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        set_access(session, maintenance=True)
        request_signup(cloud_client, ANNA)

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 503
        assert response.json()["code"] == "MAINTENANCE_MODE"
        assert accounts_with(session, ANNA) == 0

    @pytest.mark.parametrize(
        "access", [{"registration": False}, {"maintenance": True}], ids=["disabled", "maintenance"]
    )
    def test_existing_account_still_signs_in(self, cloud_client, session, mailbox, access) -> None:  # type: ignore[no-untyped-def]
        anna = existing_account(session, ANNA)
        set_access(session, **access)
        request_signup(cloud_client, ANNA)

        response = consume(cloud_client, mailbox.token_for(ANNA))

        assert response.status_code == 201
        assert response.json()["account"]["id"] == str(anna.id)
        assert response.json()["accountCreated"] is False


class TestInstanceStatus:
    def status(self, client: TestClient) -> dict[str, Any]:
        response = client.get("/api/v1/instance/status")
        assert response.status_code == 200
        body: dict[str, Any] = response.json()
        return body

    def test_cloud_with_mail_offers_self_service_signup(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        body = self.status(cloud_client)
        assert body["registrationAvailable"] is True
        assert body["accountCreation"] == "self_service"
        assert body["selfServiceSignupAvailable"] is True
        assert body["auth"]["localPassword"] is False

    @pytest.mark.parametrize(
        ("access", "reason"),
        [({"registration": False}, "administrator"), ({"maintenance": True}, "maintenance")],
    )
    def test_administrative_state_is_separate_from_the_creation_path(
        self, cloud_client, session, access, reason
    ) -> None:  # type: ignore[no-untyped-def]
        set_access(session, **access)
        body = self.status(cloud_client)
        assert body["accountCreation"] == "self_service"
        assert body["registrationAvailable"] is False
        assert body["registrationUnavailableReason"] == reason
        assert body["selfServiceSignupAvailable"] is False

    def test_cloud_without_mail_has_no_self_service_path(
        self, session, mailbox, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        use_deployment(monkeypatch, mail_transport=MailTransport.NONE)
        body = self.status(app_client(session, mailbox))
        assert body["auth"]["magicLink"] is False
        assert body["registrationAvailable"] is True
        assert body["accountCreation"] == "invitation"
        assert body["selfServiceSignupAvailable"] is False

    def test_self_hosted_is_invitation_only_even_with_registration_enabled(
        self, self_hosted_client
    ) -> None:  # type: ignore[no-untyped-def]
        body = self.status(self_hosted_client)
        assert body["registrationAvailable"] is True
        assert body["auth"]["magicLink"] is True
        assert body["accountCreation"] == "invitation"
        assert body["selfServiceSignupAvailable"] is False


class TestInvitedPartner:
    def founder_invitation(
        self, client: TestClient, mailbox: Mailbox
    ) -> tuple[dict[str, Any], str]:
        founder = signed_up(client, mailbox, ANNA, displayName="Anna")
        headers = auth(founder["tokens"]["accessToken"])
        space = client.post("/api/v1/spaces", headers=headers).json()
        invitation = client.post(f"/api/v1/spaces/{space['id']}/invitations", headers=headers)
        assert invitation.status_code == 201
        return space, invitation.json()["token"]

    def test_unknown_partner_creates_a_verified_account_and_joins(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        space, invitation = self.founder_invitation(cloud_client, mailbox)

        ben = signed_up(cloud_client, mailbox, BEN, displayName="Ben")
        assert ben["accountCreated"] is True
        headers = auth(ben["tokens"]["accessToken"])
        assert cloud_client.get(f"/api/v1/spaces/{space['id']}", headers=headers).status_code == 404

        accepted = cloud_client.post(
            "/api/v1/invitations/accept", json={"token": invitation}, headers=headers
        )

        assert accepted.status_code == 201
        assert accepted.json()["spaceId"] == space["id"]
        partners = cloud_client.get(f"/api/v1/spaces/{space['id']}", headers=headers).json()
        assert sorted(partner["displayName"] for partner in partners["partners"]) == ["Anna", "Ben"]

    def test_existing_partner_signs_in_and_joins(self, cloud_client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        space, invitation = self.founder_invitation(cloud_client, mailbox)
        existing_account(session, BEN, "Ben")

        ben = signed_up(cloud_client, mailbox, BEN)
        assert ben["accountCreated"] is False

        accepted = cloud_client.post(
            "/api/v1/invitations/accept",
            json={"token": invitation},
            headers=auth(ben["tokens"]["accessToken"]),
        )
        assert accepted.status_code == 201
        assert accepted.json()["spaceId"] == space["id"]

    def test_revoked_expired_and_used_invitations_stay_invalid(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        from eimir.relationship.models import Invitation

        founder = signed_up(cloud_client, mailbox, ANNA)
        founder_headers = auth(founder["tokens"]["accessToken"])
        space = cloud_client.post("/api/v1/spaces", headers=founder_headers).json()
        base = f"/api/v1/spaces/{space['id']}/invitations"
        revoked = cloud_client.post(base, headers=founder_headers).json()
        expired = cloud_client.post(base, headers=founder_headers).json()
        used = cloud_client.post(base, headers=founder_headers).json()
        cloud_client.delete(f"{base}/{revoked['id']}", headers=founder_headers)
        expired_row = session.get(Invitation, UUID(expired["id"]))
        assert expired_row is not None
        expired_row.expires_at = now() - timedelta(seconds=1)
        session.flush()

        ben = auth(signed_up(cloud_client, mailbox, BEN)["tokens"]["accessToken"])
        cara = auth(signed_up(cloud_client, mailbox, CARA)["tokens"]["accessToken"])
        accept = "/api/v1/invitations/accept"
        assert (
            cloud_client.post(accept, json={"token": used["token"]}, headers=ben).status_code == 201
        )

        for token in (revoked["token"], expired["token"], used["token"]):
            response = cloud_client.post(accept, json={"token": token}, headers=cara)
            assert response.status_code == 422
            assert response.json()["code"] == "INVITATION_INVALID"
        assert active_memberships(session, UUID(signed_in_id(cloud_client, cara))) == []

    def test_full_space_rejects_a_third_person_who_keeps_an_own_path(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        founder = signed_up(cloud_client, mailbox, ANNA)
        founder_headers = auth(founder["tokens"]["accessToken"])
        space = cloud_client.post("/api/v1/spaces", headers=founder_headers).json()
        base = f"/api/v1/spaces/{space['id']}/invitations"
        first = cloud_client.post(base, headers=founder_headers).json()
        second = cloud_client.post(base, headers=founder_headers).json()

        ben = auth(signed_up(cloud_client, mailbox, BEN)["tokens"]["accessToken"])
        accept = "/api/v1/invitations/accept"
        assert (
            cloud_client.post(accept, json={"token": first["token"]}, headers=ben).status_code
            == 201
        )

        cara = auth(signed_up(cloud_client, mailbox, CARA)["tokens"]["accessToken"])
        full = cloud_client.post(accept, json={"token": second["token"]}, headers=cara)
        assert full.status_code == 409
        assert full.json()["code"] == "SPACE_FULL"

        own = cloud_client.post("/api/v1/spaces", headers=cara)
        assert own.status_code == 201
        assert own.json()["id"] != space["id"]

    def test_invited_unknown_person_gets_no_account_while_registration_is_disabled(
        self, cloud_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        self.founder_invitation(cloud_client, mailbox)
        set_access(session, registration=False)
        request_signup(cloud_client, BEN)

        response = consume(cloud_client, mailbox.token_for(BEN))

        assert response.status_code == 403
        assert response.json()["code"] == "REGISTRATION_DISABLED"
        assert accounts_with(session, BEN) == 0


def signed_in_id(client: TestClient, headers: dict[str, str]) -> str:
    return str(client.get("/api/v1/auth/me", headers=headers).json()["id"])


class TestDeploymentIsolation:
    def test_self_hosted_rejects_the_signup_request_before_any_work(
        self, self_hosted_client, session, mailbox
    ) -> None:  # type: ignore[no-untyped-def]
        response = self_hosted_client.post(SIGNUP_REQUEST, json={"email": ANNA})

        assert response.status_code == 403
        assert response.json()["code"] == "AUTH_METHOD_DISABLED"
        assert mailbox.messages == []
        assert session.execute(select(func.count()).select_from(SignupProof)).scalar_one() == 0

    def test_self_hosted_rejects_even_a_genuine_proof(self, self_hosted_client, session) -> None:  # type: ignore[no-untyped-def]
        """A proof left over from a Cloud configuration cannot open Self-Hosted."""
        proof, issued = action_tokens.issue_signup_proof(session, ANNA)
        session.flush()

        response = consume(self_hosted_client, issued.token)

        assert response.status_code == 403
        assert response.json()["code"] == "AUTH_METHOD_DISABLED"
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 0
        session.refresh(proof)
        assert proof.consumed_at is None

    def test_self_hosted_first_account_still_requires_the_bootstrap_proof(
        self, self_hosted_client, session
    ) -> None:  # type: ignore[no-untyped-def]
        registration = {"displayName": "Anna", "email": ANNA, "password": "ein-langes-passwort-123"}

        without = self_hosted_client.post("/api/v1/auth/register", json=registration)
        assert without.status_code == 403
        assert without.json()["code"] == "BOOTSTRAP_INVALID"
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 0

        first = self_hosted_client.post(
            "/api/v1/auth/register", json={**registration, "bootstrapToken": TEST_BOOTSTRAP_TOKEN}
        )
        assert first.status_code == 201

    def test_self_hosted_later_accounts_still_require_an_invitation(
        self, self_hosted_client, session
    ) -> None:  # type: ignore[no-untyped-def]
        password = "ein-langes-passwort-123"
        first = self_hosted_client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": ANNA,
                "password": password,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert first.status_code == 201

        later = self_hosted_client.post(
            "/api/v1/auth/register",
            json={"displayName": "Ben", "email": BEN, "password": password},
        )
        assert later.status_code == 403
        assert later.json()["code"] == "REGISTRATION_REQUIRES_INVITATION"
        assert accounts_with(session, BEN) == 0

    def test_cloud_without_mail_cannot_redeem_proofs(self, session, mailbox, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        use_deployment(monkeypatch, mail_transport=MailTransport.NONE)
        client = app_client(session, mailbox)
        _, issued = action_tokens.issue_signup_proof(session, ANNA)
        session.flush()

        # The policy rejects before the mail transport is used, so no further
        # proof is issued even when a transport happens to be resolvable.
        rejected = client.post(SIGNUP_REQUEST, json={"email": ANNA})
        assert rejected.status_code == 403
        assert rejected.json()["code"] == "AUTH_METHOD_DISABLED"
        assert mailbox.messages == []
        assert session.execute(select(func.count()).select_from(SignupProof)).scalar_one() == 1

        response = consume(client, issued.token)
        assert response.status_code == 403
        assert response.json()["code"] == "AUTH_METHOD_DISABLED"
        assert accounts_with(session, ANNA) == 0

    def test_cloud_never_accepts_the_bootstrap_proof(self, cloud_client, session) -> None:  # type: ignore[no-untyped-def]
        response = cloud_client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": ANNA,
                "password": "ein-langes-passwort-123",
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert response.status_code == 403
        assert response.json()["code"] == "AUTH_METHOD_DISABLED"
        assert accounts_with(session, ANNA) == 0


class TestLinkHostAndLogs:
    def test_link_host_ignores_forged_request_headers(self, cloud_client, mailbox) -> None:  # type: ignore[no-untyped-def]
        response = cloud_client.post(
            SIGNUP_REQUEST,
            json={"email": ANNA},
            headers={
                "Host": "attacker.example",
                "X-Forwarded-Host": "attacker.example",
                "Forwarded": "host=attacker.example",
            },
        )

        assert response.status_code == 202
        body = mailbox.messages[-1].body
        assert f"{PUBLIC_BASE_URL}/auth/signup?token=" in body
        assert "attacker.example" not in body

    def test_proofs_and_addresses_do_not_reach_application_logs(
        self, cloud_client, mailbox, caplog
    ) -> None:  # type: ignore[no-untyped-def]
        caplog.set_level(logging.DEBUG, logger="eimir")
        request_signup(cloud_client, ANNA)
        token = mailbox.token_for(ANNA)
        assert consume(cloud_client, token).status_code == 201
        assert consume(cloud_client, token).status_code == 422

        for record in caplog.records:
            rendered = " ".join(
                [record.getMessage(), *(str(value) for value in vars(record).values())]
            )
            assert token not in rendered
            assert hash_token(token) not in rendered
            assert ANNA not in rendered
