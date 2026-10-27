"""Localized initial labels for machine-created photo places.

Canonical clients translate the generated-label marker at presentation time.
The stored initial name also needs the author's locale for generic search,
dashboard and export consumers that read the protected Place name directly.
"""

_PHOTO_PLACE_NAMES = {"de": "Aufnahmeort", "en": "Photo location"}


def photo_place_name(locale: str) -> str:
    language = locale.strip().replace("_", "-").split("-", 1)[0].lower()
    return _PHOTO_PLACE_NAMES.get(language, _PHOTO_PLACE_NAMES["en"])
