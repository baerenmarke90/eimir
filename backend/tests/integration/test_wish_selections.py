"""Real PostgreSQL/HTTP privacy, lifecycle and concurrency acceptance for #1535."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError
from eimir.plans import service as plans
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership
from eimir.transfer import service as transfer
from eimir.transfer.models import TransferScope
from eimir.wish_selections import service
from eimir.wish_selections.models import WishSelection, WishSelectionCandidate, WishSelectionRound
from eimir.wishes import service as wishes
from eimir.wishes.models import Wish
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def actors(session: Session):  # type: ignore[no-untyped-def]
    first = make_account(session, "First")
    second = make_account(session, "Second")
    outsider = make_account(session, "Outsider")
    space = make_space(session, first)
    relationship.add_member(session, space.id, second)
    foreign = make_space(session, outsider)
    first_context = AuthorizationContext(first.id, space.id)
    second_context = AuthorizationContext(second.id, space.id)
    sources = [
        wishes.create_wish(session, first_context, title=f"Idea {index}") for index in range(3)
    ]
    foreign_wish = wishes.create_wish(
        session, AuthorizationContext(outsider.id, foreign.id), title="Foreign private context"
    )
    return {
        "first": first,
        "second": second,
        "outsider": outsider,
        "space": space,
        "foreign": foreign,
        "sources": sources,
        "foreign_wish": foreign_wish,
        "a": first_context,
        "b": second_context,
        "token_a": sign_in(session, first),
        "token_b": sign_in(session, second),
        "token_outsider": sign_in(session, outsider),
    }


def path(actors) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{actors['space'].id}/wish-selection"


def headers(actors, who="a", version=None):  # type: ignore[no-untyped-def]
    result = auth(actors[f"token_{who}"])
    if version is not None:
        result["If-Match"] = str(version)
    return result


def start(client, actors):  # type: ignore[no-untyped-def]
    result = client.put(
        path(actors),
        headers=headers(actors, version="absent"),
        json={"wishIds": [str(item.id) for item in actors["sources"]], "title": "Our weekend"},
    )
    assert result.status_code == 200, result.text
    return result.json()


def share(client, actors, who, token, indices, published=True):  # type: ignore[no-untyped-def]
    return client.put(
        path(actors) + "/own",
        headers=headers(actors, who, token),
        json={
            "favoriteWishIds": [str(actors["sources"][i].id) for i in indices],
            "published": published,
        },
    )


def test_private_lists_and_versions_are_not_partner_projections(client, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    first = share(client, actors, "a", current["selectionToken"], [0, 1])
    assert first.status_code == 200
    assert first.json()["resultState"] == "WAITING"
    assert first.headers["cache-control"] == "private, no-store"
    second = client.get(path(actors), headers=headers(actors, "b")).json()
    assert second["own"] == {"favoriteWishIds": [], "published": False, "version": 0}
    assert second["resultState"] == "CHOOSING"
    assert second["commonWishIds"] == []
    assert not {"partner", "selections", "partnerVersion", "participantCount"} & set(second)
    matched = share(client, actors, "b", second["selectionToken"], [1, 2]).json()
    assert matched["resultState"] == "READY"
    assert matched["commonWishIds"] == [str(actors["sources"][1].id)]
    assert matched["own"]["favoriteWishIds"] == [str(actors["sources"][i].id) for i in [1, 2]]
    first_read = client.get(path(actors), headers=headers(actors)).json()
    assert first_read["own"]["version"] == first.json()["own"]["version"]
    assert first_read["selectionToken"] == first.json()["selectionToken"]


def test_withdrawal_hides_previous_match_and_empty_selection_is_valid(client, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    first = share(client, actors, "a", current["selectionToken"], [0]).json()
    second = client.get(path(actors), headers=headers(actors, "b")).json()
    share(client, actors, "b", second["selectionToken"], [0])
    withdrawn = share(client, actors, "a", first["selectionToken"], [0], published=False)
    assert withdrawn.status_code == 200
    assert withdrawn.json()["resultState"] == "CHOOSING"
    partner = client.get(path(actors), headers=headers(actors, "b")).json()
    assert partner["resultState"] == "WAITING" and partner["commonWishIds"] == []
    no_match = share(client, actors, "a", withdrawn.json()["selectionToken"], []).json()
    assert no_match["resultState"] == "READY" and no_match["commonWishIds"] == []


def test_stale_owner_and_old_round_consent_are_rejected(client, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    first = share(client, actors, "a", current["selectionToken"], [0]).json()
    assert share(client, actors, "a", current["selectionToken"], [1]).status_code == 409
    replaced = client.put(
        path(actors),
        headers=headers(actors, version=current["roundToken"]),
        json={"wishIds": [str(item.id) for item in actors["sources"][:2]]},
    )
    assert replaced.status_code == 200
    assert replaced.json()["own"]["version"] == 0
    assert share(client, actors, "a", first["selectionToken"], [0]).status_code == 409
    stale_reset = client.put(
        path(actors),
        headers=headers(actors, version=current["roundToken"]),
        json={"wishIds": [str(item.id) for item in actors["sources"][:2]]},
    )
    assert stale_reset.status_code == 409


def test_partner_publication_does_not_invalidate_own_concurrency_token(client, actors):  # type: ignore[no-untyped-def]
    first = start(client, actors)
    second = client.get(path(actors), headers=headers(actors, "b")).json()
    assert share(client, actors, "b", second["selectionToken"], [1]).status_code == 200
    own = share(client, actors, "a", first["selectionToken"], [0, 1])
    assert own.status_code == 200
    assert own.json()["commonWishIds"] == [str(actors["sources"][1].id)]


@pytest.mark.parametrize("invalid", ["foreign", "missing", "duplicate"])
def test_candidate_validation_is_same_space_and_exact(client, actors, invalid):  # type: ignore[no-untyped-def]
    invalid_id = actors["foreign_wish"].id if invalid == "foreign" else uuid4()
    if invalid == "duplicate":
        invalid_id = actors["sources"][0].id
    result = client.put(
        path(actors),
        headers=headers(actors, version="absent"),
        json={"wishIds": [str(actors["sources"][0].id), str(invalid_id)]},
    )
    assert result.status_code == 422
    assert result.json()["code"] == "WISH_SELECTION_CANDIDATES_INVALID"
    assert "Foreign private context" not in result.text


def test_favorite_and_ownership_fields_cannot_escape_the_current_round(client, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    for invalid_id in [str(uuid4()), str(actors["foreign_wish"].id)]:
        result = client.put(
            path(actors) + "/own",
            headers=headers(actors, version=current["selectionToken"]),
            json={"favoriteWishIds": [invalid_id], "published": True},
        )
        assert result.status_code == 422
    rejected = client.put(
        path(actors) + "/own",
        headers=headers(actors, version=current["selectionToken"]),
        json={"favoriteWishIds": [], "published": True, "ownerId": str(actors["second"].id)},
    )
    assert rejected.status_code == 422


@pytest.mark.parametrize(
    "method,suffix,body",
    [
        ("get", "", None),
        ("put", "", {"wishIds": [str(uuid4()), str(uuid4())]}),
        ("put", "/own", {"favoriteWishIds": [], "published": True}),
        ("delete", "", None),
    ],
)
def test_all_routes_obey_tenant_and_authentication_boundary(client, actors, method, suffix, body):  # type: ignore[no-untyped-def]
    url = path(actors) + suffix
    kwargs = {"json": body} if body is not None else {}
    outsider = client.request(method, url, headers=headers(actors, "outsider", 0), **kwargs)
    missing = client.request(
        method,
        f"/api/v1/spaces/{uuid4()}/wish-selection{suffix}",
        headers=headers(actors, "outsider", 0),
        **kwargs,
    )
    assert outsider.status_code == missing.status_code == 404
    assert outsider.json() == missing.json()
    assert client.request(method, url, headers={"If-Match": "0"}, **kwargs).status_code == 401


def test_source_rename_or_deletion_requires_review_instead_of_reusing_consent(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    source = actors["sources"][0]
    wishes.update_wish(
        session, actors["a"], source.id, expected_version=source.version, title="Changed idea"
    )
    read = client.get(path(actors), headers=headers(actors)).json()
    assert read["resultState"] == "NEEDS_IDEAS" and read["commonWishIds"] == []
    result = share(client, actors, "a", current["selectionToken"], [0])
    assert result.status_code == 409 and result.json()["code"] == "WISH_SELECTION_SOURCES_CHANGED"
    deleted = actors["sources"][1]
    wishes.delete_wish(session, actors["a"], deleted.id, expected_version=deleted.version)
    read = client.get(path(actors), headers=headers(actors)).json()
    assert str(deleted.id) not in [candidate["wishId"] for candidate in read["candidates"]]
    assert read["resultState"] == "NEEDS_IDEAS"


def test_conversion_is_canonical_and_duplicate_safe(client, session: Session, actors):  # type: ignore[no-untyped-def]
    start(client, actors)
    source = actors["sources"][0]
    result = plans.convert_wish_to_plan(
        session,
        actors["a"],
        source.id,
        expected_version=source.version,
        title=None,
        description=None,
        place_id=None,
    )
    read = client.get(path(actors), headers=headers(actors)).json()
    candidate = next(item for item in read["candidates"] if item["wishId"] == str(source.id))
    assert candidate["planId"] == str(result.plan.id)
    repeated = plans.convert_wish_to_plan(
        session,
        actors["b"],
        source.id,
        expected_version=1,
        title="Must not replace",
        description=None,
        place_id=None,
    )
    assert repeated.created is False and repeated.plan.id == result.plan.id
    assert session.scalar(select(func.count()).select_from(Plan)) == 1


def test_export_withholds_partner_lists_and_close_preserves_originals(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    share(client, actors, "a", current["selectionToken"], [0, 1])
    second = client.get(path(actors), headers=headers(actors, "b")).json()
    share(client, actors, "b", second["selectionToken"], [1, 2])
    for scope in [TransferScope.SHARED, TransferScope.PERSONAL]:
        with (
            transfer.build_export_archive(session, actors["a"], scope) as bundle,
            ZipFile(bundle) as archive,
        ):
            snapshot = json.loads(archive.read("accounts.json"))["wishSelection"]
            assert not any("selection" in name for name in archive.namelist())
        assert snapshot["commonWishIds"] == [str(actors["sources"][1].id)]
        if scope is TransferScope.PERSONAL:
            assert snapshot["ownSelection"]["favoriteWishIds"] == [
                str(item.id) for item in actors["sources"][:2]
            ]
        else:
            assert "ownSelection" not in snapshot
    assert (
        client.delete(
            path(actors), headers=headers(actors, version=current["roundToken"])
        ).status_code
        == 204
    )
    assert client.get(path(actors), headers=headers(actors)).json()["resultState"] == "NO_ROUND"
    assert session.scalar(select(func.count()).select_from(WishSelection)) == 0
    assert (
        session.scalar(
            select(func.count()).select_from(Wish).where(Wish.space_id == actors["space"].id)
        )
        == 3
    )


def test_membership_end_removes_the_whole_temporary_round(client, session: Session, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    share(client, actors, "a", current["selectionToken"], [0])
    member = session.scalar(
        select(Membership).where(
            Membership.space_id == actors["space"].id,
            Membership.account_id == actors["second"].id,
        )
    )
    assert member is not None
    relationship.end_membership(session, member)
    session.flush()
    assert session.scalar(select(func.count()).select_from(WishSelectionRound)) == 0
    assert session.scalar(select(func.count()).select_from(WishSelection)) == 0
    assert client.get(path(actors), headers=headers(actors)).json()["resultState"] == "NO_ROUND"
    assert client.get(path(actors), headers=headers(actors, "b")).status_code == 404


def test_database_cannot_link_a_foreign_wish_into_a_round(client, session: Session, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            WishSelectionCandidate(
                round_id=UUID(current["id"]),
                wish_id=actors["foreign_wish"].id,
                space_id=actors["space"].id,
                position=4,
                wish_version=1,
            )
        )
        session.flush()


def test_choice_payload_is_encrypted_at_rest(session: Session, encryption):  # type: ignore[no-untyped-def]
    encryption.apply("required")
    owner = make_account(session, "Owner")
    space = make_space(session, owner)
    context = AuthorizationContext(owner.id, space.id)
    sources = [
        wishes.create_wish(session, context, title=f"Encrypted source {i}") for i in range(2)
    ]
    current = service.replace_round(
        session,
        context,
        expected_token="absent",
        wish_ids=[item.id for item in sources],
        title="Sensitive occasion",
    )
    service.update_own_selection(
        session,
        context,
        expected_token=current.selection_token or "",
        favorite_wish_ids=[sources[0].id],
        published=True,
    )
    raw_round = session.execute(
        text("SELECT payload::text FROM wish_selection_rounds")
    ).scalar_one()
    raw_choices = session.execute(text("SELECT payload::text FROM wish_selections")).scalar_one()
    assert "Sensitive occasion" not in raw_round
    assert str(sources[0].id) not in raw_choices and "favorite_wish_ids" not in raw_choices
    assert service.get_selection(session, context).own is not None


def test_parallel_owner_writes_cannot_overwrite_the_later_selection(production_client):  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker.begin() as setup:
        owner = make_account(setup, "Race owner")
        space = make_space(setup, owner)
        context = AuthorizationContext(owner.id, space.id)
        sources = [wishes.create_wish(setup, context, title=f"Race source {i}") for i in range(2)]
        current = service.replace_round(
            setup,
            context,
            expected_token="absent",
            wish_ids=[item.id for item in sources],
            title=None,
        )
        token = current.selection_token or ""
        source_ids = [item.id for item in sources]
    barrier = Barrier(2)

    def submit(index: int) -> str:
        barrier.wait(timeout=10)
        try:
            with maker.begin() as transaction:
                service.update_own_selection(
                    transaction,
                    context,
                    expected_token=token,
                    favorite_wish_ids=[source_ids[index]],
                    published=True,
                )
            return "saved"
        except ConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(submit, [0, 1]))
    assert sorted(results) == ["conflict", "saved"]
    with maker() as read:
        assert read.scalar(select(func.count()).select_from(WishSelection)) == 1


def test_old_round_tokens_cannot_change_a_closed_and_recreated_round(client, actors):  # type: ignore[no-untyped-def]
    original = start(client, actors)
    assert (
        client.delete(
            path(actors), headers=headers(actors, version=original["roundToken"])
        ).status_code
        == 204
    )
    replacement = start(client, actors)
    assert replacement["version"] == original["version"]
    assert replacement["roundToken"] != original["roundToken"]
    assert (
        client.delete(
            path(actors), headers=headers(actors, version=original["roundToken"])
        ).status_code
        == 409
    )
    assert (
        client.put(
            path(actors),
            headers=headers(actors, version=original["roundToken"]),
            json={"wishIds": [str(item.id) for item in actors["sources"]]},
        ).status_code
        == 409
    )
    assert share(client, actors, "a", original["selectionToken"], [0]).status_code == 409
    actual = client.get(path(actors), headers=headers(actors)).json()
    assert actual["roundToken"] == replacement["roundToken"]
    assert actual["own"]["published"] is False
