"""Validation and normalization of the optional Wish web link.

The link is authored content that only ever leaves the server as a string the
client renders as an ordinary anchor. The server never fetches it, so there is
no preview, no redirect following, and no server-side request forgery surface.
Only plain ``http``/``https`` addresses with a host are accepted: schemes such
as ``javascript:``/``file:``/``data:`` and embedded credentials are rejected.
"""

from __future__ import annotations

import unicodedata
from urllib.parse import urlsplit, urlunsplit

MAX_LINK_LENGTH = 2048
ALLOWED_SCHEMES = frozenset({"http", "https"})


def normalize_link(value: str | None) -> str | None:
    """Return the canonical link, ``None`` for blank input, or raise ``ValueError``.

    The scheme and host are lower-cased; path, query, and fragment are kept as
    typed. Idempotent: normalizing an already normalized link returns it
    unchanged.
    """
    if value is None:
        return None
    link = value.strip()
    if not link:
        return None
    if len(link) > MAX_LINK_LENGTH:
        raise ValueError(f"link must not exceed {MAX_LINK_LENGTH} characters")
    if any(char.isspace() or unicodedata.category(char) == "Cc" for char in link):
        raise ValueError("link must not contain whitespace or control characters")
    if "\\" in link:
        raise ValueError("link must not contain backslashes")
    try:
        parts = urlsplit(link)
        port = parts.port
    except ValueError as error:
        raise ValueError("link is not a valid web address") from error
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError("link must start with http:// or https://")
    host = parts.hostname
    if not host:
        raise ValueError("link must contain a host")
    if "@" in parts.netloc:
        raise ValueError("link must not contain credentials")
    # ``hostname`` strips the brackets of an IPv6 literal and lower-cases the host.
    rendered_host = f"[{host}]" if ":" in host else host
    netloc = rendered_host if port is None else f"{rendered_host}:{port}"
    normalized = urlunsplit((parts.scheme.lower(), netloc, parts.path, parts.query, parts.fragment))
    if len(normalized) > MAX_LINK_LENGTH:
        raise ValueError(f"link must not exceed {MAX_LINK_LENGTH} characters")
    return normalized
