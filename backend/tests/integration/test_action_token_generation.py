"""One live action-token generation per flow and subject.

Magic link, email verification, and account recovery all promise that only the
most recently requested link stays valid. Each individual token was already
random, hashed, short-lived, and consumable once, but that promise is about the
relationship between generations, so it only holds if requesting a replacement
and redeeming a predecessor are ordered against each other rather than left to
timing.

Every concurrent case here runs on the real request unit of work with
independent sessions and transactions. A shared-session test could not show the
difference: it never commits, so two "concurrent" requests would simply be two
statements in one transaction.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from datetime import timedelta
from threading import Barrier, BrokenBarrierError

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import action_tokens
from eimir.auth.tokens import hash_token
from eimir.core.clock import now
from eimir.identity.models import (
    Account,
    AccountEmail,
    AccountRecoveryToken,
    AuthIdentity,
    AuthProvider,
    EmailVerificationToken,
    MagicLinkToken,
    OneTimeTokenMixin,
)
from eimir.mail import MailMessage, MailSender
from tests.conftest import auth, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ADDRESS = "anna@example.org"
OTHER_ADDRESS = "niemand@example.org"
PASSWORD = "ein-ausreichend-langes-passwort"
NEW_PASSWORD = "ein-anderes-ausreichend-langes-passwort"

MAGIC_LINK_REQUEST = "/api/v1/auth/magic-link/request"
MAGIC_LINK_CONSUME = "/api/v1/auth/magic-link/consume"
VERIFICATION_REQUEST = "/api/v1/auth/email/verification/request"
VERIFICATION_CONFIRM = "/api/v1/auth/email/verification/confirm"
RECOVERY_REQUEST = "/api/v1/auth/recovery/request"
RECOVERY_CONSUME = "/api/v1/auth/recovery/consume"


class Mailbox(MailSender):
    """Collect messages instead of sending them, and stay thread-safe."""

    def __init__(self) -> None:
        self.messages: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)

    def tokens(self) -> list[str]:
        found = []
        for message in self.messages:
            match = re.search(r"token=([A-Za-z0-9_\-]+)", message.body)
            assert match is not None, "The message contains no link"
            found.append(match.group(1))
        return found


class FailingMailbox(Mailbox):
    """A transport that cannot deliver."""

    def send(self, message: MailMessage) -> None:
        from eimir.mail import MailTransportError

        raise MailTransportError("the mail server refused the message")


@pytest.fixture
def cloud_client(production_client):  # type: ignore[no-untyped-def]
    """The real request unit of work plus a capturing mailbox.

    Delivery is the only part that must not reach outside the test; the
    session, transaction, and lock behavior are exactly the production ones.
    """
    from eimir.mail import sender

    client, maker = production_client
    mailbox = Mailbox()
    client.app.dependency_overrides[sender] = lambda: mailbox
    return client, maker, mailbox


def register(client) -> dict[str, object]:  # type: ignore[no-untyped-def]
    from tests.conftest import TEST_BOOTSTRAP_TOKEN

    response = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Anna",
            "email": ADDRESS,
            "password": PASSWORD,
            "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
        },
    )
    assert response.status_code == 201, response.text
    result: dict[str, object] = response.json()
    return result


def open_tokens[TokenModel: OneTimeTokenMixin](
    session: Session, model_type: type[TokenModel]
) -> list[TokenModel]:
    current_time = now()
    return [
        model
        for model in session.execute(select(model_type)).scalars().all()
        if model.is_open(current_time)
    ]


def in_parallel(call, count: int = 2):  # type: ignore[no-untyped-def]
    """Run the same request from independent threads at the same moment."""
    barrier = Barrier(count)

    def attempt(index: int):  # type: ignore[no-untyped-def]
        barrier.wait(timeout=15)
        return call(index)

    with ThreadPoolExecutor(max_workers=count) as pool:
        return list(pool.map(attempt, range(count)))


def hold_inside_the_window(monkeypatch, parties: int = 2, timeout: float = 1.5) -> None:
    """Hold every request inside the window two of them must never share.

    Releasing the requests at the endpoint does not reproduce the race
    reliably. Each one first reserves its rate-limit slot, and that reservation
    takes its own short lock which skews the threads apart again by however
    long it happens to take, so the second request can easily arrive after the
    first has already committed.

    The window that has to be closed is the one between reading the open
    predecessors and inserting the successor, so the barrier sits there: on
    token generation, which is inside it in both the serialized and the
    unserialized version. Unserialized, both requests meet, both have read "no
    open predecessor", and both commit one - the defect, in every run.
    Serialized they cannot meet, because the second is still waiting for the
    generation lock. That is not a deadlock to be avoided but the property
    under test, so the wait times out, the holder finishes, and the waiter then
    observes the predecessor it must supersede.
    """
    barrier = Barrier(parties)
    original = action_tokens.generate_token

    def synchronized(*arguments, **keywords):  # type: ignore[no-untyped-def]
        with suppress(BrokenBarrierError):
            barrier.wait(timeout=timeout)
        return original(*arguments, **keywords)

    monkeypatch.setattr(action_tokens, "generate_token", synchronized)


class TestMagicLinkGeneration:
    def test_requests_racing_inside_the_window_leave_exactly_one_open_token(
        self, cloud_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        "Both transactions are inside the contended region in every run."
        client, maker, mailbox = cloud_client
        register(client)
        hold_inside_the_window(monkeypatch)

        responses = in_parallel(lambda _: client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(check.execute(select(MagicLinkToken)).scalars().all()) == 2
            surviving = open_tokens(check, MagicLinkToken)
            assert len(surviving) == 1
            surviving_hash = surviving[0].token_hash

        superseded = next(
            token for token in mailbox.tokens() if hash_token(token) != surviving_hash
        )
        rejected = client.post(MAGIC_LINK_CONSUME, json={"token": superseded})
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"

    def test_two_concurrent_requests_leave_exactly_one_open_token(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        register(client)

        responses = in_parallel(lambda _: client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(check.execute(select(MagicLinkToken)).scalars().all()) == 2
            assert len(open_tokens(check, MagicLinkToken)) == 1

    def test_the_superseded_link_no_longer_signs_in(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        in_parallel(lambda _: client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}))

        with maker() as check:
            surviving = open_tokens(check, MagicLinkToken)[0].token_hash
        issued = mailbox.tokens()
        superseded = [token for token in issued if hash_token(token) != surviving]
        assert len(superseded) == 1

        response = client.post(MAGIC_LINK_CONSUME, json={"token": superseded[0]})
        assert response.status_code == 422
        assert response.json()["code"] == "ACTION_TOKEN_INVALID"

    def test_the_surviving_link_works_exactly_once(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        in_parallel(lambda _: client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}))

        with maker() as check:
            surviving = open_tokens(check, MagicLinkToken)[0].token_hash
        winner = next(token for token in mailbox.tokens() if hash_token(token) == surviving)

        first = client.post(MAGIC_LINK_CONSUME, json={"token": winner})
        assert first.status_code == 201, first.text
        second = client.post(MAGIC_LINK_CONSUME, json={"token": winner})
        assert second.status_code == 422
        assert second.json()["code"] == "ACTION_TOKEN_INVALID"


class TestRecoveryGeneration:
    def test_requests_racing_inside_the_window_leave_exactly_one_open_token(
        self, cloud_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        hold_inside_the_window(monkeypatch)

        responses = in_parallel(lambda _: client.post(RECOVERY_REQUEST, json={"email": ADDRESS}))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(check.execute(select(AccountRecoveryToken)).scalars().all()) == 2
            surviving = open_tokens(check, AccountRecoveryToken)
            assert len(surviving) == 1
            surviving_hash = surviving[0].token_hash

        superseded = next(
            token for token in mailbox.tokens() if hash_token(token) != surviving_hash
        )
        rejected = client.post(
            RECOVERY_CONSUME, json={"token": superseded, "newPassword": NEW_PASSWORD}
        )
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"

    def test_two_concurrent_requests_leave_exactly_one_open_token(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        register(client)

        responses = in_parallel(lambda _: client.post(RECOVERY_REQUEST, json={"email": ADDRESS}))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(check.execute(select(AccountRecoveryToken)).scalars().all()) == 2
            assert len(open_tokens(check, AccountRecoveryToken)) == 1

    def test_superseded_recovery_link_is_rejected_and_the_winner_works_once(
        self, cloud_client
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        in_parallel(lambda _: client.post(RECOVERY_REQUEST, json={"email": ADDRESS}))

        with maker() as check:
            surviving = open_tokens(check, AccountRecoveryToken)[0].token_hash
        issued = mailbox.tokens()
        superseded = next(token for token in issued if hash_token(token) != surviving)
        winner = next(token for token in issued if hash_token(token) == surviving)

        rejected = client.post(
            RECOVERY_CONSUME, json={"token": superseded, "newPassword": NEW_PASSWORD}
        )
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"

        accepted = client.post(
            RECOVERY_CONSUME, json={"token": winner, "newPassword": NEW_PASSWORD}
        )
        assert accepted.status_code == 201, accepted.text
        replay = client.post(RECOVERY_CONSUME, json={"token": winner, "newPassword": NEW_PASSWORD})
        assert replay.status_code == 422


class TestEmailVerificationGeneration:
    """Verification needed no concurrency at all to accumulate proofs."""

    def test_a_new_request_supersedes_the_previous_one(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        account = register(client)
        headers = auth(account["tokens"]["accessToken"])

        assert client.post(VERIFICATION_REQUEST, headers=headers).status_code == 202
        assert client.post(VERIFICATION_REQUEST, headers=headers).status_code == 202

        first, second = mailbox.tokens()
        with maker() as check:
            assert len(check.execute(select(EmailVerificationToken)).scalars().all()) == 2
            still_open = open_tokens(check, EmailVerificationToken)
            assert len(still_open) == 1
            assert still_open[0].token_hash == hash_token(second)

        rejected = client.post(VERIFICATION_CONFIRM, json={"token": first})
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"

        accepted = client.post(VERIFICATION_CONFIRM, json={"token": second})
        assert accepted.status_code == 204
        replay = client.post(VERIFICATION_CONFIRM, json={"token": second})
        assert replay.status_code == 422

    def test_confirmation_still_marks_the_address_verified(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        "ServerAdmin authorization depends on this flag, so it must survive."
        client, maker, mailbox = cloud_client
        account = register(client)
        headers = auth(account["tokens"]["accessToken"])

        client.post(VERIFICATION_REQUEST, headers=headers)
        client.post(VERIFICATION_REQUEST, headers=headers)
        assert (
            client.post(VERIFICATION_CONFIRM, json={"token": mailbox.tokens()[-1]}).status_code
            == 204
        )

        with maker() as check:
            record = check.execute(
                select(AccountEmail).where(AccountEmail.email == ADDRESS)
            ).scalar_one()
            assert record.verified_at is not None

    def test_requests_racing_inside_the_window_leave_exactly_one_open_token(
        self, cloud_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        account = register(client)
        headers = auth(account["tokens"]["accessToken"])
        hold_inside_the_window(monkeypatch)

        responses = in_parallel(lambda _: client.post(VERIFICATION_REQUEST, headers=headers))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(check.execute(select(EmailVerificationToken)).scalars().all()) == 2
            surviving = open_tokens(check, EmailVerificationToken)
            assert len(surviving) == 1
            surviving_hash = surviving[0].token_hash

        superseded = next(
            token for token in mailbox.tokens() if hash_token(token) != surviving_hash
        )
        assert client.post(VERIFICATION_CONFIRM, json={"token": superseded}).status_code == 422

    def test_concurrent_requests_leave_exactly_one_open_token(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        account = register(client)
        headers = auth(account["tokens"]["accessToken"])

        responses = in_parallel(lambda _: client.post(VERIFICATION_REQUEST, headers=headers))
        assert [response.status_code for response in responses] == [202, 202]

        with maker() as check:
            assert len(open_tokens(check, EmailVerificationToken)) == 1


class TestConsumeAgainstReissue:
    def test_concurrent_consume_and_reissue_never_leaves_two_open_tokens(
        self, cloud_client
    ) -> None:  # type: ignore[no-untyped-def]
        """Whichever wins the subject lock decides; both orders stay consistent.

        Consuming first leaves a consumed token plus one new open generation.
        Reissuing first revokes the predecessor, so the redemption is rejected
        and again exactly one generation stays open. A superseded token is
        never reopened either way.
        """
        client, maker, mailbox = cloud_client
        register(client)
        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        first_token = mailbox.tokens()[0]

        def call(index: int):  # type: ignore[no-untyped-def]
            if index == 0:
                return "consume", client.post(MAGIC_LINK_CONSUME, json={"token": first_token})
            return "reissue", client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS})

        results = dict(in_parallel(call))
        assert results["reissue"].status_code == 202
        assert results["consume"].status_code in {201, 422}

        with maker() as check:
            assert len(open_tokens(check, MagicLinkToken)) == 1
            consumed = [
                model
                for model in check.execute(select(MagicLinkToken)).scalars().all()
                if model.token_hash == hash_token(first_token)
            ]
            assert len(consumed) == 1
            if results["consume"].status_code == 201:
                assert consumed[0].consumed_at is not None
            else:
                assert consumed[0].consumed_at is None
                assert consumed[0].revoked_at is not None

        # The first token is spent or superseded in either order, never usable.
        assert client.post(MAGIC_LINK_CONSUME, json={"token": first_token}).status_code == 422


class TestDeliveryFailure:
    def test_failed_delivery_leaves_one_generation_and_revives_nothing(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        """A transport failure must not resurrect the predecessor.

        The response also stays identical, because a caller who could tell a
        delivery failure apart could tell an existing address apart with it.
        """
        from eimir.mail import sender

        client, maker = production_client
        working = Mailbox()
        client.app.dependency_overrides[sender] = lambda: working
        register(client)
        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        first_token = working.tokens()[0]

        client.app.dependency_overrides[sender] = lambda: FailingMailbox()
        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202

        with maker() as check:
            assert len(open_tokens(check, MagicLinkToken)) == 1
            superseded = check.execute(
                select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(first_token))
            ).scalar_one()
            assert superseded.revoked_at is not None

        assert client.post(MAGIC_LINK_CONSUME, json={"token": first_token}).status_code == 422


class TestPrivacyAndLimitsAreUnchanged:
    def test_unknown_address_stays_indistinguishable(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        register(client)

        known = client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS})
        unknown = client.post(MAGIC_LINK_REQUEST, json={"email": OTHER_ADDRESS})

        assert known.status_code == unknown.status_code == 202
        assert known.text == unknown.text
        assert known.headers.get("content-type") == unknown.headers.get("content-type")
        with maker() as check:
            assert (
                check.execute(
                    select(AccountEmail).where(AccountEmail.email == OTHER_ADDRESS)
                ).scalar_one_or_none()
                is None
            )

    def test_rate_limit_still_applies(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, _maker, _mailbox = cloud_client
        register(client)

        statuses = [
            client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code for _ in range(7)
        ]
        assert statuses[-1] == 429
        assert statuses.count(202) == 5

    def test_only_hashes_are_persisted(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS})
        plaintext = mailbox.tokens()[0]

        with maker() as check:
            for model in check.execute(select(MagicLinkToken)).scalars().all():
                assert model.token_hash != plaintext
                assert plaintext not in repr(model.__dict__)


class TestOperatorRecoveryProof:
    def test_operator_proof_supersedes_an_open_recovery_link(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        """One authoritative generation, whichever path issued it."""
        from eimir.administration import account_operations

        client, maker, mailbox = cloud_client
        register(client)
        assert client.post(RECOVERY_REQUEST, json={"email": ADDRESS}).status_code == 202
        mailed = mailbox.tokens()[0]

        with maker.begin() as operation:
            target = operation.execute(
                select(Account)
                .join(AccountEmail, AccountEmail.account_id == Account.id)
                .where(AccountEmail.email == ADDRESS)
            ).scalar_one()
            operator = Account(display_name="Operator")
            operation.add(operator)
            operation.flush()
            operation.add(
                AuthIdentity(
                    account_id=operator.id,
                    provider=AuthProvider.LOCAL_PASSWORD.value,
                    subject="operator@example.org",
                    secret_hash="unused",
                )
            )
            operation.flush()
            account_operations.issue_operator_recovery(
                operation, actor=operator, target_account_id=target.id
            )

        with maker() as check:
            assert len(open_tokens(check, AccountRecoveryToken)) == 1

        rejected = client.post(
            RECOVERY_CONSUME, json={"token": mailed, "newPassword": NEW_PASSWORD}
        )
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"


class TestExpiryUnchanged:
    def test_lifetimes_are_derived_from_the_generation_instant(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        register(client)
        client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS})

        with maker() as check:
            model = open_tokens(check, MagicLinkToken)[0]
            remaining = model.expires_at - now()
            assert timedelta(minutes=14) < remaining <= action_tokens.MAGIC_LINK_LIFETIME


class TestDemoEntryAuthorityDomain:
    """#730: a demo entry proof and an emailed magic link never supersede
    each other, even though both are ``MagicLinkToken`` rows for the same
    ``account_email_id``. Regression coverage that the true concurrent race
    (independent visitors) lives in ``test_demo_entry_concurrency.py``; this
    class isolates the underlying authority-domain rule itself.
    """

    def _email_id(self, session):  # type: ignore[no-untyped-def]
        return session.execute(
            select(AccountEmail.id).where(AccountEmail.email == ADDRESS)
        ).scalar_one()

    def test_a_second_demo_entry_proof_does_not_supersede_the_first(self, cloud_client) -> None:  # type: ignore[no-untyped-def]
        client, maker, _mailbox = cloud_client
        register(client)
        with maker() as session:
            email_id = self._email_id(session)
            _, first = action_tokens.issue_demo_entry_proof(session, email_id)
            session.commit()
        with maker() as session:
            _, second = action_tokens.issue_demo_entry_proof(session, email_id)
            session.commit()

        with maker() as check:
            assert len(open_tokens(check, MagicLinkToken)) == 2

        assert client.post(MAGIC_LINK_CONSUME, json={"token": first.token}).status_code == 201
        assert client.post(MAGIC_LINK_CONSUME, json={"token": second.token}).status_code == 201

    def test_a_normal_magic_link_request_does_not_revoke_an_open_demo_entry_proof(
        self, cloud_client
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        with maker() as session:
            email_id = self._email_id(session)
            _, demo_proof = action_tokens.issue_demo_entry_proof(session, email_id)
            session.commit()

        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        normal_token = mailbox.tokens()[-1]

        assert client.post(MAGIC_LINK_CONSUME, json={"token": demo_proof.token}).status_code == 201
        assert client.post(MAGIC_LINK_CONSUME, json={"token": normal_token}).status_code == 201

    def test_a_demo_entry_proof_does_not_revoke_an_open_normal_magic_link(
        self, cloud_client
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, mailbox = cloud_client
        register(client)
        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        normal_token = mailbox.tokens()[-1]

        with maker() as session:
            email_id = self._email_id(session)
            _, demo_proof = action_tokens.issue_demo_entry_proof(session, email_id)
            session.commit()

        assert client.post(MAGIC_LINK_CONSUME, json={"token": normal_token}).status_code == 201
        assert client.post(MAGIC_LINK_CONSUME, json={"token": demo_proof.token}).status_code == 201

    def test_normal_magic_links_still_supersede_only_each_other_around_a_demo_proof(
        self, cloud_client
    ) -> None:  # type: ignore[no-untyped-def]
        """#724 regression: latest-generation-only still holds for real links,
        undisturbed by an unrelated demo proof issued in between.
        """
        client, maker, mailbox = cloud_client
        register(client)
        with maker() as session:
            email_id = self._email_id(session)
            _, demo_proof = action_tokens.issue_demo_entry_proof(session, email_id)
            session.commit()

        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        first_normal = mailbox.tokens()[-1]
        assert client.post(MAGIC_LINK_REQUEST, json={"email": ADDRESS}).status_code == 202
        second_normal = mailbox.tokens()[-1]

        rejected = client.post(MAGIC_LINK_CONSUME, json={"token": first_normal})
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "ACTION_TOKEN_INVALID"

        assert client.post(MAGIC_LINK_CONSUME, json={"token": demo_proof.token}).status_code == 201
        assert client.post(MAGIC_LINK_CONSUME, json={"token": second_normal}).status_code == 201
