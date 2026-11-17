"""The monthly film on real PostgreSQL: content-led cut, live media and frozen looks."""

from datetime import date
from uuid import UUID

import pytest

from eimir.attachments import binding
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.memories.models import Memory, MemoryPayload
from eimir.recaps import film
from eimir.recaps.models import RecapEdition
from tests.conftest import requires_database
from tests.integration.test_relationship_recaps import NOW, generate, memory, read, request
from tests.integration.test_relationship_recaps import context as context

pytestmark = [pytest.mark.integration, requires_database]


def picture(session, context, item, *, sensitive=False, position=0):  # type: ignore[no-untyped-def]
    row = Attachment(
        space_id=context["space"].id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/png",
        declared_size=8,
        mime_type="image/png",
        size=8,
        width=4,
        height=3,
        has_thumbnail=False,
        ready_at=NOW,
        payload=AttachmentPayload(original_name="photo.png", is_sensitive=sensitive),
    )
    session.add(row)
    session.flush()
    session.add(
        binding.MemoryAttachment(memory_id=item.id, attachment_id=row.id, position=position)
    )
    session.flush()
    return row


def titled(session, context, title, day, *, tags=(), owner=None, **extra):  # type: ignore[no-untyped-def]
    item = Memory(
        space_id=context["space"].id,
        owner_id=(owner or context["anna"]).id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=day,
        payload=MemoryPayload(title=title, body="Our own words", tags=list(tags)),
        **extra,
    )
    session.add(item)
    session.flush()
    return item


def month(client, session, context, number=10):  # type: ignore[no-untyped-def]
    created = request(client, context, month=number).json()
    generate(session, context, created)
    return read(client, context, created).json()


def test_the_birthday_is_the_guaranteed_highlight_and_scores_never_leave_the_server(
    client, session, context
):  # type: ignore[no-untyped-def]
    context["ben"].birthday = date(1994, 10, 17)
    ordinary = [titled(session, context, f"Walk {day}", date(2026, 10, day)) for day in (3, 9, 24)]
    party = titled(session, context, "Ronja's birthday", date(2026, 10, 17))
    for position in range(3):
        picture(session, context, party, position=position)
    response = client.get(
        f"{context['path']}/{month(client, session, context)['id']}", headers=context["headers"]
    )
    value = response.json()

    assert value["film"]["highlightKey"] == f"MEMORY:{party.id}"
    # A best-of keeps about four in five moments, in chronological order.
    order = {str(item.id): item.happened_on for item in [*ordinary, party]}
    shown = [item["id"] for item in value["sources"]]
    assert len(shown) == 3 and str(party.id) in shown
    assert [order[key] for key in shown] == sorted(order[key] for key in shown)
    assert value["film"]["mood"] in film.MOODS and len(value["film"]["transitions"]) == 2
    assert set(value["film"]["layouts"]) == set(film.LAYOUTS)
    party_view = next(item for item in value["sources"] if item["id"] == str(party.id))
    assert len(party_view["media"]) == 3 and party_view["media"][0]["kind"] == "IMAGE"
    assert "score" not in response.text and "reason" not in response.text.lower()


def test_a_sensitive_photo_stays_out_but_its_moment_stays_and_later_marks_apply_at_once(
    client, session, context
):  # type: ignore[no-untyped-def]
    wedding = titled(session, context, "A friend's wedding", date(2026, 10, 4))
    hidden = picture(session, context, wedding, sensitive=True)
    shown = picture(session, context, wedding, position=1)
    later = picture(session, context, wedding, position=2)
    value = month(client, session, context)

    source = next(item for item in value["sources"] if item["id"] == str(wedding.id))
    ids = {item["attachmentId"] for item in source["media"]}
    assert str(hidden.id) not in ids and {str(shown.id), str(later.id)} <= ids

    later.payload = later.payload.model_copy(update={"is_sensitive": True})
    session.flush()
    again = read(client, context, value).json()
    source = next(item for item in again["sources"] if item["id"] == str(wedding.id))
    assert {item["attachmentId"] for item in source["media"]} == {str(shown.id)}


def test_both_answers_to_a_guided_question_form_one_scene_with_live_answers(
    client, session, context
):  # type: ignore[no-untyped-def]
    question = "What made today good?"
    root = titled(session, context, question, date(2026, 10, 3), experience_kind="HAPPINESS")
    root.experience_root_id = root.id
    root.payload = root.payload.model_copy(update={"body": "Coffee in the sun."})
    answer = titled(
        session,
        context,
        question,
        date(2026, 10, 3),
        owner=context["ben"],
        experience_kind="HAPPINESS",
        experience_root_id=root.id,
    )
    answer.payload = answer.payload.model_copy(update={"body": "Your laugh at breakfast."})
    session.flush()
    value = month(client, session, context)

    keys = [item["id"] for item in value["sources"]]
    assert keys == [str(root.id)]
    texts = {item["text"]: item["authorName"] for item in value["sources"][0]["answers"]}
    assert texts == {"Coffee in the sun.": "Anna", "Your laugh at breakfast.": "Ben"}


def test_month_tags_count_shared_moments_of_the_month_only(client, session, context):  # type: ignore[no-untyped-def]
    titled(session, context, "Lake", date(2026, 10, 2), tags=["nature", "us"])
    titled(session, context, "Hike", date(2026, 10, 9), tags=["nature"])
    titled(session, context, "Earlier", date(2026, 9, 20), tags=["old"])
    value = month(client, session, context)
    assert value["film"]["tags"] == [
        {"label": "nature", "count": 2},
        {"label": "us", "count": 1},
    ]


def test_a_trip_belongs_to_the_month_it_started_in(client, session, context):  # type: ignore[no-untyped-def]
    titled(session, context, "Trip", date(2026, 9, 28), happened_until=date(2026, 10, 2))
    own = titled(session, context, "Concert", date(2026, 10, 12))
    value = month(client, session, context)
    assert [item["id"] for item in value["sources"]] == [str(own.id)]


def test_consecutive_months_differ_and_a_recomposition_keeps_the_frozen_look(
    client, session, context
):  # type: ignore[no-untyped-def]
    titled(session, context, "September", date(2026, 9, 10))
    titled(session, context, "October", date(2026, 10, 10))
    september = month(client, session, context, 9)
    october = month(client, session, context, 10)
    assert september["film"]["mood"] != october["film"]["mood"]
    assert september["film"]["transitions"] != october["film"]["transitions"]

    titled(session, context, "Late entry", date(2026, 10, 20))
    record = session.get(RecapEdition, UUID(october["id"]))
    record.status = "READY"
    session.flush()
    refreshed = request(client, context, refresh=True).json()
    generate(session, context, refreshed)
    assert read(client, context, refreshed).json()["film"]["mood"] == october["film"]["mood"]


def test_year_editions_keep_the_classic_story(client, session, context):  # type: ignore[no-untyped-def]
    memory(session, context, day=date(2026, 4, 1))
    created = request(client, context, kind="YEAR", month=0).json()
    generate(session, context, created)
    assert read(client, context, created).json()["film"] is None
