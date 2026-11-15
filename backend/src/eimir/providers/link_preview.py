"""Explicit text-only link metadata over the existing public pinned transport."""

from __future__ import annotations

import time
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote, urlsplit, urlunsplit

from eimir.providers.photo_transport import PhotoSourceError, PhotoSourceHttp


@dataclass(frozen=True)
class LinkMetadata:
    title: str | None
    description: str | None


def _text(value: str, limit: int) -> str | None:
    visible = "".join(
        " " if c.isspace() else c
        for c in value
        if c.isspace() or not unicodedata.category(c).startswith("C")
    )
    return " ".join(visible.split())[:limit] or None


class _MetadataParser(HTMLParser):
    """Read only inert title/meta text; never follow canonical/image URLs."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.in_title = False
        self.finished_head = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "body":
            self.finished_head = True
        if self.finished_head:
            return
        if tag == "title":
            self.in_title = True
        if tag == "meta":
            values = dict(attrs)
            key = (values.get("property") or values.get("name") or "").lower()
            content = values.get("content")
            if key in {"og:title", "og:description", "description"} and content:
                self.meta.setdefault(key, content)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        if tag == "head":
            self.finished_head = True

    def handle_data(self, data: str) -> None:
        if self.in_title and not self.finished_head:
            self.title_parts.append(data)

    def result(self) -> LinkMetadata:
        return LinkMetadata(
            _text(self.meta.get("og:title") or "".join(self.title_parts), 200),
            _text(self.meta.get("og:description") or self.meta.get("description", ""), 360),
        )


def resolve_link_metadata(url: str) -> LinkMetadata | None:
    """One anonymous HTTPS request, no redirects, assets, persistence or URL logs.

    PhotoSourceHttp already pins a public DNS answer to the TLS-verified host,
    rejects private/mixed answers, and bounds DNS, headers, bytes and total time.
    Only this submitted URL is sent; no authored description/comment is needed.
    """
    try:
        if len(url) > 2048 or any(ord(c) < 32 or ord(c) == 127 for c in url):
            return None
        parts = urlsplit(url)
        if (
            parts.scheme != "https"
            or parts.username is not None
            or parts.password is not None
            or not parts.hostname
            or parts.port not in {None, 443}
        ):
            return None
        hostname = parts.hostname.encode("idna").decode("ascii").lower()
        transport = PhotoSourceHttp(f"https://{hostname}", {})
        path = urlunsplit(
            (
                "",
                "",
                quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~"),
                quote(parts.query, safe="/?%:@!$&'()*+,;=-._~"),
                "",
            )
        )
        content = transport.request(
            "GET",
            path,
            limit=512 * 1024,
            mime_types={"text/html", "application/xhtml+xml"},
            deadline=time.monotonic() + 6.0,
        )
        parser = _MetadataParser()
        # UTF-8 is the HTML default for modern destinations. Malformed bytes
        # remain inert replacement text rather than introducing a decoder.
        parser.feed(content.decode("utf-8", errors="replace"))
        parser.close()
        result = parser.result()
        return result if result.title or result.description else None
    except (PhotoSourceError, ValueError, UnicodeError, AssertionError):
        return None
