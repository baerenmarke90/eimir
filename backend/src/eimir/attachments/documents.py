"""Identify opaque PDF uploads and prepare their display names."""

import re
import unicodedata

from eimir.attachments.limits import DOCUMENT_MAX_SIZE

_HEADER = re.compile(rb"%PDF-(?:1\.[0-7]|2\.0)[\r\n]")
_TRAILER = re.compile(rb"startxref[ \t\r\n]+([0-9]{1,10})[ \t\r\n]+%%EOF[ \t\r\n]*\Z")
_XREF_STREAM_OBJECT = re.compile(rb"[0-9]+[ \t\r\n]+[0-9]+[ \t\r\n]+obj\b")


def is_pdf(data: bytes) -> bool:
    """Check the PDF header and cross-reference trailer without interpreting content."""
    if len(data) > DOCUMENT_MAX_SIZE or not _HEADER.match(data):
        return False
    trailer = _TRAILER.search(data[-4096:])
    if trailer is None:
        return False
    offset = int(trailer[1])
    if not 0 < offset < len(data) - len(trailer[0]):
        return False
    return data.startswith((b"xref\n", b"xref\r"), offset) or bool(
        _XREF_STREAM_OBJECT.match(data, offset, offset + 64)
    )


def display_name(original_name: str) -> str:
    leaf = original_name.replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(char for char in leaf if not unicodedata.category(char).startswith("C"))
    name = name.strip(" .") or "document"
    if name.lower().endswith(".pdf"):
        return name
    return name[:251] + ".pdf"
