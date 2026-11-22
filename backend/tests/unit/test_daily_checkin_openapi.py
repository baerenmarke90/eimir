"""Privacy and concurrency shape of the Daily Check-in OpenAPI contract."""

from eimir.main import create_app
from tests.support.plugins import plugins_loaded

CORE_DAILY_PATHS = {
    "/api/v1/spaces/{spaceId}/daily-check-in/today",
    # Clearing a retained rating is Free, so the rating route stays Core.
    "/api/v1/spaces/{spaceId}/daily-check-in/weekly-feedback/{recommendationKey}",
}
PRO_DAILY_PATHS = {
    "/api/v1/spaces/{spaceId}/daily-check-in/insights",
    "/api/v1/spaces/{spaceId}/daily-check-in/weekly-review",
    "/api/v1/spaces/{spaceId}/daily-check-in/weekly-brief",
}


def test_daily_check_in_contract_has_reveal_aware_today_and_insights_routes() -> None:
    schema = create_app().openapi()
    daily_paths = {path for path in schema["paths"] if "daily-check-in" in path}
    # The insight routes are Pro plugin code (Decision 0017).
    pro = plugins_loaded()
    assert daily_paths == (CORE_DAILY_PATHS | PRO_DAILY_PATHS if pro else CORE_DAILY_PATHS)
    today_route = schema["paths"]["/api/v1/spaces/{spaceId}/daily-check-in/today"]
    assert set(today_route) == {"get", "patch"}
    if_match = next(
        parameter
        for parameter in today_route["patch"]["parameters"]
        if parameter["name"] == "If-Match"
    )
    assert if_match["required"] is True

    if pro:
        insights_route = schema["paths"]["/api/v1/spaces/{spaceId}/daily-check-in/insights"]
        assert set(insights_route) == {"get"}


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
    assert set(update["properties"]) == {"energyLevel", "vibe", "vibeNote"}
    vibe_note = update["properties"]["vibeNote"]
    vibe_note_string = next(
        variant for variant in vibe_note["anyOf"] if variant.get("type") == "string"
    )
    assert vibe_note_string["maxLength"] == 200

    vibe = schema["components"]["schemas"]["DailyVibe"]
    assert vibe["enum"] == [
        "VERY_GOOD",
        "GOOD",
        "OKAY",
        "STRESSED",
        "SAD",
        "NEEDS_CONNECTION",
        "NEEDS_SPACE",
    ]

    own = schema["components"]["schemas"]["DailyCheckInOwnView"]
    assert set(own["properties"]) == {"version", "energyLevel", "vibe", "vibeNote"}

    today_vibe = schema["components"]["schemas"]["DailyCheckInVibeView"]
    assert set(today_vibe["properties"]) == {
        "visibilityMode",
        "partner",
        "partnerNote",
    }

    if plugins_loaded():
        # The insight views are part of the Pro plugin's routes.
        insight_day = schema["components"]["schemas"]["DailyCheckInInsightDayView"]
        assert "vibeNote" not in insight_day["properties"]
        assert "partnerNote" not in insight_day["properties"]
