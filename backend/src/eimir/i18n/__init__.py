"""Bundled recipient-language resolution, independent of actor and request state."""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from functools import cache
from importlib.resources import files
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from eimir.identity.models import Account

DEFAULT_LOCALE = "de"


@cache
def catalogs() -> dict[str, dict[str, str]]:
    """Adding a locale requires a complete catalog, never new delivery branches."""
    resource = files(__package__).joinpath("locales")
    return {
        entry.name.removesuffix(".json"): json.loads(entry.read_text(encoding="utf-8"))
        for entry in resource.iterdir()
        if entry.name.endswith(".json")
    }


def supported_locale(value: str) -> str | None:
    normalized = value.strip().replace("_", "-").lower()
    # Exact tags take priority, allowing future regional/script-specific packs.
    while normalized:
        registered = next((code for code in catalogs() if code.lower() == normalized), None)
        if registered is not None:
            return registered
        normalized = normalized.rpartition("-")[0]
    return None


def detect_locale(languages: Iterable[str]) -> str:
    return next(
        (locale for value in languages if (locale := supported_locale(value))), DEFAULT_LOCALE
    )


def request_locale(header: str | None) -> str:
    """Bounded HTTP language negotiation for mail before an Account exists."""
    candidates: list[tuple[float, str]] = []
    for entry in (header or "")[:1024].split(",")[:20]:
        language, _, parameters = entry.strip().partition(";")
        try:
            quality = float(parameters.strip().removeprefix("q=")) if parameters else 1.0
        except ValueError:
            continue
        if math.isfinite(quality) and 0 < quality <= 1:
            candidates.append((quality, language))
    candidates.sort(key=lambda value: -value[0])
    return detect_locale(language for _, language in candidates)


def account_locale(account: Account) -> str:
    preference = getattr(account, "language_preference", "auto")
    value = account.locale if preference == "auto" else preference
    return supported_locale(value or "") or DEFAULT_LOCALE


def text(key: str, locale: str, **values: str) -> str:
    language = supported_locale(locale) or DEFAULT_LOCALE
    template = catalogs()[language].get(key, catalogs()[DEFAULT_LOCALE][key])
    return template.format_map(values)
