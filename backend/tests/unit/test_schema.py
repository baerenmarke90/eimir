"""Serialization boundary: camelCase externally, snake_case internally."""

from __future__ import annotations

from eimir.api.schema import ApiModel, to_camel


class Example(ApiModel):
    space_id: str
    happened_on: str | None = None
    title: str = ""


class TestToCamel:
    def test_converts(self) -> None:
        assert to_camel("space_id") == "spaceId"
        assert to_camel("happened_on") == "happenedOn"
        assert to_camel("crypto_version") == "cryptoVersion"

    def test_leaves_single_words_unchanged(self) -> None:
        assert to_camel("title") == "title"


class TestApiModel:
    def test_outputs_camel_case(self) -> None:
        output = Example(space_id="s1", happened_on="2026-08-23").model_dump(by_alias=True)
        assert set(output) == {"spaceId", "happenedOn", "title"}

    def test_accepts_camel_case(self) -> None:
        model = Example.model_validate({"spaceId": "s1", "happenedOn": "2026-08-23"})
        assert model.space_id == "s1"

    def test_also_accepts_internal_name(self) -> None:
        """This makes constructing objects in Python code easier."""
        assert Example(space_id="s1").space_id == "s1"
