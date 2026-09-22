from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES


def test_partner_quick_actions_are_a_central_premium_capability() -> None:
    assert Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value == "partner.quick_actions.extended"
    assert Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value in ALL_PREMIUM_CAPABILITIES
