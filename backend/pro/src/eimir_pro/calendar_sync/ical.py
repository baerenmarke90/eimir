"""RFC 5545 rendering of one eimir.-managed event (#1895).

Mirrors the reviewed Web handoff contract (``web/src/client/planCalendar.ts``):
one VEVENT, TEXT escaping so content never becomes a property, line folding
on character boundaries at 75 octets, DATE values for date-only Plans and UTC
instants for timed Plans.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from urllib.parse import quote

from eimir.core import clock
from eimir_pro.providers.calendar import CalendarEvent

PRODUCT_ID = "-//eimir.//Calendar sync//EN"


def _text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\r\n", "\\n")
        .replace("\r", "\\n")
        .replace("\n", "\\n")
        .replace(";", r"\;")
        .replace(",", "\\,")
    )


def _fold(line: str) -> str:
    result: list[str] = []
    size = 0
    for char in line:
        width = len(char.encode())
        if size + width > 75:
            result.append("\r\n ")
            size = 1
        result.append(char)
        size += width
    return "".join(result)


def _instant(value: datetime) -> str:
    return clock.ensure_utc(value).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _day(value: date) -> str:
    return value.strftime("%Y%m%d")


def render(event: CalendarEvent, *, stamp: datetime | None = None) -> bytes:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODUCT_ID}",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{_text(event.uid)}",
        f"DTSTAMP:{_instant(stamp or clock.now())}",
        f"SEQUENCE:{event.sequence}",
        f"SUMMARY:{_text(event.title)}",
    ]
    if event.start_date is not None and event.end_date is not None:
        lines += [
            f"DTSTART;VALUE=DATE:{_day(event.start_date)}",
            f"DTEND;VALUE=DATE:{_day(event.end_date)}",
        ]
    elif event.start is not None:
        lines.append(f"DTSTART:{_instant(event.start)}")
        if event.end is not None:
            lines.append(f"DTEND:{_instant(event.end)}")
    else:
        raise ValueError("A calendar event needs a start.")
    if event.backlink is not None:
        # Use the inline HTML form understood by clients such as Thunderbird.
        html = quote(event.backlink.html_description(event.description), safe="")
        plain = _text(event.backlink.plain_description(event.description))
        lines.append(f'DESCRIPTION;ALTREP="data:text/html,{html}":{plain}')
        lines.append(f"URL:{event.backlink.url}")
    elif event.description:
        lines.append(f"DESCRIPTION:{_text(event.description)}")
    if event.location:
        lines.append(f"LOCATION:{_text(event.location)}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return ("\r\n".join(_fold(line) for line in lines) + "\r\n").encode()
