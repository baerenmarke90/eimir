"""Editorial date-idea catalog: schema parity, validation, filters and locales."""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from eimir.date_ideas.catalog import (
    BUDGET_MAX,
    IDEA_COUNT,
    MINUTES_MAX,
    DateIdeaCatalog,
    DateIdeaCategory,
    DateIdeaPlaceType,
    IdeaFilter,
    bundled_catalog_text,
    get_catalog,
    parse_catalog,
    removed_idea_ids,
)
from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES

SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[3] / "docs/product/date-inspiration/catalog.schema.json"
    ).read_text(encoding="utf-8")
)


def _schema_errors(value: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    """Minimal JSON Schema (2020-12) check for the keywords the handoff uses."""
    if "$ref" in schema:
        schema = SCHEMA["$defs"][schema["$ref"].rsplit("/", 1)[-1]]
    errors: list[str] = []
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: const")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: enum")
    kind = schema.get("type")
    if kind == "object":
        if not isinstance(value, dict):
            return [f"{path}: object"]
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}.{key}: required")
        properties = schema.get("properties", {})
        for key, item in value.items():
            if key in properties:
                errors.extend(_schema_errors(item, properties[key], f"{path}.{key}"))
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}.{key}: additional")
    elif kind == "array":
        if not isinstance(value, list):
            return [f"{path}: array"]
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 10**9):
            errors.append(f"{path}: items count")
        if schema.get("uniqueItems") and len({json.dumps(v, sort_keys=True) for v in value}) != len(
            value
        ):
            errors.append(f"{path}: unique")
        for index, item in enumerate(value):
            errors.extend(_schema_errors(item, schema.get("items", {}), f"{path}[{index}]"))
    elif kind == "string":
        if not isinstance(value, str):
            return [f"{path}: string"]
        if not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", 10**9):
            errors.append(f"{path}: length")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: pattern")
    elif kind == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            return [f"{path}: integer"]
        if not schema.get("minimum", -(10**9)) <= value <= schema.get("maximum", 10**9):
            errors.append(f"{path}: range")
    return errors


def _bundled() -> dict[str, Any]:
    return json.loads(bundled_catalog_text())


def _catalog(data: dict[str, Any]) -> DateIdeaCatalog:
    return DateIdeaCatalog(parse_catalog(json.dumps(data)))


def test_capability_is_a_central_premium_capability() -> None:
    assert Capability.PLANNING_DATE_INSPIRATION.value == "planning.date_inspiration"
    assert Capability.PLANNING_DATE_INSPIRATION.value in ALL_PREMIUM_CAPABILITIES


def test_bundled_catalog_is_the_valid_editorial_handoff() -> None:
    data = _bundled()
    assert _schema_errors(data, SCHEMA) == []
    catalog = get_catalog()
    assert catalog.version == data["catalogVersion"]
    active = {idea.id for idea in catalog.data.ideas}
    retired = set(catalog.data.retired_idea_ids)
    first_edition = {f"eimir-date-{n:03d}" for n in range(1, IDEA_COUNT + 1)}
    assert len(active) == IDEA_COUNT
    assert active.isdisjoint(retired)
    assert first_edition <= active | retired


def test_models_mirror_the_handoff_schema_limits() -> None:
    idea = SCHEMA["$defs"]["idea"]["properties"]
    assert set(idea["category"]["enum"]) == {item.value for item in DateIdeaCategory}
    assert set(idea["placeType"]["enum"]) == {item.value for item in DateIdeaPlaceType}
    assert idea["minutes"]["maximum"] == MINUTES_MAX
    assert idea["budgetEurForTwo"]["maximum"] == BUDGET_MAX
    assert SCHEMA["properties"]["ideas"]["minItems"] == IDEA_COUNT


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["ideas"][1].update(id=d["ideas"][0]["id"]),
        lambda d: d["ideas"][0].update(id="eimir-date-000"),
        lambda d: d["ideas"][0].update(id="eimir-date-1000"),
        lambda d: d["retiredIdeaIds"].append(d["retiredIdeaIds"][0]),
        lambda d: d["ideas"][0].update(minutes=61),
        lambda d: d["ideas"][0].update(minutes=0),
        lambda d: d["ideas"][0].update(budgetEurForTwo=21),
        lambda d: d["ideas"][0].update(budgetEurForTwo=-1),
        lambda d: d["ideas"][0].update(minutes="40"),
        lambda d: d["ideas"][0].update(placeType="anywhere"),
        lambda d: d["ideas"][0].update(category="party"),
        lambda d: d["ideas"][0]["copy"].pop("en"),
        lambda d: d["ideas"][0]["copy"]["de"].update(title="x" * 71),
        lambda d: d["ideas"][0]["copy"]["de"].update(title="   "),
        lambda d: d["ideas"][0]["copy"]["de"].update(description="x" * 201),
        lambda d: d["ideas"][0]["copy"]["de"].update(prerequisites=["a", "b", "c", "d"]),
        lambda d: d["ideas"][0]["copy"]["de"].update(prerequisites=["a", "a"]),
        lambda d: d["ideas"][0]["copy"]["de"].pop("planTitle"),
        lambda d: d["ideas"][0].update(extra=True),
        lambda d: d["ideas"].pop(),
        lambda d: d.update(catalogVersion="2.0.0"),
        lambda d: d.update(locales=["de"]),
        lambda d: d["categoryLabels"].pop("play"),
        lambda d: d["placeTypeLabels"]["home"].update(en=""),
    ],
)
def test_invalid_catalogs_are_rejected_like_the_schema(mutate: Any) -> None:
    data = copy.deepcopy(_bundled())
    mutate(data)
    with pytest.raises(ValidationError):
        parse_catalog(json.dumps(data))
    # Duplicate IDs pass the schema itself; everything else must fail it too.
    duplicate = data["ideas"][0]["id"] == data["ideas"][1]["id"]
    assert duplicate or _schema_errors(data, SCHEMA) != []


