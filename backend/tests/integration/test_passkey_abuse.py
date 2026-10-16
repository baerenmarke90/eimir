"""Database-wide abuse boundary for anonymous passkey authentication starts."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select

from eimir.auth import passkey_abuse, passkeys
from eimir.auth.tokens import hash_token
from eimir.core.errors import RateLimitedError
from eimir.identity.models import RateLimitEvent, WebAuthnChallenge
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

START = "/api/v1/auth/passkeys/authentication/start"


def _count_challenges(session) -> int:  # type: ignore[no-untyped-def]
    return session.execute(select(func.count()).select_from(WebAuthnChallenge)).scalar_one()


def _count_events(session, key: str) -> int:  # type: ignore[no-untyped-def]
    return session.execute(
        select(func.count())
        .select_from(RateLimitEvent)
        .where(
            RateLimitEvent.action == passkey_abuse.ACTION_AUTHENTICATION_START,
            RateLimitEvent.key_hash == hash_token(key.lower()),
        )
    ).scalar_one()


def test_postgresql_threshold_prevents_additional_challenges(session) -> None:  # type: ignore[no-untyped-def]
    """After the last slot, domain logic must not write another challenge."""
    client_host = "198.51.100.10"
    key = passkey_abuse.network_key(client_host)

    for _ in range(passkey_abuse.AUTHENTICATION_START.attempts):
        passkey_abuse.reserve_authentication_start(session, client_host)
        passkeys.start_authentication(session)

    assert _count_challenges(session) == passkey_abuse.AUTHENTICATION_START.attempts
    assert _count_events(session, key) == passkey_abuse.AUTHENTICATION_START.attempts

    with pytest.raises(RateLimitedError):
        passkey_abuse.reserve_authentication_start(session, client_host)

    assert _count_challenges(session) == passkey_abuse.AUTHENTICATION_START.attempts
    assert _count_events(session, key) == passkey_abuse.AUTHENTICATION_START.attempts


def test_limited_network_does_not_block_all_authentication(session) -> None:  # type: ignore[no-untyped-def]
    """The abuse key is per network identity, not a global kill switch."""
    blocked = "198.51.100.10"
    other_network = "198.51.100.11"

    for _ in range(passkey_abuse.AUTHENTICATION_START.attempts):
        passkey_abuse.reserve_authentication_start(session, blocked)
        passkeys.start_authentication(session)

    with pytest.raises(RateLimitedError):
        passkey_abuse.reserve_authentication_start(session, blocked)

    passkey_abuse.reserve_authentication_start(session, other_network)
    passkeys.start_authentication(session)

    assert _count_challenges(session) == passkey_abuse.AUTHENTICATION_START.attempts + 1


def test_parallel_http_burst_does_not_exceed_threshold(production_client) -> None:  # type: ignore[no-untyped-def]
    """Real request units of work share the atomic database-wide remaining capacity."""
    client, maker = production_client
    remaining_capacity = 2
    prefill = passkey_abuse.AUTHENTICATION_START.attempts - remaining_capacity

    for _ in range(prefill):
        response = client.post(START)
        assert response.status_code == 201, response.text

    burst = 5
    start = Barrier(burst)

    def begin(_: int):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.post(START)

    with ThreadPoolExecutor(max_workers=burst) as pool:
        responses = list(pool.map(begin, range(burst)))

    codes = sorted(response.status_code for response in responses)
    assert codes == [201] * remaining_capacity + [429] * (burst - remaining_capacity)
    for response in responses:
        if response.status_code == 429:
            assert response.json()["code"] == "RATE_LIMITED"

    # Starlette TestClient uses "testclient" as the ASGI peer by default. This
    # deliberately follows the same path as production; only the peer label is
    # not an IP address here.
    key = passkey_abuse.network_key("testclient")
    with maker() as committed:
        assert _count_challenges(committed) == passkey_abuse.AUTHENTICATION_START.attempts
        assert _count_events(committed, key) == passkey_abuse.AUTHENTICATION_START.attempts
