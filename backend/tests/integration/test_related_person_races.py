"""Real PostgreSQL races for related people and important dates."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Event
from time import monotonic, sleep
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import select, text

from eimir.authorization import AuthorizationContext, ContentVisibility, PrivacyClass
from eimir.people import service as people_service
from eimir.people.models import (
    DateRepeat,
    ImportantDate,
    ImportantDateType,
    PersonRelationship,
    RelatedPerson,
)
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

PERSON_BODY = {
    "displayName": "Lisa",
    "relationship": "CHILD",
    "birthday": "2016-02-29",
    "birthdayYearKnown": True,
}


def _important_date_body(related_person_id: UUID | None) -> dict[str, Any]:
    return {
        "label": "Lisa's celebration",
        "type": "CUSTOM",
        "date": "2027-02-01",
        "repeats": "NONE",
        "visibility": "SHARED",
        "relatedPersonId": str(related_person_id) if related_person_id is not None else None,
    }


def _setup(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        token_a = sign_in(session, anna)
        token_b = sign_in(session, ben)
        space_id = space.id

    response = client.post(
        f"/api/v1/spaces/{space_id}/related-persons",
        json={
            **PERSON_BODY,
            "visibility": "SHARED",
        },
        headers=auth(token_a),
    )
    assert response.status_code == 201
    person = response.json()
    return client, maker, space_id, token_a, token_b, UUID(person["id"]), person["version"]


def _setup_link_race(production_client, *, existing_date: bool) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    client, maker, space_id, token, partner_token, person_id, person_version = _setup(
        production_client
    )
    with maker() as session:
        person = session.get(RelatedPerson, person_id)
        assert person is not None
        context = AuthorizationContext(account_id=person.owner_id, space_id=space_id)

    date_id: UUID | None = None
    date_version: int | None = None
    if existing_date:
        response = client.post(
            f"/api/v1/spaces/{space_id}/important-dates",
            json=_important_date_body(None),
            headers=auth(token),
        )
        assert response.status_code == 201
        important_date = response.json()
        date_id = UUID(important_date["id"])
        date_version = important_date["version"]

    return {
        "client": client,
        "maker": maker,
        "space_id": space_id,
        "token": token,
        "partner_token": partner_token,
        "context": context,
        "person_id": person_id,
        "person_version": person_version,
        "date_id": date_id,
        "date_version": date_version,
    }


def _wait_until_blocked(maker, blocker_pid: int, *, timeout: float = 5) -> None:  # type: ignore[no-untyped-def]
    """Wait for PostgreSQL lock evidence instead of relying on a fixed delay."""
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        with maker() as probe:
            blocked = probe.execute(
                text(
                    "SELECT EXISTS ("
                    "SELECT 1 FROM pg_stat_activity "
                    "WHERE :blocker_pid = ANY(pg_blocking_pids(pid))"
                    ")"
                ),
                {"blocker_pid": blocker_pid},
            ).scalar_one()
        if blocked:
            return
        sleep(0.01)
    pytest.fail("The competing request never waited on the expected PostgreSQL lock.")


def _finish_blocked_request(
    maker,  # type: ignore[no-untyped-def]
    blocker,  # type: ignore[no-untyped-def]
    transaction,  # type: ignore[no-untyped-def]
    blocker_pid: int,
    request,  # type: ignore[no-untyped-def]
):  # type: ignore[no-untyped-def]
    started = Event()

    def run():  # type: ignore[no-untyped-def]
        started.set()
        return request()

    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(run)
    try:
        assert started.wait(timeout=2)
        _wait_until_blocked(maker, blocker_pid)
        transaction.commit()
        return future.result(timeout=10)
    finally:
        if transaction.is_active:
            transaction.rollback()
        blocker.close()
        pool.shutdown(wait=True, cancel_futures=True)


def _link_in_session(world: dict[str, Any], session) -> ImportantDate:  # type: ignore[no-untyped-def]
    if world["date_id"] is None:
        return people_service.create_date(
            session,
            world["context"],
            label="Lisa's celebration",
            date_type=ImportantDateType.CUSTOM,
            day=date(2027, 2, 1),
            repeats=DateRepeat.NONE,
            visibility=ContentVisibility.SHARED,
            related_person_id=world["person_id"],
        )
    assert world["date_version"] is not None
    return people_service.update_date(
        session,
        world["context"],
        world["date_id"],
        expected_version=world["date_version"],
        label="Lisa's celebration",
        date_type=ImportantDateType.CUSTOM,
        day=date(2027, 2, 1),
        repeats=DateRepeat.NONE,
        visibility=ContentVisibility.SHARED,
        related_person_id=world["person_id"],
    )


def _link_over_http(
    world: dict[str, Any],
    *,
    token: str | None = None,
):  # type: ignore[no-untyped-def]
    path = f"/api/v1/spaces/{world['space_id']}/important-dates"
    headers = auth(token or world["token"])
    if world["date_id"] is None:
        return world["client"].post(
            path,
            json=_important_date_body(world["person_id"]),
            headers=headers,
        )
    assert world["date_version"] is not None
    return world["client"].put(
        f"{path}/{world['date_id']}",
        json=_important_date_body(world["person_id"]),
        headers={**headers, "If-Match": f'"{world["date_version"]}"'},
    )


@pytest.mark.parametrize("existing_date", [False, True], ids=["create", "relink"])
def test_date_link_wins_before_person_privacy_change(
    production_client,
    existing_date: bool,
) -> None:  # type: ignore[no-untyped-def]
    """A committed link is revalidated before the waiting privacy transition."""
    world = _setup_link_race(production_client, existing_date=existing_date)
    blocker = world["maker"]()
    transaction = blocker.begin()
    blocker_pid = blocker.execute(text("SELECT pg_backend_pid()")).scalar_one()
    important_date = _link_in_session(world, blocker)
    linked_date_id = important_date.id

    def make_private():  # type: ignore[no-untyped-def]
        return world["client"].put(
            f"/api/v1/spaces/{world['space_id']}/related-persons/{world['person_id']}",
            json={**PERSON_BODY, "visibility": "PRIVATE"},
            headers={
                **auth(world["token"]),
                "If-Match": f'"{world["person_version"]}"',
            },
        )

    response = _finish_blocked_request(
        world["maker"], blocker, transaction, blocker_pid, make_private
    )

    assert response.status_code == 409
    assert response.json()["code"] == "RELATED_PERSON_HAS_SHARED_DATES"

    with world["maker"]() as verification:
        person = verification.get(RelatedPerson, world["person_id"])
        linked_date = verification.get(ImportantDate, linked_date_id)
        assert person is not None
        assert linked_date is not None
        assert person.privacy_class == PrivacyClass.SPACE_SHARED.value
        assert linked_date.privacy_class == PrivacyClass.SPACE_SHARED.value
        assert linked_date.related_person_id == person.id
        assert linked_date.related_person_privacy_class == PrivacyClass.SPACE_SHARED.value


@pytest.mark.parametrize("existing_date", [False, True], ids=["create", "relink"])
def test_person_privacy_change_wins_before_date_link(
    production_client,
    existing_date: bool,
) -> None:  # type: ignore[no-untyped-def]
    """A waiting link revalidates the private parent and returns a domain error."""
    world = _setup_link_race(production_client, existing_date=existing_date)
    blocker = world["maker"]()
    transaction = blocker.begin()
    blocker_pid = blocker.execute(text("SELECT pg_backend_pid()")).scalar_one()
    people_service.update_person(
        blocker,
        world["context"],
        world["person_id"],
        expected_version=world["person_version"],
        display_name="Lisa",
        relationship=PersonRelationship.CHILD,
        birthday=date(2016, 2, 29),
        birthday_year_known=True,
        visibility=ContentVisibility.PRIVATE,
    )

    response = _finish_blocked_request(
        world["maker"], blocker, transaction, blocker_pid, lambda: _link_over_http(world)
    )

    assert response.status_code == 422
    assert response.json()["code"] == "IMPORTANT_DATE_MORE_OPEN_THAN_PERSON"

    with world["maker"]() as verification:
        person = verification.get(RelatedPerson, world["person_id"])
        assert person is not None
        assert person.privacy_class == PrivacyClass.OWNER_ONLY.value
        dates = verification.execute(select(ImportantDate)).scalars().all()
        if world["date_id"] is None:
            assert dates == []
        else:
            assert len(dates) == 1
            assert dates[0].id == world["date_id"]
            assert dates[0].related_person_id is None
            assert dates[0].related_person_privacy_class is None


@pytest.mark.parametrize("existing_date", [False, True], ids=["create", "relink"])
def test_person_privacy_change_hides_parent_from_partner_link(
    production_client,
    existing_date: bool,
) -> None:  # type: ignore[no-untyped-def]
    """A waiter revalidates access without disclosing the now-private person."""
    world = _setup_link_race(production_client, existing_date=False)
    if existing_date:
        response = world["client"].post(
            f"/api/v1/spaces/{world['space_id']}/important-dates",
            json=_important_date_body(None),
            headers=auth(world["partner_token"]),
        )
        assert response.status_code == 201
        important_date = response.json()
        world["date_id"] = UUID(important_date["id"])
        world["date_version"] = important_date["version"]

    blocker = world["maker"]()
    transaction = blocker.begin()
    blocker_pid = blocker.execute(text("SELECT pg_backend_pid()")).scalar_one()
    people_service.update_person(
        blocker,
        world["context"],
        world["person_id"],
        expected_version=world["person_version"],
        display_name="Lisa",
        relationship=PersonRelationship.CHILD,
        birthday=date(2016, 2, 29),
        birthday_year_known=True,
        visibility=ContentVisibility.PRIVATE,
    )

    response = _finish_blocked_request(
        world["maker"],
        blocker,
        transaction,
        blocker_pid,
        lambda: _link_over_http(world, token=world["partner_token"]),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    with world["maker"]() as verification:
        person = verification.get(RelatedPerson, world["person_id"])
        assert person is not None
        assert person.privacy_class == PrivacyClass.OWNER_ONLY.value
        dates = verification.execute(select(ImportantDate)).scalars().all()
        if existing_date:
            assert len(dates) == 1
            assert dates[0].id == world["date_id"]
            assert dates[0].related_person_id is None
        else:
            assert dates == []


def _attempt_delete(
    client,
    path: str,
    headers: dict[str, str],
    started: Event,
) -> Any:  # type: ignore[no-untyped-def]
    started.set()
    return client.delete(path, headers=headers)


def test_delete_against_parallel_delete_returns_404_instead_of_500(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    """The row disappears between the guard query and lock acquisition.

    This window previously contained ``session.refresh(...,
    with_for_update=True)``. On a deleted row it ended in a database error and
    therefore a 500 response, which is not used for any other absence and
    would itself disclose information.
    """
    client, maker, space_id, token_a, _token_b, person_id, version = _setup(production_client)

    # The blocker holds and deletes the row but does not commit yet. Under READ
    # COMMITTED the request guard can still read the old row; only lock
    # acquisition then waits.
    blocker = maker()
    transaction = blocker.begin()
    person = blocker.execute(
        select(RelatedPerson).where(RelatedPerson.id == person_id).with_for_update()
    ).scalar_one()
    blocker.delete(person)
    blocker.flush()

    path = f"/api/v1/spaces/{space_id}/related-persons/{person_id}?deletePolicy=preserve"
    headers = {**auth(token_a), "If-Match": f'"{version}"'}

    started = Event()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_attempt_delete, client, path, headers, started)
            assert started.wait(timeout=2)
            # While the exclusive lock is held, the request must not finish; it
            # demonstrably waits for that lock.
            sleep(0.2)
            assert not future.done()

            transaction.commit()
            response = future.result(timeout=5)
    finally:
        if transaction.is_active:
            transaction.rollback()
        blocker.close()

    assert response.status_code == 404
    assert response.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    with maker() as verify:
        assert (
            verify.execute(
                select(RelatedPerson).where(RelatedPerson.id == person_id)
            ).scalar_one_or_none()
            is None
        )
