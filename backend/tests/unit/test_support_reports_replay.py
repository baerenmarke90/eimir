"""Which repeated support report requests count as the same report (#2189)."""

from __future__ import annotations

from typing import Any

from eimir.support_reports.payload import SupportReportPayload
from eimir.support_reports.service import payloads_match_for_replay


def _client(**overrides: Any) -> dict[str, Any]:
    return {
        "app_version": "0.2.0",
        "build": "123",
        "platform": "web",
        "os": "Windows",
        "engine": "Chromium 142",
        "locale": "de-DE",
        "theme": "light",
        "online": True,
        "local_time": "2026-11-23T10:15:00.123",
        "time_zone": "Europe/Berlin",
        **overrides,
    }


def _payload(**overrides: Any) -> SupportReportPayload:
    return SupportReportPayload.model_validate(
        {
            "note": "The list did not load.",
            "failure": {"reference": "GET:/api/v1/plans:500:web", "request_id": "r-1"},
            "client": _client(),
            **overrides,
        }
    )


def test_identical_payloads_match() -> None:
    assert payloads_match_for_replay(_payload(), _payload())


def test_a_newer_client_context_still_matches() -> None:
    retried = _payload(
        client=_client(local_time="2026-11-23T10:17:42.987", theme="dark", online=False)
    )
    assert payloads_match_for_replay(_payload(), retried)


def test_another_note_does_not_match() -> None:
    assert not payloads_match_for_replay(_payload(), _payload(note="Another note."))


def test_another_failure_does_not_match() -> None:
    other = _payload(failure={"reference": "GET:/api/v1/memories:503:web"})
    assert not payloads_match_for_replay(_payload(), other)
    assert not payloads_match_for_replay(_payload(), _payload(failure=None))
