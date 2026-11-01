"""Shared API/worker composition of configured push transports."""

from __future__ import annotations

from eimir.config import Settings
from eimir.engagement import fcm_push, push, unified_push


def configure_push_providers(settings: Settings) -> None:
    """Replace only configured transport entries; keep unrelated adapters intact."""
    unified = (
        unified_push.UnifiedPushProvider(settings)
        if settings.push_vapid_private_key is not None
        else None
    )
    fcm = fcm_push.FcmPushProvider(settings) if settings.push_fcm_project_id else None
    for key, provider in ((unified_push.PROVIDER_KEY, unified), (fcm_push.PROVIDER_KEY, fcm)):
        previous = push.providers.unregister(key)
        if isinstance(previous, fcm_push.FcmPushProvider):
            previous.close()
        if provider is not None:
            push.providers.register(key, provider)
