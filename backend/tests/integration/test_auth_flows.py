"Registration, sign-in, and abuse protection through the endpoints."

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth import passwords, rate_limit
from eimir.auth.tokens import hash_token
from eimir.identity.models import (
    Account,
    DeviceSession,
    InstanceBootstrapState,
    RateLimitEvent,
)
from tests.conftest import (
    TEST_BOOTSTRAP_TOKEN,
    auth,
    make_account,
    make_space,
    requires_database,
    sign_in,
)

pytestmark = [pytest.mark.integration, requires_database]

GOOD_PASSWORD = "ein-ausreichend-langes-passwort"


class TestRegistration:
    def test_first_account_requires_bootstrap_proof(self, client, session) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "Anna@Example.ORG",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert response.status_code == 201
        assert response.json()["tokens"]["accessToken"]

    def test_first_account_without_bootstrap_proof_is_rejected(self, client, session) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Fremd",
                "email": "fremd@example.org",
                "password": GOOD_PASSWORD,
            },
        )
        assert response.status_code == 403
        assert response.json()["code"] == "BOOTSTRAP_INVALID"
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 0

    def test_wrong_bootstrap_proof_is_not_returned(self, client, session) -> None:  # type: ignore[no-untyped-def]
        secret = "falscher-bootstrap-nachweis-mit-genuegend-laenge"
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Fremd",
                "email": "fremd@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": secret,
            },
        )
        assert response.status_code == 403
        assert response.json()["code"] == "BOOTSTRAP_INVALID"
        assert secret not in response.text
        assert session.execute(select(func.count()).select_from(Account)).scalar_one() == 0

    def test_second_account_requires_invitation(self, client, session) -> None:  # type: ignore[no-untyped-def]
        "Otherwise anyone who can reach a private instance could create an account."
        make_account(session, "Vorhanden")
        session.flush()

        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Fremd",
                "email": "fremd@example.org",
                "password": GOOD_PASSWORD,
            },
        )
        assert response.status_code == 403
        assert response.json()["code"] == "REGISTRATION_REQUIRES_INVITATION"

    def test_registration_with_invitation_succeeds(self, client, session) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        space = make_space(session, anna)
        anna_token = sign_in(session, anna)
        session.flush()

        invitation = client.post(
            f"/api/v1/spaces/{space.id}/invitations", headers=auth(anna_token)
        ).json()

        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Ben",
                "email": "ben@example.org",
                "password": GOOD_PASSWORD,
                "invitationToken": invitation["token"],
            },
        )
        assert response.status_code == 201

        ben_token = response.json()["tokens"]["accessToken"]
        assert client.get(f"/api/v1/spaces/{space.id}", headers=auth(ben_token)).status_code == 200

    def test_email_address_is_stored_lowercase(self, client, session) -> None:  # type: ignore[no-untyped-def]
        client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "  Anna@Example.ORG ",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        response = client.post(
            "/api/v1/auth/sign-in",
            json={"email": "anna@example.org", "password": GOOD_PASSWORD},
        )
        assert response.status_code == 200

    @pytest.mark.parametrize("short", ["", "kurz", "elfzeichen"])
    def test_too_short_password_is_rejected(self, client, short: str) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "a@example.org",
                "password": short,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PASSWORD_TOO_SHORT"

    @pytest.mark.parametrize("malformed", ["", "keine-adresse", "a@b", "@example.org", "a@.de"])
    def test_malformed_address_is_rejected(self, client, malformed: str) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": malformed,
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert response.status_code == 422

    def test_no_account_without_valid_password(self, client, session) -> None:  # type: ignore[no-untyped-def]
        "Otherwise an account could survive a failed registration."
        from eimir.identity import service as accounts

        client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "a@example.org",
                "password": "kurz",
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert accounts.find_by_email(session, "a@example.org") is None


class TestSignIn:
    @pytest.fixture
    def signed_in(self, client, session):  # type: ignore[no-untyped-def]
        client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        return "anna@example.org"

    def test_valid_credentials(self, client, signed_in) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/sign-in",
            json={"email": signed_in, "password": GOOD_PASSWORD},
        )
        assert response.status_code == 200
        assert response.json()["account"]["displayName"] == "Anna"

    def test_wrong_password(self, client, signed_in) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/sign-in",
            json={"email": signed_in, "password": "etwas-ganz-anderes"},
        )
        assert response.status_code == 401
        assert response.json()["code"] == "INVALID_CREDENTIALS"

    def test_unknown_address_and_wrong_password_are_indistinguishable(
        self, client, signed_in
    ) -> None:  # type: ignore[no-untyped-def]
        "A difference would enable account enumeration."
        wrong = client.post(
            "/api/v1/auth/sign-in",
            json={"email": signed_in, "password": "etwas-ganz-anderes"},
        )
        unknown = client.post(
            "/api/v1/auth/sign-in",
            json={"email": "gibt-es-nicht@example.org", "password": GOOD_PASSWORD},
        )
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()

    def test_disabled_account_cannot_sign_in(self, client, session, signed_in) -> None:  # type: ignore[no-untyped-def]
        from eimir.core.clock import now
        from eimir.identity import service as accounts

        account = accounts.find_by_email(session, signed_in)
        assert account is not None
        account.disabled_at = now()
        session.flush()

        response = client.post(
            "/api/v1/auth/sign-in",
            json={"email": signed_in, "password": GOOD_PASSWORD},
        )
        assert response.status_code == 401


