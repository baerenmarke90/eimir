"""Unit tests for the #1151 Today Pro capabilities."""

from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES


def test_today_pro_capabilities_are_central_premium_capabilities() -> None:
    assert Capability.DAILY_INSIGHTS.value == "daily.insights"
    assert Capability.DAILY_INSIGHTS.value in ALL_PREMIUM_CAPABILITIES

    assert Capability.DAILY_QUOTE.value == "daily.quote"
    assert Capability.DAILY_QUOTE.value in ALL_PREMIUM_CAPABILITIES
