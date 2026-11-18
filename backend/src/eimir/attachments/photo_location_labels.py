"""Localized initial names for canonical selected-photo Places.

These are product resource values, not inferred geographic descriptions.
Once saved, the ordinary Place name belongs to the couple and stays editable.
"""

PHOTO_PLACE_NAMES = {"de": "Foto-Ort", "en": "Photo location"}


def initial_photo_place_name(locale: str) -> str:
    return PHOTO_PLACE_NAMES.get(locale.split("-")[0].lower(), PHOTO_PLACE_NAMES["en"])
