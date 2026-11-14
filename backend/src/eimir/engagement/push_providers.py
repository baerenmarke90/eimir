"""Shared API/worker composition of configured push transports."""

from __future__ import annotations

from eimir.config import Settings
from eimir.engagement import apns_push, fcm_push, push, unified_push


def configure_push_providers(settings: Settings) -> None:
    """Replace only configured transport entries; keep unrelated adapters intact."""
    unified = (
        unified_push.UnifiedPushProvider(settings)
        if settings.push_webpush_allowed_origins
        else None
    )
    browser = (
        unified_push.UnifiedPushProvider(settings, browser=True)
        if settings.push_browser_allowed_origins
        else None
    )
    fcm = fcm_push.FcmPushProvider(settings) if settings.push_fcm_project_id else None
    apns = apns_push.ApnsPushProvider(settings) if settings.push_apns_bundle_id else None
    for key, provider in (
        (unified_push.PROVIDER_KEY, unified),
        (unified_push.BROWSER_PROVIDER_KEY, browser),
        (fcm_push.PROVIDER_KEY, fcm),
        (apns_push.PROVIDER_KEY, apns),
    ):
        previous = push.providers.unregister(key)
        if isinstance(previous, (fcm_push.FcmPushProvider, apns_push.ApnsPushProvider)):
            previous.close()
        if provider is not None:
            push.providers.register(key, provider)
