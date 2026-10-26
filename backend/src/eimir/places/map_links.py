"""Allow deliberate Maps navigation without fetching user-supplied URLs."""

from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field


def validate_map_url(value: str) -> str:
    cleaned = value.strip()
    try:
        url = urlsplit(cleaned)
        valid_port = url.port in (None, 443)
    except ValueError as error:
        raise ValueError("Invalid map URL") from error
    host = url.hostname
    long_link = host in {
        "google.com",
        "www.google.com",
        "maps.google.com",
        "google.de",
        "www.google.de",
    } and (url.path == "/maps" or url.path.startswith("/maps/"))
    short_link = host == "maps.app.goo.gl" and bool(url.path.strip("/"))
    legacy_link = host == "goo.gl" and url.path.startswith("/maps/")
    if (
        len(cleaned) > 2048
        or url.scheme != "https"
        or url.username
        or url.password
        or not valid_port
        or not (long_link or short_link or legacy_link)
    ):
        raise ValueError("Use a supported HTTPS Google Maps link")
    return cleaned


MapUrl = Annotated[str, Field(max_length=2048), AfterValidator(validate_map_url)]
