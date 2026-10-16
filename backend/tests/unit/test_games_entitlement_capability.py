"""Focused coverage for the shared Premium Games capability."""

from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES


def test_couple_games_is_a_central_premium_capability() -> None:
    assert Capability.GAMES_COUPLE.value == "games.couple"
    assert Capability.GAMES_COUPLE.value in ALL_PREMIUM_CAPABILITIES
