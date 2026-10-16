"""Atomic rate-limit thresholds across the production request lifecycle."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select

from eimir.auth import rate_limit
from eimir.auth.tokens import hash_token
from eimir.identity.models import RateLimitEvent
from tests.conftest import TEST_BOOTSTRAP_TOKEN, requires_database

pytestmark = [pytest.mark.integration, requires_database]

GOOD_PASSWORD = "ein-ausreichend-langes-passwort"


def test_parallel_burst_consumes_exactly_the_remaining_slots(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    """Concurrent requests beyond the remaining budget must not exceed the threshold."""
    client, maker = production_client
    email = "parallel-limit@example.org"

    registration = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Anna",
            "email": email,
            "password": GOOD_PASSWORD,
            "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
        },
    )
    assert registration.status_code == 201

    remaining_capacity = 2
    prefill = rate_limit.SIGN_IN.attempts - remaining_capacity
    for _ in range(prefill):
        response = client.post(
            "/api/v1/auth/sign-in",
            json={"email": email, "password": "falsch-falsch"},
        )
        assert response.status_code == 401

    burst = 5
    start = Barrier(burst)

    def failed_attempt(_: int):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.post(
            "/api/v1/auth/sign-in",
            json={"email": email, "password": "falsch-falsch"},
        )

    with ThreadPoolExecutor(max_workers=burst) as pool:
        responses = list(pool.map(failed_attempt, range(burst)))

    codes = sorted(response.status_code for response in responses)
    expected_codes = [401] * remaining_capacity
    expected_codes.extend([429] * (burst - remaining_capacity))
    assert codes == expected_codes
    for response in responses:
        if response.status_code == 429:
            assert response.json()["code"] == "RATE_LIMITED"
            assert email not in response.text

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
