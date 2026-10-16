"""Concurrency coverage for public demo entry proofs (#730).

The public demo entry endpoint issues a one-time sign-in proof for a shared
canonical persona (Lea or Alex). Before this fix, every proof was an ordinary
``MagicLinkToken`` and inherited #724's "latest generation wins" supersession:
an unrelated visitor entering the same persona silently revoked the previous
visitor's still-unconsumed proof, purely because both proofs shared the same
``account_email_id``. The Web flow does not consume its proof in the same
request as issuing it, so the window between the two was real and
exploitable by anyone, not just by an unlucky timing accident.

Every case here runs on the real request unit of work with independent
sessions and transactions, the same way #724's own concurrency tests
(``test_action_token_generation.py``) do. A shared-session test could not
show the defect: it never commits, so two "concurrent" visitors would simply
be two statements in one transaction.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

import pytest
from sqlalchemy import select

from eimir.api.v1 import demo as demo_api
from eimir.config import Environment, Settings
from eimir.core.clock import now
from eimir.demo.service import ALEX_NAME, LEA_NAME, create_demo_space
from eimir.identity.models import MagicLinkToken
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-entry-concurrency-password"

DEMO_ENTRY = "/api/v1/demo/entry"
MAGIC_LINK_CONSUME = "/api/v1/auth/magic-link/consume"


def _seed(maker) -> None:  # type: ignore[no-untyped-def]
    with maker() as session:
        create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )
        session.commit()


def _enable_demo_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        demo_api, "get_settings", lambda: Settings.model_validate({"demo_mode": True})
    )


def in_parallel(call, count: int = 2):  # type: ignore[no-untyped-def]
    """Run the same request from independent threads at the same moment."""
    barrier = Barrier(count)

    def attempt(index: int):  # type: ignore[no-untyped-def]
        barrier.wait(timeout=15)
        return call(index)

    with ThreadPoolExecutor(max_workers=count) as pool:
        return list(pool.map(attempt, range(count)))


def consume(client, token: str, *, device: str = "Demo visitor"):  # type: ignore[no-untyped-def]
    return client.post(
        MAGIC_LINK_CONSUME,
        json={"token": token, "deviceName": device, "platform": "web"},
    )


class TestConcurrentDemoEntryForTheSamePersona:
    """Test A / C: two independent visitors, two independent transactions."""

    def test_two_visitors_entering_lea_at_the_same_moment_both_get_a_redeemable_proof(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        _seed(maker)
        _enable_demo_mode(monkeypatch)

        responses = in_parallel(lambda _: client.post(DEMO_ENTRY, json={"persona": "LEA"}))
        assert [response.status_code for response in responses] == [200, 200]
        first_token, second_token = (response.json()["token"] for response in responses)
        assert first_token != second_token

        with maker() as check:
            current_time = now()
            open_count = sum(
                1
                for model in check.execute(select(MagicLinkToken)).scalars().all()
                if model.is_open(current_time)
            )
        assert open_count == 2, "issuing the second proof must not supersede the first"

        first = consume(client, first_token, device="Visitor A")
        assert first.status_code == 201, first.text
        assert first.json()["account"]["displayName"] == LEA_NAME

        second = consume(client, second_token, device="Visitor B")
        assert second.status_code == 201, second.text
        assert second.json()["account"]["displayName"] == LEA_NAME

    def test_visitor_as_proof_survives_visitor_b_requesting_the_same_persona(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """The literal interleaving from the issue.

        Visitor A requests entry and begins navigating away with T1 still
        unconsumed. Visitor B then independently requests entry for the same
        persona before A ever redeems T1. A's proof must still work.
        """
        client, maker = production_client
        _seed(maker)
        _enable_demo_mode(monkeypatch)

        visitor_a = client.post(DEMO_ENTRY, json={"persona": "LEA"})
        assert visitor_a.status_code == 200
        t1 = visitor_a.json()["token"]

        visitor_b = client.post(DEMO_ENTRY, json={"persona": "LEA"})
        assert visitor_b.status_code == 200
        t2 = visitor_b.json()["token"]
        assert t2 != t1

        consumed_a = consume(client, t1, device="Visitor A")
        assert consumed_a.status_code == 201, consumed_a.text

        consumed_b = consume(client, t2, device="Visitor B")
        assert consumed_b.status_code == 201, consumed_b.text


class TestDemoProofIsStillOneTime:
    """Test B: replay protection must survive the concurrency fix."""

    def test_each_concurrently_issued_proof_can_still_be_redeemed_exactly_once(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        _seed(maker)
        _enable_demo_mode(monkeypatch)

        responses = in_parallel(lambda _: client.post(DEMO_ENTRY, json={"persona": "LEA"}))
        first_token, second_token = (response.json()["token"] for response in responses)

        assert consume(client, first_token).status_code == 201
        replay_first = consume(client, first_token)
        assert replay_first.status_code == 422
        assert replay_first.json()["code"] == "ACTION_TOKEN_INVALID"

        assert consume(client, second_token).status_code == 201
        replay_second = consume(client, second_token)
        assert replay_second.status_code == 422
        assert replay_second.json()["code"] == "ACTION_TOKEN_INVALID"


class TestPersonaIsolation:
    """Test F: concurrent issuance across personas must not cross-bind."""

    def test_lea_and_alex_proofs_stay_bound_to_their_own_persona(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        _seed(maker)
        _enable_demo_mode(monkeypatch)

        responses = in_parallel(
            lambda index: client.post(DEMO_ENTRY, json={"persona": "LEA" if index == 0 else "ALEX"})
        )
        lea_token, alex_token = (response.json()["token"] for response in responses)
        assert lea_token != alex_token

        lea_signed_in = consume(client, lea_token)
        assert lea_signed_in.status_code == 201
        assert lea_signed_in.json()["account"]["displayName"] == LEA_NAME

        alex_signed_in = consume(client, alex_token)
        assert alex_signed_in.status_code == 201
        assert alex_signed_in.json()["account"]["displayName"] == ALEX_NAME
