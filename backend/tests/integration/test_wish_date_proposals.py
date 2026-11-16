"""Real HTTP and PostgreSQL coverage for proposing an appointment from a Wish."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.domain.events import EventType
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from eimir.wishes import date_proposals
from eimir.wishes import service as wishes
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SOURCE = "Ideas for together\n\nhttps://example.org/stadium-tour"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    sender = make_account(session, "Lea")
    receiver = make_account(session, "Alex")
    outsider = make_account(session, "Another account")
    space = make_space(session, sender)
    relationship.add_member(session, space.id, receiver)
    context = AuthorizationContext(sender.id, space.id)
    wish = wishes.create_wish(
        session, context, title="Stadium tour", description=SOURCE, tags=["Sport"]
    )
    wish_path = f"/api/v1/spaces/{space.id}/wishes/{wish.id}"
    return (
        wish_path,
        auth(sign_in(session, sender)),
        auth(sign_in(session, receiver)),
        auth(sign_in(session, outsider)),
    )


def _body(days: int = 3) -> dict[str, str]:
    return {
        "clientRequestId": str(uuid4()),
        "plannedStart": (clock.now() + timedelta(days=days)).isoformat(),
    }


def test_counterproposal_then_accept_reuses_linked_plan(client, session, couple):  # type: ignore[no-untyped-def]
    wish_path, sender, receiver, outsider = couple
    route = f"{wish_path}/date-proposal"
    assert client.get(route, headers=outsider).status_code == 404
    initial = client.get(route, headers=sender)
    assert initial.json() == {"canPropose": True, "proposal": None}
    assert initial.headers["cache-control"] == "private, no-store"

    body = _body()
    created = client.post(route, headers=sender, json=body)
    assert created.status_code == 200, created.text
    proposal = created.json()["proposal"]
    assert not proposal["counter"]
    assert client.post(route, headers=sender, json=body).json()["proposal"] == proposal
    assert client.get(route, headers=receiver).json()["proposal"] == proposal

    original = f"{route}/{proposal['id']}"
    assert client.post(f"{original}/accept", headers=sender).status_code == 409
    assert client.post(f"{original}/accept", headers=outsider).status_code == 404
    unchanged = {**body, "clientRequestId": str(uuid4())}
    assert client.post(f"{original}/counter", headers=receiver, json=unchanged).status_code == 422

    counter_body = _body(4)
    countered = client.post(f"{original}/counter", headers=receiver, json=counter_body)
    assert countered.status_code == 200, countered.text
    counter = countered.json()["proposal"]
    assert counter["id"] != proposal["id"]
    assert counter["counter"]
    assert counter["recipientId"] == proposal["proposedBy"]
    assert (
        client.post(f"{original}/counter", headers=receiver, json=counter_body).json()["proposal"]
        == counter
    )
    assert client.post(f"{original}/accept", headers=receiver).status_code == 409

    accept_route = f"{route}/{counter['id']}/accept"
    accepted = client.post(accept_route, headers=sender)
    assert accepted.status_code == 200, accepted.text
    plan_id = accepted.json()["planId"]
    assert client.post(accept_route, headers=sender).json() == {"planId": plan_id}
    assert client.get(route, headers=receiver).json() == {"canPropose": False, "proposal": None}

    plan = session.scalars(select(Plan)).one()
    assert str(plan.id) == plan_id
    assert str(plan.source_wish_id) == wish_path.split("/")[-1]
    assert plan.status == "PLANNED"
    assert plan.planned_start is not None
    assert plan.planned_start.isoformat() == counter_body["plannedStart"]
    assert plan.payload.description == SOURCE
    assert plan.payload.title == "Stadium tour"
    assert plan.payload.tags == ["Sport"]

    events = session.scalars(
        select(OutboxEvent).where(
            OutboxEvent.event_type.in_(
                [
                    EventType.WISH_DATE_PROPOSED.value,
                    EventType.WISH_DATE_COUNTERED.value,
                    EventType.WISH_DATE_ACCEPTED.value,
                    EventType.PLAN_CREATED.value,
                ]
            )
        )
    ).all()
    by_kind = {event.event_type: event for event in events}
    assert len(events) == len(by_kind) == 4
    acceptance = by_kind[EventType.WISH_DATE_ACCEPTED.value]
    assert acceptance.subject_id == plan.id
    assert str(acceptance.payload.occurrence_id) == counter["id"]
    assert str(acceptance.payload.recipient_id) == counter["proposedBy"]
    assert by_kind[EventType.PLAN_CREATED.value].payload.recipient_id is None
    assert SOURCE not in acceptance.payload.model_dump_json()


@pytest.mark.parametrize("action", ["decline", "withdraw"])
def test_closed_proposal_cannot_be_revived_by_retry(client, couple, action):  # type: ignore[no-untyped-def]
    wish_path, sender, receiver, _ = couple
    route = f"{wish_path}/date-proposal"
    body = _body()
    proposal_id = client.post(route, headers=sender, json=body).json()["proposal"]["id"]
    close = f"{route}/{proposal_id}/{action}"
    actor, wrong_actor = (receiver, sender) if action == "decline" else (sender, receiver)
    assert client.post(close, headers=wrong_actor).status_code == 409
    assert client.post(close, headers=actor).status_code == 204
    assert client.post(route, headers=sender, json=body).status_code == 409
    assert client.get(route, headers=receiver).json() == {"canPropose": True, "proposal": None}
    assert client.get(wish_path, headers=sender).json()["status"] == "OPEN"


def test_direct_wish_completion_clears_pending_proposal(client, session, couple):  # type: ignore[no-untyped-def]
    wish_path, sender, receiver, _ = couple
    route = f"{wish_path}/date-proposal"
    proposal_id = client.post(route, headers=sender, json=_body()).json()["proposal"]["id"]
    wish = client.get(wish_path, headers=sender)
    completed = client.post(
        f"{wish_path}/complete",
        headers={**sender, "If-Match": wish.headers["etag"]},
    )
    assert completed.status_code == 200, completed.text
    assert client.get(route, headers=receiver).json() == {"canPropose": False, "proposal": None}
    assert client.post(f"{route}/{proposal_id}/accept", headers=receiver).status_code == 409
    assert session.scalar(select(func.count()).select_from(Plan)) == 0


def test_parallel_acceptance_yields_one_canonical_plan(production_client):  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker.begin() as setup:
        sender = make_account(setup, "Lea")
        receiver = make_account(setup, "Alex")
        space = make_space(setup, sender)
        relationship.add_member(setup, space.id, receiver)
        outgoing = AuthorizationContext(sender.id, space.id)
        incoming = AuthorizationContext(receiver.id, space.id)
        wish_id = str(wishes.create_wish(setup, outgoing, title="Together").id)
        state = date_proposals.propose(
            setup,
            outgoing,
            wish_id,
            planned_start=clock.now() + timedelta(days=2),
            client_request_id=uuid4(),
        )
        assert state.proposal is not None
        proposal_id = state.proposal.id
    barrier = Barrier(2)

    def accept(_index: int):  # type: ignore[no-untyped-def]
        barrier.wait(timeout=10)
        with maker.begin() as session:
            return date_proposals.accept(session, incoming, wish_id, proposal_id)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(accept, [0, 1]))
    assert results[0] == results[1]
    with maker() as session:
        assert session.scalar(select(func.count()).select_from(Plan)) == 1