def test_filters_combine_with_inclusive_upper_bounds() -> None:
    catalog = get_catalog()
    everything = catalog.ideas("de")

    def ids(**criteria: Any) -> list[str]:
        return [idea.id for idea in catalog.ideas("de", IdeaFilter(**criteria))]

    assert ids() == [idea.id for idea in everything]
    assert ids(max_minutes=30) == [idea.id for idea in everything if idea.minutes <= 30]
    assert any(idea.minutes == 30 for idea in catalog.ideas("de", IdeaFilter(max_minutes=30)))
    free = catalog.ideas("de", IdeaFilter(max_budget=0))
    assert free and all(idea.budget_eur_for_two == 0 for idea in free)
    assert any(
        idea.budget_eur_for_two == 10 for idea in catalog.ideas("de", IdeaFilter(max_budget=10))
    )
    combined = catalog.ideas(
        "de",
        IdeaFilter(
            category=DateIdeaCategory.NATURE,
            max_minutes=45,
            max_budget=5,
            place=DateIdeaPlaceType.OUT,
        ),
    )
    assert combined == [
        idea
        for idea in everything
        if idea.category == DateIdeaCategory.NATURE
        and idea.minutes <= 45
        and idea.budget_eur_for_two <= 5
        and idea.place_type == DateIdeaPlaceType.OUT
    ]
    anywhere = ids(place=None)
    assert set(ids(place=DateIdeaPlaceType.HOME)) | set(ids(place=DateIdeaPlaceType.OUT)) == set(
        anywhere
    )


def test_locale_resolution_never_mixes_languages() -> None:
    data = _bundled()
    catalog = _catalog(data)
    assert catalog.resolve_locale("en-GB") == "en"
    assert catalog.resolve_locale("EN_us") == "en"
    assert catalog.resolve_locale("fr") == "de"
    assert catalog.resolve_locale(None) == "de"
    first = data["ideas"][0]["copy"]
    english = catalog.ideas("en")[0]
    assert (english.title, english.wish_title, english.plan_title) == (
        first["en"]["title"],
        first["en"]["wishTitle"],
        first["en"]["planTitle"],
    )
    french = catalog.ideas(catalog.resolve_locale("fr"))[0]
    assert french.content_locale == "de"
    assert french.description == first["de"]["description"]
    assert catalog.categories("en")[0].label == (data["categoryLabels"]["food_drink"]["en"])
    assert [label.id for label in catalog.place_types("de")] == ["home", "out"]


def test_removed_ids_are_detected_for_import() -> None:
    previous = parse_catalog(bundled_catalog_text())
    assert removed_idea_ids(previous, previous) == []
    smaller = previous.model_copy(update={"ideas": previous.ideas[1:]})
    assert removed_idea_ids(previous, smaller) == ["eimir-date-001"]
    reordered = _bundled()
    reordered["ideas"].reverse()
    assert removed_idea_ids(previous, parse_catalog(json.dumps(reordered))) == []


def test_an_active_idea_cannot_reuse_a_retired_identifier() -> None:
    data = _bundled()
    data["ideas"][0]["id"] = data["retiredIdeaIds"][0]
    with pytest.raises(ValidationError, match=r"retired idea id .* cannot be active"):
        parse_catalog(json.dumps(data))
