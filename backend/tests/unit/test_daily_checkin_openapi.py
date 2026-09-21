"""Privacy and concurrency shape of the Daily Check-in OpenAPI contract."""

from eimir.main import create_app


def test_daily_check_in_contract_has_only_reveal_aware_today_route() -> None:
    schema = create_app().openapi()
    daily_paths = {path for path in schema["paths"] if "daily-check-in" in path}
    assert daily_paths == {"/api/v1/spaces/{spaceId}/daily-check-in/today"}
    route = schema["paths"]["/api/v1/spaces/{spaceId}/daily-check-in/today"]
    assert set(route) == {"get", "patch"}
    if_match = next(
        parameter for parameter in route["patch"]["parameters"] if parameter["name"] == "If-Match"
    )
    assert if_match["required"] is True


def test_hidden_partner_schemas_have_no_value_or_partner_metadata() -> None:
    schema = create_app().openapi()
    for name in ("PartnerEnergyHidden", "PartnerVibeHidden"):
        hidden = schema["components"]["schemas"][name]
        properties = set(hidden["properties"])
        assert properties == {"state"}
        assert properties.isdisjoint(
            {"value", "partnerId", "accountId", "version", "createdAt", "updatedAt"}
        )


def test_update_contract_exposes_only_the_typed_daily_dimensions() -> None:
    schema = create_app().openapi()
    update = schema["components"]["schemas"]["DailyCheckInUpdate"]
    assert set(update["properties"]) == {"energyLevel", "vibe"}

    vibe = schema["components"]["schemas"]["DailyVibe"]
    assert vibe["enum"] == [
        "GOOD",
        "OKAY",
        "STRESSED",
        "SAD",
        "NEEDS_CONNECTION",
        "NEEDS_SPACE",
    ]

    own = schema["components"]["schemas"]["DailyCheckInOwnView"]
    assert set(own["properties"]) == {"version", "energyLevel", "vibe"}
