"""The Wish slice must mirror the current closed lifecycle contract.

The contract is more than formality here. ``status`` remains server-owned and
``createdBy`` remains attribution rather than an ACL. Lifecycle state changes
therefore happen only through named commands: Wish-to-Plan conversion owns the
Plan path, while #870 adds one explicit direct-completion command for an OPEN
Wish that became reality without a Plan. No request body may write status.
"""

from __future__ import annotations

from eimir.main import create_app

COLLECTION = "/api/v1/spaces/{spaceId}/wishes"
DETAIL = "/api/v1/spaces/{spaceId}/wishes/{wishId}"
COMPLETE = f"{DETAIL}/complete"
PLAN = f"{DETAIL}/plan"


def _schema() -> dict[str, object]:
    return create_app().openapi()


def _paths() -> dict[str, dict[str, dict]]:
    return _schema()["paths"]  # type: ignore[index,return-value]


def _components() -> dict[str, dict]:
    return _schema()["components"]["schemas"]  # type: ignore[index,return-value]


def _wish_paths() -> set[str]:
    return {path for path in _paths() if path == COLLECTION or path.startswith(f"{COLLECTION}/")}


def test_wish_routes_have_frozen_operation_ids() -> None:
    paths = _paths()
    assert paths[COLLECTION]["post"]["operationId"] == "createWish"
    assert paths[COLLECTION]["get"]["operationId"] == "listWishes"
    assert paths[DETAIL]["get"]["operationId"] == "getWish"
    assert paths[DETAIL]["patch"]["operationId"] == "updateWish"
    assert paths[DETAIL]["delete"]["operationId"] == "deleteWish"
    assert paths[COMPLETE]["post"]["operationId"] == "completeWish"
    assert paths[PLAN]["post"]["operationId"] == "convertWishToPlan"


def test_the_contract_carries_exactly_the_decided_wish_surface() -> None:
    """Wish lifecycle commands are explicit rather than generic status writes."""
    wish_paths = _wish_paths()
    assert wish_paths == {COLLECTION, DETAIL, COMPLETE, PLAN}


def test_wish_status_has_no_generic_mutation_route() -> None:
    """#870 adds only the named OPEN -> COMPLETED command.

    Generic status/reopen endpoints would reopen the state machine and bypass
    the Plan-owned transitions, so they remain forbidden.
    """
    wish_paths = _wish_paths()
    for forbidden in ("plan-status", "status", "reopen"):
        assert not any(path.endswith(f"/{forbidden}") for path in wish_paths), forbidden


def test_mutations_require_if_match() -> None:
    paths = _paths()
    versioned = ((DETAIL, "patch"), (DETAIL, "delete"), (COMPLETE, "post"), (PLAN, "post"))
    for path, method in versioned:
        parameters = paths[path][method].get("parameters", [])
        names = {parameter["name"] for parameter in parameters}
        assert "If-Match" in names
        required = next(parameter for parameter in parameters if parameter["name"] == "If-Match")
        assert required["required"] is True


def test_create_does_not_require_if_match() -> None:
    """A Wish that does not exist yet has no version to compare."""
    names = {parameter["name"] for parameter in _paths()[COLLECTION]["post"].get("parameters", [])}
    assert "If-Match" not in names


def test_no_request_body_accepts_status_or_ownership() -> None:
    """Status and attribution come from the server, not arbitrary clients."""
    forbidden = {
        "status",
        "createdBy",
        "spaceId",
        "version",
        "id",
        "createdAt",
        "updatedAt",
    }
    for name in ("WishCreate", "WishUpdate"):
        schema = _components()[name]
        assert set(schema["properties"]) & forbidden == set()
        # Do not silently discard extra fields; otherwise a client could
        # believe that it successfully set the status.
        assert schema.get("additionalProperties") is False


def test_direct_completion_has_no_request_body() -> None:
    """The only client input is concurrency; lifecycle intent is the route."""
    assert "requestBody" not in _paths()[COMPLETE]["post"]


def test_create_requires_only_a_title() -> None:
    schema = _components()["WishCreate"]
    assert set(schema["properties"]) == {"title"}
    assert schema["required"] == ["title"]


def test_update_offers_only_the_title() -> None:
    """There is no field through which PATCH could set the status."""
    assert set(_components()["WishUpdate"]["properties"]) == {"title"}


def test_detail_exposes_status_and_attribution_read_only() -> None:
    schema = _components()["WishDetail"]
    assert {"status", "createdBy", "creator", "capabilities"} <= set(schema["properties"])
    assert set(_components()["WishStatus"]["enum"]) == {"OPEN", "PLANNED", "COMPLETED"}


def test_detail_carries_no_wish_body() -> None:
    """A Wish has only a title in M3; `body` belongs to the Plan."""
    assert "body" not in _components()["WishDetail"]["properties"]


def test_list_filters_by_status_and_not_by_free_text() -> None:
    """Full-text search is M4-A and explicitly not part of M3."""
    parameters = {p["name"] for p in _paths()[COLLECTION]["get"].get("parameters", [])}
    assert {"status", "cursor", "limit"} <= parameters
    assert "q" not in parameters


def test_conflict_is_a_documented_answer_for_every_versioned_wish_write() -> None:
    """409 covers stale versions and lifecycle/domain conflicts."""
    paths = _paths()
    for path, method in (
        (DETAIL, "patch"),
        (DETAIL, "delete"),
        (COMPLETE, "post"),
        (PLAN, "post"),
    ):
        assert "409" in paths[path][method]["responses"]
