"""Discreet Plans (#1790 F3): a shared visual shield, never a permission."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.dashboard import service as dashboard_service
from eimir.engagement import presentation, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, Notification
from eimir.outbox.models import OutboxEvent
from eimir.plans import discreet
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_related_person_attachments import ready_attachment

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 11, 13, 12, tzinfo=UTC)
TITLE = "Hotel night just for us"
DESCRIPTION = "Lake view room, sauna at seven"


@pytest.fixture
def couple(session: Session, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outside")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outside": sign_in(session, outsider),
    }


def path(couple, suffix="plans"):  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/{suffix}"


def create(client, couple, **extra):  # type: ignore[no-untyped-def]
    start = (NOW + timedelta(days=8)).replace(hour=18)
    response = client.post(
        path(couple),
        headers={**auth(couple["token_a"]), "Idempotency-Key": str(uuid4())},
        json={
            "title": TITLE,
            "description": DESCRIPTION,
            "schedule": {
                "plannedStart": start.isoformat(),
                "plannedEnd": (start + timedelta(hours=17)).isoformat(),
            },
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def patch(client, couple, plan, token="token_a", **fields):  # type: ignore[no-untyped-def]
    return client.patch(
        f"{path(couple)}/{plan['id']}",
        headers={**auth(couple[token]), "If-Match": str(plan["version"])},
        json=fields,
    )


def make_discreet(client, couple, plan, **fields):  # type: ignore[no-untyped-def]
    response = patch(
        client,
        couple,
        plan,
        discreet=True,
        discreetTitleMode="PREVIEW",
        previewTitle="Weekend for two",
        **fields,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_existing_plans_stay_unchanged_and_both_partners_keep_full_access(client, couple):  # type: ignore[no-untyped-def]
    plan = create(client, couple)
    assert plan["discreet"] is False
    assert plan["discreetTitleMode"] == "PREVIEW"
    assert plan["previewTitle"] is None

    updated = make_discreet(client, couple, plan)
    assert updated["discreet"] is True
    assert updated["previewTitle"] == "Weekend for two"

    # Authorization is unchanged: the partner reads every field of the detail.
    partner = client.get(f"{path(couple)}/{plan['id']}", headers=auth(couple["token_b"]))
    assert partner.status_code == 200
    assert partner.json()["title"] == TITLE
    assert partner.json()["description"] == DESCRIPTION
    assert partner.json()["discreet"] is True

    # Either partner may change the title mode or clear the flag.
    original = patch(client, couple, partner.json(), "token_b", discreetTitleMode="ORIGINAL")
    assert original.status_code == 200, original.text
    assert original.json()["discreetTitleMode"] == "ORIGINAL"
    cleared = patch(client, couple, original.json(), "token_b", discreet=False)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["discreet"] is False
    # The choice survives so re-enabling restores it.
    assert cleared.json()["discreetTitleMode"] == "ORIGINAL"
    assert cleared.json()["previewTitle"] == "Weekend for two"

    outsider = client.get(f"{path(couple)}/{plan['id']}", headers=auth(couple["token_outside"]))
    assert outsider.status_code == 404


def test_preview_title_is_protected_content_and_blank_falls_back(client, couple, session):  # type: ignore[no-untyped-def]
    plan = make_discreet(client, couple, create(client, couple))
    row = session.get(Plan, UUID(plan["id"]))
    assert row is not None and row.payload.preview_title == "Weekend for two"
    columns = session.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name = 'plans'")
    ).scalars()
    assert "preview_title" not in set(columns)

    blank = patch(client, couple, plan, previewTitle="   ")
    assert blank.status_code == 200, blank.text
    assert blank.json()["previewTitle"] is None
    session.refresh(row)
    assert discreet.list_title(row) is None


@pytest.mark.parametrize(
    "fields",
    [
        {"discreet": None},
        {"discreetTitleMode": None},
        {"discreetTitleMode": "HIDDEN"},
        {"discreet": "yes"},
        {"previewTitle": "x" * 201},
    ],
)
def test_invalid_discreet_updates_are_rejected(client, couple, fields):  # type: ignore[no-untyped-def]
    plan = create(client, couple)
    assert patch(client, couple, plan, **fields).status_code == 422


def test_search_matches_real_content_but_displays_only_the_list_title(client, couple):  # type: ignore[no-untyped-def]
    plan = make_discreet(client, couple, create(client, couple))

    def search(query):  # type: ignore[no-untyped-def]
        response = client.get(
            path(couple, "search"),
            params={"q": query, "type": "PLAN"},
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 200, response.text
        return response.json()["items"]

    for query in ("Hotel", "sauna"):
        [hit] = search(query)
        assert hit["id"] == plan["id"]
        assert hit["title"] == "Weekend for two"
        assert hit["excerpt"] is None
        assert hit["concealed"] is True
    assert search("Weekend") == []

    original = patch(client, couple, plan, discreetTitleMode="ORIGINAL").json()
    [hit] = search("Hotel")
    assert hit["title"] == TITLE and hit["excerpt"] is None and hit["concealed"] is True

    patch(client, couple, original, discreet=False)
    [hit] = search("Hotel")
    assert hit["title"] == TITLE and hit["excerpt"] == DESCRIPTION and hit["concealed"] is False


def test_wir_upcoming_and_countdown_show_only_the_list_title(client, couple):  # type: ignore[no-untyped-def]
    plan = make_discreet(client, couple, create(client, couple), anticipationEnabled=True)
    response = client.get(path(couple, "dashboard"), headers=auth(couple["token_b"]))
    assert response.status_code == 200, response.text
    view = response.json()
    [item] = [item for item in view["upcoming"] if item["id"] == plan["id"]]
    assert item["titleOrText"] == "Weekend for two"
    assert item["concealed"] is True
    assert view["anticipation"]["planId"] == plan["id"]
    assert view["anticipation"]["title"] == "Weekend for two"
    assert view["anticipation"]["concealed"] is True
    assert TITLE not in response.text and DESCRIPTION not in response.text

    patch(client, couple, plan | {"version": plan["version"]}, previewTitle=None)
    view = client.get(path(couple, "dashboard"), headers=auth(couple["token_b"])).json()
    assert view["anticipation"]["title"] == ""
    [item] = [item for item in view["upcoming"] if item["id"] == plan["id"]]
    assert item["titleOrText"] is None and item["concealed"] is True


def test_activity_titles_and_device_previews_stay_neutral(client, couple, session):  # type: ignore[no-untyped-def]
    plan = make_discreet(client, couple, create(client, couple))
    targets = {(EngagementTarget.PLAN, UUID(plan["id"]))}
    context = AuthorizationContext(
        account_id=couple["ben"].id, space_id=couple["space"].id
    )
    assert presentation.target_titles(session, context, targets) == {
        (EngagementTarget.PLAN, UUID(plan["id"])): "Weekend for two"
    }
    assert presentation.concealed_targets(session, targets) == targets

    comment = client.post(
        f"{path(couple)}/{plan['id']}/comments",
        headers=auth(couple["token_a"]),
        json={"body": "Bring the swimsuit"},
    )
    assert comment.status_code == 201, comment.text
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.subject_id == UUID(comment.json()["id"]))
    )
    engagement.project_event(session, event)
    session.flush()
    notice = session.scalar(select(Notification).where(Notification.source_event_id == event.id))
    assert notice is not None
    preview = push_preview.for_notification(session, notice, digest=False, version=2)
    assert preview is not None
    assert TITLE not in preview and "Weekend for two" not in preview
    assert "Bring the swimsuit" not in preview

    inbox = client.get(path(couple, "notifications"), headers=auth(couple["token_b"]))
    assert inbox.status_code == 200, inbox.text
    [target] = [
        item["target"] for item in inbox.json()["items"] if item["targetId"] == plan["id"]
    ]
    assert target == {
        "targetType": "PLAN",
        "targetId": plan["id"],
        "title": "Weekend for two",
        "concealed": True,
    }
    assert TITLE not in inbox.text


def test_plan_photos_inherit_concealment_in_the_media_gallery(client, couple, session):  # type: ignore[no-untyped-def]
    photo = ready_attachment(client, couple, session)
    plan = create(client, couple, attachments=[{"attachmentId": photo, "position": 0}])

    def gallery_flag():  # type: ignore[no-untyped-def]
        response = client.get(path(couple, "media"), headers=auth(couple["token_b"]))
        assert response.status_code == 200, response.text
        [item] = [item for item in response.json()["items"] if item["parentId"] == plan["id"]]
        return item["attachment"]["isSensitive"]

    assert gallery_flag() is False
    discreet_plan = make_discreet(client, couple, plan)
    assert gallery_flag() is True
    # The attachment's own flag is untouched; clearing restores it.
    assert discreet_plan["attachments"][0]["isSensitive"] is False
    patch(client, couple, discreet_plan, discreet=False)
    assert gallery_flag() is False
