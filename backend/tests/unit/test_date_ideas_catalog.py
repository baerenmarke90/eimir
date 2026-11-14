"""Catalog schema, validation, filtering and locale resolution for date inspiration."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from pydantic import ValidationError

from eimir.date_ideas.catalog import (
    BudgetBand,
    DateIdeaCatalog,
    DateSetting,
    DurationBand,
    IdeaFilter,
    SettingFilter,
    budget_band,
    bundled_catalog_text,
    canonical_json,
    duration_band,
    get_catalog,
    parse_catalog,
    removed_idea_ids,
)
from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES


def _idea(idea_id: str, **overrides: Any) -> dict[str, Any]:
    idea: dict[str, Any] = {
        "id": idea_id,
        "sortKey": 10,
        "category": "cozy",
        "durationMinutes": {"min": 30, "max": 60},
        "budgetForTwo": {"min": 0, "max": 0},
        "setting": "HOME",
        "content": {
            "de": {"title": f"Titel {idea_id}", "description": "Beschreibung."},
            "en": {"title": f"Title {idea_id}", "description": "Description."},
        },
    }
    idea.update(overrides)
    return idea


def _catalog(*ideas: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "schemaVersion": 1,
        "catalogVersion": "test.1",
        "edition": "development",
        "defaultLocale": "de",
        "locales": ["de", "en"],
        "currency": "EUR",
        "categories": [
            {"id": "cozy", "labels": {"de": "Gemütlich", "en": "Cozy"}},
            {"id": "outdoors", "labels": {"de": "Draußen"}},
        ],
        "ideas": list(ideas) or [_idea("first-idea")],
    }
    data.update(overrides)
    return data


def _parse(data: dict[str, Any]) -> DateIdeaCatalog:
    return DateIdeaCatalog(parse_catalog(json.dumps(data)))


def test_capability_is_a_central_premium_capability() -> None:
    assert Capability.PLANNING_DATE_INSPIRATION.value == "planning.date_inspiration"
    assert Capability.PLANNING_DATE_INSPIRATION.value in ALL_PREMIUM_CAPABILITIES


def test_bundled_catalog_is_valid_and_marked_as_development_dataset() -> None:
    catalog = get_catalog()
    assert catalog.edition == "development"
    assert catalog.data.schema_version == 1
    ideas = catalog.ideas("de")
    assert 0 < len(ideas) < 200, "the development dataset must not pose as the final catalog"
    # Every bundled idea is fully translated into every listed locale.
    for idea in catalog.data.ideas:
        assert set(idea.content) == set(catalog.data.locales)
    for category in catalog.data.categories:
        assert set(category.labels) == set(catalog.data.locales)


def test_bundled_catalog_is_stored_in_canonical_form() -> None:
    assert canonical_json(parse_catalog(bundled_catalog_text())) == bundled_catalog_text()


@pytest.mark.parametrize(
    ("minutes", "band"),
    [
        (5, DurationBand.SHORT),
        (90, DurationBand.SHORT),
        (91, DurationBand.EVENING),
        (240, DurationBand.EVENING),
        (241, DurationBand.LONG),
        (2880, DurationBand.LONG),
    ],
)
def test_duration_bands_use_the_upper_bound(minutes: int, band: DurationBand) -> None:
    assert duration_band(minutes) is band


@pytest.mark.parametrize(
    ("amount", "band"),
    [
        (0, BudgetBand.FREE),
        (1, BudgetBand.LOW),
        (30, BudgetBand.LOW),
        (31, BudgetBand.MEDIUM),
        (80, BudgetBand.MEDIUM),
        (81, BudgetBand.HIGH),
    ],
)
def test_budget_bands_use_the_upper_bound(amount: int, band: BudgetBand) -> None:
    assert budget_band(amount) is band


def test_filters_combine_with_and_and_either_setting_matches_both() -> None:
    catalog = _parse(
        _catalog(
            _idea("home-free", sortKey=1),
            _idea("either-free", sortKey=2, setting="EITHER"),
            _idea(
                "out-paid-long",
                sortKey=3,
                setting="OUT",
                category="outdoors",
                durationMinutes={"min": 300, "max": 480},
                budgetForTwo={"min": 40, "max": 120},
            ),
            _idea("out-free", sortKey=4, setting="OUT", category="outdoors"),
        )
    )

    def ids(**criteria: Any) -> list[str]:
        return [idea.id for idea in catalog.ideas("de", IdeaFilter(**criteria))]

    assert ids() == ["home-free", "either-free", "out-paid-long", "out-free"]
    assert ids(setting=SettingFilter.HOME) == ["home-free", "either-free"]
    assert ids(setting=SettingFilter.OUT) == ["either-free", "out-paid-long", "out-free"]
    assert ids(category="outdoors") == ["out-paid-long", "out-free"]
    assert ids(category="outdoors", budget=BudgetBand.FREE) == ["out-free"]
    assert ids(category="outdoors", duration=DurationBand.LONG, budget=BudgetBand.HIGH) == [
        "out-paid-long"
    ]
    assert ids(setting=SettingFilter.HOME, duration=DurationBand.LONG) == []
    assert ids(category="unknown") == []


def test_order_is_editorial_then_id_and_inactive_ideas_are_hidden() -> None:
    catalog = _parse(
        _catalog(
            _idea("b-idea", sortKey=5),
            _idea("a-idea", sortKey=5),
            _idea("early-idea", sortKey=1),
            _idea("retired-idea", sortKey=0, active=False),
        )
    )
    assert [idea.id for idea in catalog.ideas("de")] == ["early-idea", "a-idea", "b-idea"]
    assert catalog.active_idea("retired-idea", "de") is None
    assert catalog.active_idea("a-idea", "de") is not None


def test_locale_resolution_and_content_fallback() -> None:
    german_only = _idea("german-only")
    german_only["content"] = {"de": {"title": "Nur deutsch", "description": "Text."}}
    catalog = _parse(_catalog(_idea("both"), german_only))

    assert catalog.resolve_locale("en") == "en"
    assert catalog.resolve_locale("en-GB") == "en"
    assert catalog.resolve_locale("EN_us") == "en"
    assert catalog.resolve_locale("fr") == "de"
    assert catalog.resolve_locale(None) == "de"

    english = {idea.id: idea for idea in catalog.ideas("en")}
    assert english["both"].title == "Title both"
    assert english["both"].content_locale == "en"
    assert english["german-only"].title == "Nur deutsch"
    assert english["german-only"].content_locale == "de"
    labels = {category.id: category.label for category in catalog.categories("en")}
    assert labels == {"cozy": "Cozy"}, "unused categories are omitted"


def test_category_label_falls_back_to_default_locale() -> None:
    catalog = _parse(_catalog(_idea("outside", category="outdoors")))
    assert [category.label for category in catalog.categories("en")] == ["Draußen"]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda data: data["ideas"].append(copy.deepcopy(data["ideas"][0])), "duplicate idea id"),
        (lambda data: data["ideas"][0].update(category="missing"), "unknown category"),
        (lambda data: data["ideas"][0]["content"].pop("de"), "lacks 'de' content"),
        (
            lambda data: data["ideas"][0]["content"].update(
                fr={"title": "Titre", "description": "Texte."}
            ),
            "unlisted locale 'fr'",
        ),
        (lambda data: data.update(defaultLocale="fr"), "defaultLocale must be listed"),
        (
            lambda data: data["categories"].append({"id": "cozy", "labels": {"de": "Doppelt"}}),
            "duplicate category id",
        ),
        (
            lambda data: data["ideas"][0]["content"]["de"].update(title="Tést"),
            "non-NFC",
        ),
        (
            lambda data: data["ideas"][0]["content"]["de"].update(description="Zeile\u0007"),
            "control characters",
        ),
    ],
)
def test_inconsistent_catalogs_are_rejected(mutate: Any, message: str) -> None:
    data = _catalog()
    mutate(data)
    with pytest.raises(ValidationError, match=message):
        parse_catalog(json.dumps(data))


@pytest.mark.parametrize(
    "idea_overrides",
    [
        {"id": "Upper-Case"},
        {"id": "x"},
        {"durationMinutes": {"min": 60, "max": 30}},
        {"budgetForTwo": {"min": -1, "max": 10}},
        {"setting": "SPACE"},
        {"unexpected": True},
    ],
)
def test_malformed_ideas_are_rejected(idea_overrides: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        parse_catalog(json.dumps(_catalog(_idea("valid-id", **idea_overrides))))


def test_unknown_schema_version_and_overlong_text_are_rejected() -> None:
    with pytest.raises(ValidationError):
        parse_catalog(json.dumps(_catalog(schemaVersion=2)))
    long_title = _idea("long-title")
    long_title["content"]["de"]["title"] = "x" * 81
    with pytest.raises(ValidationError):
        parse_catalog(json.dumps(_catalog(long_title)))


def test_removed_ids_are_detected_for_import() -> None:
    previous = parse_catalog(json.dumps(_catalog(_idea("kept"), _idea("dropped"))))
    retired = parse_catalog(json.dumps(_catalog(_idea("kept"), _idea("dropped", active=False))))
    dropped = parse_catalog(json.dumps(_catalog(_idea("kept"), _idea("new-one"))))
    assert removed_idea_ids(previous, retired) == []
    assert removed_idea_ids(previous, dropped) == ["dropped"]


def test_setting_values_are_stable_contract_values() -> None:
    assert [value.value for value in DateSetting] == ["HOME", "OUT", "EITHER"]
    assert [value.value for value in SettingFilter] == ["HOME", "OUT"]