class TestSessionManagement:
    @pytest.fixture
    def session_data(self, client):  # type: ignore[no-untyped-def]
        return client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        ).json()

    def test_me_returns_account(self, client, session_data) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            "/api/v1/auth/me", headers=auth(session_data["tokens"]["accessToken"])
        )
        assert response.status_code == 200
        assert set(response.json()) == {"id", "displayName"}

    def test_refresh_rotates(self, client, session_data) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": session_data["tokens"]["refreshToken"]},
        )
        assert response.status_code == 200
        assert response.json()["refreshToken"] != session_data["tokens"]["refreshToken"]

    def test_logout_invalidates_token(self, client, session_data) -> None:  # type: ignore[no-untyped-def]
        headers = auth(session_data["tokens"]["accessToken"])
        assert client.post("/api/v1/auth/sign-out", headers=headers).status_code == 204
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401

    def test_password_change_ends_all_sessions(self, client, session_data) -> None:  # type: ignore[no-untyped-def]
        "A password change often indicates suspected unauthorized access."
        headers = auth(session_data["tokens"]["accessToken"])
        response = client.post(
            "/api/v1/auth/password",
            json={
                "currentPassword": GOOD_PASSWORD,
                "newPassword": "ein-ganz-neues-langes-passwort",
            },
            headers=headers,
        )
        assert response.status_code == 204
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401

    def test_password_change_requires_old_password(self, client, session_data) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            "/api/v1/auth/password",
            json={
                "currentPassword": "falsch-falsch-falsch",
                "newPassword": "ein-ganz-neues-langes-passwort",
            },
            headers=auth(session_data["tokens"]["accessToken"]),
        )
        assert response.status_code == 401


class TestRateLimiting:
    def test_too_many_attempts_are_rejected(self, client, session) -> None:  # type: ignore[no-untyped-def]
        client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )

        codes = []
        for _ in range(rate_limit.SIGN_IN.attempts + 2):
            codes.append(
                client.post(
                    "/api/v1/auth/sign-in",
                    json={"email": "anna@example.org", "password": "falsch-falsch"},
                ).status_code
            )

        assert 401 in codes
        assert codes[-1] == 429

    def test_tight_loop_of_successful_rotations_is_throttled(self, client, session) -> None:  # type: ignore[no-untyped-def]
        "The successful path has a budget because every rotation writes history."
        signed_in = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        ).json()

        token = signed_in["tokens"]["refreshToken"]
        for _ in range(rate_limit.REFRESH.attempts):
            response = client.post("/api/v1/auth/refresh", json={"refreshToken": token})
            assert response.status_code == 200
            token = response.json()["refreshToken"]

        throttled = client.post("/api/v1/auth/refresh", json={"refreshToken": token})
        assert throttled.status_code == 429
        assert throttled.json()["code"] == "RATE_LIMITED"

    def test_unknown_refresh_token_remains_401(self, client, session) -> None:  # type: ignore[no-untyped-def]
        "The rate limit must not reveal that a session exists."
        signed_in = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        ).json()

        token = signed_in["tokens"]["refreshToken"]
        for _ in range(rate_limit.REFRESH.attempts):
            token = client.post("/api/v1/auth/refresh", json={"refreshToken": token}).json()[
                "refreshToken"
            ]

        foreign = client.post("/api/v1/auth/refresh", json={"refreshToken": "nicht-von-hier"})
        assert foreign.status_code == 401
        assert foreign.json()["code"] == "AUTHENTICATION_REQUIRED"

    def test_successful_sign_in_cleans_up_counter(self, client, session) -> None:  # type: ignore[no-untyped-def]
        "Otherwise typos would lock out the legitimate user."
        client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        for _ in range(5):
            client.post(
                "/api/v1/auth/sign-in",
                json={"email": "anna@example.org", "password": "falsch"},
            )

        assert (
            client.post(
                "/api/v1/auth/sign-in",
                json={"email": "anna@example.org", "password": GOOD_PASSWORD},
            ).status_code
            == 200
        )
        for _ in range(5):
            assert (
                client.post(
                    "/api/v1/auth/sign-in",
                    json={"email": "anna@example.org", "password": "falsch"},
                ).status_code
                == 401
            )

    def test_key_is_stored_only_hashed(self, session: Session) -> None:
        "The limiter needs less information than the original sign-in key."
        rate_limit.record_attempt(session, "sign_in", "anna@example.org")
        session.flush()

        rows = session.execute(select(RateLimitEvent)).scalars().all()
        assert rows
        for row in rows:
            assert "anna@example.org" not in row.key_hash


