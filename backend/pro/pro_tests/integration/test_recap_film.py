"""The monthly film on real PostgreSQL: content-led cut, live media and frozen looks."""

from datetime import date
from uuid import UUID

import pytest
from eimir_pro.recap_composition import film

from eimir.attachments import binding
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
from eimir.recaps.models import RecapEdition
from tests.conftest import requires_database
from tests.integration.test_relationship_recaps import NOW, generate, read, request
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


def year(client, session, context, number=2025):  # type: ignore[no-untyped-def]
    created = request(client, context, kind="YEAR", year=number, month=0).json()
    generate(session, context, created)
    return created


def milestone(session, context, title, day):  # type: ignore[no-untyped-def]
    item = Milestone(
        space_id=context["space"].id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=day,
        payload=MilestonePayload(title=title),
    )
    session.add(item)
    session.flush()
    return item


def test_a_year_film_covers_every_month_with_bounded_chronological_chapters(
    client, session, context
):  # type: ignore[no-untyped-def]
    days = {}
    for month_number in range(1, 13):
        for day in (2, 9, 16, 23, 28):
            item = titled(
                session, context, f"Day {month_number}.{day}", date(2025, month_number, day)
            )
            days[str(item.id)] = item.happened_on
    summit = titled(session, context, "The summit", date(2025, 7, 12))
    days[str(summit.id)] = summit.happened_on
    for position in range(3):
        picture(session, context, summit, position=position)
    firsts = [milestone(session, context, f"First {n}", date(2025, n * 3, 5)) for n in (1, 2, 3)]
    for item in firsts:
        days[str(item.id)] = item.happened_on
    # March already has a monthly film; the year keeps its highlight and selection.
    march = request(client, context, year=2025, month=3).json()
    generate(session, context, march)
    march_view = read(client, context, march).json()

    created = year(client, session, context)
    response = read(client, context, created)
    value = response.json()
    film_view = value["film"]

    chosen = [item["id"] for item in value["sources"]]
    assert len(chosen) <= film.YEAR_SCENE_LIMIT
    assert [days[key] for key in chosen] == sorted(days[key] for key in chosen)
    months = {item["month"]: item["key"] for item in film_view["monthHighlights"]}
    assert set(months) == set(range(1, 13))
    keys = {item["key"] for item in value["sources"]}
    assert set(months.values()) <= keys
    assert (
        film_view["highlightKey"] == f"MEMORY:{summit.id}"
        and months[7] == film_view["highlightKey"]
    )
    # March's film chose its milestone as highlight: it plays among the year's
    # firsts, and March's chapter opens with the next pick of that same film.
    march_keys = {item["key"] for item in march_view["sources"]}
    assert march_view["film"]["highlightKey"] == f"MILESTONE:{firsts[0].id}"
    assert march_view["film"]["highlightKey"] in keys and months[3] in march_keys
    assert {key for key in keys if days[key.split(":")[1]].month == 3} <= {
        item["key"] for item in march_view["sources"]
    }
    for month_number in range(1, 13):
        chapter = [
            key
            for key in keys
            if key.startswith("MEMORY:") and days[key.split(":")[1]].month == month_number
        ]
        assert 1 <= len(chapter) <= film.YEAR_PER_MONTH
    assert {f"MILESTONE:{item.id}" for item in firsts} <= keys
    summit_view = next(item for item in value["sources"] if item["id"] == str(summit.id))
    assert len(summit_view["media"]) == 3
    assert "score" not in response.text and "reason" not in response.text.lower()
    # Both partners see the identical film.
    partner = read(client, context, created, partner=True).json()
    assert partner["film"] == film_view and partner["sources"] == value["sources"]


def test_year_looks_differ_from_the_previous_year_and_the_december_film(client, session, context):  # type: ignore[no-untyped-def]
    for number in (2024, 2025):
        titled(session, context, f"Winter {number}", date(number, 12, 6))
        titled(session, context, f"Summer {number}", date(number, 6, 6))
    december = request(client, context, year=2025, month=12).json()
    generate(session, context, december)
    earlier = read(client, context, year(client, session, context, 2024)).json()["film"]
    later = read(client, context, year(client, session, context, 2025)).json()["film"]
    december_look = read(client, context, december).json()["film"]
    assert later["mood"] not in {earlier["mood"], december_look["mood"]}
    assert later["transitions"] not in (earlier["transitions"], december_look["transitions"])
    assert later["monthHighlights"] == [
        {"month": 6, "key": later["monthHighlights"][0]["key"]},
        {"month": 12, "key": later["monthHighlights"][1]["key"]},
    ]
    assert december_look["monthHighlights"] == []


def test_the_look_carries_accents_and_pace_and_media_their_format_and_focus(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    measured = film.PhotoQuality(300.0, 0.1, 0x0F0F0F0F0F0F0F0F, 1.4, 0.2, 0.0, 0.0, 0.64, 0.36)
    monkeypatch.setattr(
        "eimir_pro.recap_composition.montage.measure", lambda attachment, cache: measured
    )
    trip = titled(session, context, "Night at the lake", date(2026, 10, 12))
    picture(session, context, trip)
    titled(session, context, "Walk", date(2026, 10, 3))
    value = month(client, session, context)

    look = value["film"]
    assert len(look["accents"]) == film.ACCENT_COUNT and set(look["accents"]) <= set(film.ACCENTS)
    assert look["pace"] == "calm"
    # The night photo is dark, so the first free dark mood is chosen.
    assert look["mood"] == "night"
    media = next(item for item in value["sources"] if item["id"] == str(trip.id))["media"][0]
    assert (media["shape"], media["focusX"], media["focusY"]) == ("portrait", 0.64, 0.36)
    text = client.get(f"{context['path']}/{value['id']}", headers=context["headers"]).text
    for measure in ("luminance", "warmth", "sharpness", "dhash"):
        assert measure not in text


def test_a_film_frozen_before_the_variety_catalogue_stays_readable(client, session, context):  # type: ignore[no-untyped-def]
    item = titled(session, context, "Autumn", date(2026, 10, 8))
    picture(session, context, item)
    value = month(client, session, context)
    record = session.get(RecapEdition, UUID(value["id"]))
    stored = record.payload.model_dump(mode="json")
    stored["film"]["look"].pop("accents")
    stored["film"]["look"].pop("pace")
    stored["film"]["look"]["layouts"] = {"photo": ["bleed"], "duo": ["side"]}
    for media in stored["film"]["media"].values():
        for entry in media:
            for key in ("shape", "focus_x", "focus_y"):
                entry.pop(key)
    record.payload = type(record.payload).model_validate(stored)
    session.flush()

    again = read(client, context, value).json()
    assert again["film"]["accents"] == [] and again["film"]["pace"] is None
    assert again["film"]["layouts"] == {"photo": ["bleed"], "duo": ["side"]}
    media = next(entry for entry in again["sources"] if entry["id"] == str(item.id))["media"][0]
    assert media["shape"] is None and media["focusX"] is None
