"""Plan discussion uses the real transaction, target and projection boundaries."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import sleep
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.comments import service as comments
from eimir.comments.models import Comment, CommentTarget
from eimir.core.errors import NotFoundError
from eimir.create_receipts.models import CreateReceipt
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def plan_space(production_client):
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        outsider = make_account(session, "Chris")
        space = make_space(session, anna)
        relationship.add_member(session, space.id, ben)
        other_space = make_space(session, outsider)
        state = {
            "client": client,
            "maker": maker,
            "space": space.id,
            "anna": anna.id,
            "ben": ben.id,
            "other_space": other_space.id,
            "a": sign_in(session, anna),
            "b": sign_in(session, ben),
            "outsider": sign_in(session, outsider),
        }
    base = f"/api/v1/spaces/{state['space']}"
    created = client.post(
        f"{base}/plans", json={"title": "A shared picnic"}, headers=auth(state["a"])
    )
    assert created.status_code == 201
    assert created.json()["capabilities"]["canComment"] is True
    state.update(base=base, plan=created.json()["id"])
    return state


def test_plan_comments_replay_notify_and_enforce_author_and_version(plan_space):
    s = plan_space
    client = s["client"]
    path = f"{s['base']}/plans/{s['plan']}/comments"
    key = str(uuid4())
    headers = {**auth(s["b"]), "Idempotency-Key": key}
    first = client.post(
        path, json={"body": "Bring a blanket. https://example.org/picnic"}, headers=headers
    )
    assert first.status_code == 201
    replay = client.post(path, json={"body": first.json()["body"]}, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    assert client.post(path, json={"body": "Changed intent"}, headers=headers).status_code == 409
    assert len(client.get(path, headers=auth(s["a"])).json()["items"]) == 1
    detail = f"{s['base']}/comments/{first.json()['id']}"
    assert (
        client.patch(
            detail, json={"body": "Other author"}, headers={**auth(s["a"]), "If-Match": '"1"'}
        ).status_code
        == 403
    )
    updated = client.patch(
        detail, json={"body": "Bring two blankets."}, headers={**auth(s["b"]), "If-Match": '"1"'}
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2
    assert client.delete(detail, headers={**auth(s["b"]), "If-Match": '"1"'}).status_code == 409
    with s["maker"].begin() as session:
        event = session.execute(
            select(OutboxEvent).where(OutboxEvent.subject_id == UUID(first.json()["id"]))
        ).scalar_one()
        assert event.payload.target_type == "PLAN"
        assert event.payload.target_id == UUID(s["plan"])
        assert "blanket" not in repr(event.payload.model_dump())
        engagement.project_event(session, event)
        engagement.project_event(session, event)
        notifications = (
            session.execute(select(Notification).where(Notification.source_event_id == event.id))
            .scalars()
            .all()
        )
        assert len(notifications) == 1
        assert notifications[0].target_type == "PLAN"
        assert notifications[0].recipient_account_id == s["anna"]
    assert client.delete(detail, headers={**auth(s["b"]), "If-Match": '"2"'}).status_code == 204


def test_unavailable_foreign_and_missing_plan_cannot_leave_a_comment_or_receipt(plan_space):
    s = plan_space
    client = s["client"]
    for path, token in [
        (f"/api/v1/spaces/{s['other_space']}/plans/{s['plan']}/comments", s["outsider"]),
        (f"{s['base']}/plans/{uuid4()}/comments", s["b"]),
        (f"{s['base']}/plans/not-an-id/comments", s["b"]),
    ]:
        assert client.get(path, headers=auth(token)).status_code == 404
        rejected = client.post(
            path,
            json={"body": "Never retained"},
            headers={**auth(token), "Idempotency-Key": str(uuid4())},
        )
        assert rejected.status_code == 404
    assert client.get(f"{s['base']}/plans/{s['plan']}/comments").status_code == 401
    with s["maker"]() as session:
        assert session.execute(select(Comment)).scalars().all() == []
        assert (
            session.execute(select(CreateReceipt).where(CreateReceipt.resource_type == "COMMENT"))
            .scalars()
            .all()
            == []
        )


@pytest.mark.parametrize("lifecycle", ["DELETE", "RETURN_TO_WISH"])
def test_plan_removal_cleans_comments_in_the_same_commit(plan_space, lifecycle):
    s = plan_space
    client = s["client"]
    plan_id = s["plan"]
    if lifecycle == "RETURN_TO_WISH":
        wish = client.post(
            f"{s['base']}/wishes", json={"title": "A picnic idea"}, headers=auth(s["a"])
        ).json()
        converted = client.post(
            f"{s['base']}/wishes/{wish['id']}/plan",
            json={},
            headers={**auth(s["a"]), "If-Match": '"1"'},
        )
        assert converted.status_code == 201
        plan_id = converted.json()["plan"]["id"]
    path = f"{s['base']}/plans/{plan_id}/comments"
    created = client.post(path, json={"body": "A dependent comment"}, headers=auth(s["b"]))
    assert created.status_code == 201
    if lifecycle == "DELETE":
        removed = client.delete(
            f"{s['base']}/plans/{plan_id}", headers={**auth(s["a"]), "If-Match": '"1"'}
        )
        assert removed.status_code == 204
    else:
        removed = client.post(
            f"{s['base']}/plans/{plan_id}/return-to-wish",
            headers={**auth(s["a"]), "If-Match": '"1"'},
        )
        assert removed.status_code == 200
    assert client.get(path, headers=auth(s["a"])).status_code == 404
    with s["maker"]() as session:
        assert session.get(Comment, UUID(created.json()["id"])) is None


def test_plan_delete_serializes_against_comment_create(plan_space):
    s = plan_space
    maker = s["maker"]
    context = AuthorizationContext(account_id=s["ben"], space_id=s["space"])
    started = Event()

    def create():
        started.set()
        try:
            with maker.begin() as session:
                comments.create_comment(
                    session,
                    context,
                    target_type=CommentTarget.PLAN,
                    target_id=s["plan"],
                    body="Must not outlive its Plan",
                )
        except NotFoundError as error:
            return error.code
        return "CREATED"

    blocker = maker()
    transaction = blocker.begin()
    parent = blocker.execute(
        select(Plan).where(Plan.id == UUID(s["plan"])).with_for_update()
    ).scalar_one()
    blocker.delete(parent)
    blocker.flush()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(create)
            assert started.wait(timeout=2)
            sleep(0.2)
            assert not future.done()
            transaction.commit()
            assert future.result(timeout=5) == "COMMENT_TARGET_NOT_AVAILABLE"
    finally:
        if transaction.is_active:
            transaction.rollback()
        blocker.close()
    with maker() as session:
        assert (
            session.execute(select(Comment).where(Comment.target_id == UUID(s["plan"])))
            .scalars()
            .all()
            == []
        )


def test_link_preview_requires_current_membership_and_keeps_only_ephemeral_metadata(
    plan_space, monkeypatch
):
    from unittest.mock import Mock

    from eimir.api.v1 import link_previews

    resolver = Mock(return_value=None)
    monkeypatch.setattr(link_previews, "resolve_link_metadata", resolver)
    s = plan_space
    path = f"{s['base']}/link-preview"
    body = {"url": "https://example.org/park"}
    assert s["client"].post(path, json=body).status_code == 401
    assert s["client"].post(path, json=body, headers=auth(s["outsider"])).status_code == 404
    assert (
        s["client"]
        .post(path, json={**body, "description": "Never sent"}, headers=auth(s["a"]))
        .status_code
        == 422
    )
    resolver.assert_not_called()
    result = s["client"].post(path, json=body, headers=auth(s["a"]))
    assert result.status_code == 200
    assert result.headers["Cache-Control"] == "private, no-store"
    assert result.json() == {"available": False, "title": None, "description": None}
    resolver.assert_called_once_with(body["url"])