class TestProductionTransactionBoundary:
    def test_bootstrap_proof_is_permanently_consumed_after_success(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        first = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert first.status_code == 201

        reuse_response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Fremd",
                "email": "fremd@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert reuse_response.status_code == 403
        assert reuse_response.json()["code"] == "REGISTRATION_REQUIRES_INVITATION"

        with maker() as committed:
            assert committed.execute(select(func.count()).select_from(Account)).scalar_one() == 1
            state = committed.get(InstanceBootstrapState, 1)
            assert state is not None
            assert state.completed_at is not None

    def test_parallel_bootstrap_has_exactly_one_owner(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        start = Barrier(2)

        def register(index: int):  # type: ignore[no-untyped-def]
            start.wait(timeout=5)
            return client.post(
                "/api/v1/auth/register",
                json={
                    "displayName": f"Owner {index}",
                    "email": f"owner{index}@example.org",
                    "password": GOOD_PASSWORD,
                    "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
                },
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(register, range(2)))

        assert sorted(response.status_code for response in responses) == [201, 403]
        rejected = next(response for response in responses if response.status_code == 403)
        assert rejected.json()["code"] == "REGISTRATION_REQUIRES_INVITATION"

        with maker() as committed:
            assert committed.execute(select(func.count()).select_from(Account)).scalar_one() == 1
            state = committed.get(InstanceBootstrapState, 1)
            assert state is not None
            assert state.completed_at is not None

    def test_failed_attempts_persist_after_rejected_requests(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        email = "anna@example.org"
        assert (
            client.post(
                "/api/v1/auth/register",
                json={
                    "displayName": "Anna",
                    "email": email,
                    "password": GOOD_PASSWORD,
                    "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
                },
            ).status_code
            == 201
        )

        for _ in range(rate_limit.SIGN_IN.attempts):
            response = client.post(
                "/api/v1/auth/sign-in",
                json={"email": email, "password": "falsch-falsch"},
            )
            assert response.status_code == 401

        throttled = client.post(
            "/api/v1/auth/sign-in",
            json={"email": email, "password": "falsch-falsch"},
        )
        assert throttled.status_code == 429
        assert throttled.json()["code"] == "RATE_LIMITED"

        with maker() as committed:
            attempts = committed.execute(
                select(func.count())
                .select_from(RateLimitEvent)
                .where(
                    RateLimitEvent.action == "sign_in",
                    RateLimitEvent.key_hash == hash_token(email),
                )
            ).scalar_one()
        assert attempts == rate_limit.SIGN_IN.attempts

    def test_parallel_failed_attempts_do_not_lose_counter(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        email = "parallel@example.org"
        assert (
            client.post(
                "/api/v1/auth/register",
                json={
                    "displayName": "Anna",
                    "email": email,
                    "password": GOOD_PASSWORD,
                    "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
                },
            ).status_code
            == 201
        )

        def failed_attempt(_: int) -> int:
            return client.post(
                "/api/v1/auth/sign-in",
                json={"email": email, "password": "falsch-falsch"},
            ).status_code

        count = 5
        with ThreadPoolExecutor(max_workers=count) as pool:
            codes = list(pool.map(failed_attempt, range(count)))

        assert codes == [401] * count
        with maker() as committed:
            attempts = committed.execute(
                select(func.count())
                .select_from(RateLimitEvent)
                .where(
                    RateLimitEvent.action == "sign_in",
                    RateLimitEvent.key_hash == hash_token(email),
                )
            ).scalar_one()
        assert attempts == count

    def test_refresh_replay_revokes_session_permanently(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        registration = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert registration.status_code == 201
        old_refresh = registration.json()["tokens"]["refreshToken"]

        rotation = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": old_refresh},
        )
        assert rotation.status_code == 200
        new_tokens = rotation.json()

        replay = client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": old_refresh},
        )
        assert replay.status_code == 401
        assert replay.json()["code"] == "AUTHENTICATION_REQUIRED"
        assert old_refresh not in replay.text

        assert (
            client.get(
                "/api/v1/auth/me",
                headers=auth(new_tokens["accessToken"]),
            ).status_code
            == 401
        )
        with maker() as committed:
            device_session = committed.execute(select(DeviceSession)).scalar_one()
            assert device_session.revoked_at is not None
            assert device_session.access_token_hash is None

    def test_replay_of_oldest_generation_revokes_permanently(self, production_client) -> None:  # type: ignore[no-untyped-def]
        """T0 -> T1 -> T2, then replay T0 through HTTP.

        The production lifecycle rolls back the request because it returns 401.
        The revocation must outlive that rollback or the compromised session
        would remain open.
        """
        client, maker = production_client
        registration = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert registration.status_code == 201
        t0 = registration.json()["tokens"]["refreshToken"]

        first = client.post("/api/v1/auth/refresh", json={"refreshToken": t0})
        assert first.status_code == 200
        t1 = first.json()["refreshToken"]

        second = client.post("/api/v1/auth/refresh", json={"refreshToken": t1})
        assert second.status_code == 200
        t2 = second.json()

        replay = client.post("/api/v1/auth/refresh", json={"refreshToken": t0})
        assert replay.status_code == 401
        assert replay.json()["code"] == "AUTHENTICATION_REQUIRED"
        assert t0 not in replay.text

        assert client.get("/api/v1/auth/me", headers=auth(t2["accessToken"])).status_code == 401
        assert (
            client.post(
                "/api/v1/auth/refresh", json={"refreshToken": t2["refreshToken"]}
            ).status_code
            == 401
        )
        with maker() as committed:
            device_session = committed.execute(select(DeviceSession)).scalar_one()
            assert device_session.revoked_at is not None
            assert device_session.access_token_hash is None

    def test_replay_of_middle_generation_revokes_permanently(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        registration = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert registration.status_code == 201
        t0 = registration.json()["tokens"]["refreshToken"]

        t1 = client.post("/api/v1/auth/refresh", json={"refreshToken": t0}).json()["refreshToken"]
        t2 = client.post("/api/v1/auth/refresh", json={"refreshToken": t1}).json()

        replay = client.post("/api/v1/auth/refresh", json={"refreshToken": t1})
        assert replay.status_code == 401
        assert t1 not in replay.text

        assert client.get("/api/v1/auth/me", headers=auth(t2["accessToken"])).status_code == 401
        with maker() as committed:
            device_session = committed.execute(select(DeviceSession)).scalar_one()
            assert device_session.revoked_at is not None

    def test_unknown_refresh_token_revokes_no_session(self, production_client) -> None:  # type: ignore[no-untyped-def]
        "Otherwise arbitrary garbage could revoke another session."
        client, maker = production_client
        registration = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert registration.status_code == 201
        tokens = registration.json()["tokens"]

        rejected = client.post("/api/v1/auth/refresh", json={"refreshToken": "gibt-es-nicht"})
        assert rejected.status_code == 401

        assert client.get("/api/v1/auth/me", headers=auth(tokens["accessToken"])).status_code == 200
        with maker() as committed:
            device_session = committed.execute(select(DeviceSession)).scalar_one()
            assert device_session.revoked_at is None

    def test_parallel_refresh_rotation_has_exactly_one_winner(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        registration = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert registration.status_code == 201
        refresh_token = registration.json()["tokens"]["refreshToken"]
        start = Barrier(2)

        def rotation(_: int):  # type: ignore[no-untyped-def]
            start.wait(timeout=5)
            return client.post(
                "/api/v1/auth/refresh",
                json={"refreshToken": refresh_token},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(rotation, range(2)))

        assert sorted(response.status_code for response in responses) == [200, 401]
        successful = next(response for response in responses if response.status_code == 200)
        replay = next(response for response in responses if response.status_code == 401)
        assert replay.json()["code"] == "AUTHENTICATION_REQUIRED"
        assert refresh_token not in replay.text

        new_tokens = successful.json()
        assert new_tokens["refreshToken"] != refresh_token
        assert (
            client.get(
                "/api/v1/auth/me",
                headers=auth(new_tokens["accessToken"]),
            ).status_code
            == 401
        )
        with maker() as committed:
            device_session = committed.execute(select(DeviceSession)).scalar_one()
            assert device_session.revoked_at is not None
            assert device_session.access_token_hash is None


class TestPasswordHashing:
    def test_hash_does_not_expose_password(self) -> None:
        hashed = passwords.hash_password(GOOD_PASSWORD)
        assert GOOD_PASSWORD not in hashed

    def test_equal_passwords_produce_different_hashes(self) -> None:
        "Argon2 salts prevent equal passwords from being recognizable by their hashes."
        assert passwords.hash_password(GOOD_PASSWORD) != passwords.hash_password(GOOD_PASSWORD)

    def test_check_matches(self) -> None:
        hashed = passwords.hash_password(GOOD_PASSWORD)
        assert passwords.verify_password(hashed, GOOD_PASSWORD)
        assert not passwords.verify_password(hashed, "etwas-anderes")

    def test_malformed_hash_does_not_raise(self) -> None:
        assert not passwords.verify_password("kein-hash", GOOD_PASSWORD)
