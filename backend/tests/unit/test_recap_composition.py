"""Calendar truth, stable diversity and bounded local inference."""

from datetime import date
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest

from eimir.recaps import local_ai
from eimir.recaps.composition import Candidate, period_bounds, select_candidates
from eimir.recaps.models import RecapKind, RecapSourceKind


def test_closed_and_partial_periods_include_leap_day() -> None:
    assert period_bounds(RecapKind.MONTH, 2024, 2, date(2024, 3, 1)) == (
        date(2024, 2, 1),
        date(2024, 2, 29),
        False,
    )
    assert period_bounds(RecapKind.YEAR, 2026, 0, date(2026, 10, 30)) == (
        date(2026, 1, 1),
        date(2026, 10, 30),
        True,
    )
    with pytest.raises(ValueError):
        period_bounds(RecapKind.MONTH, 2026, 11, date(2026, 10, 30))


def test_annual_selection_is_stable_and_distributed_across_the_whole_year() -> None:
    items = [
        Candidate(RecapSourceKind.MEMORY, UUID(int=n + 1), date(2026, n // 10 + 1, n % 10 + 1), 1)
        for n in range(120)
    ]
    first = select_candidates(items, RecapKind.YEAR, "space:year", 0)
    assert first == select_candidates(list(reversed(items)), RecapKind.YEAR, "space:year", 0)
    assert len(first) == 8 and len({v.occurred_on.month for v in first}) == 8
    assert first != select_candidates(items, RecapKind.YEAR, "space:year", 1)


@pytest.mark.parametrize(
    "status,content",
    [
        (503, b"{}"),
        (200, b"[]"),
        (200, b"null"),
        (200, b'{"done":true,"message":{"content":"not json"}}'),
        (200, b'{"done":true,"done_reason":"length","message":{"content":"{}"}}'),
    ],
)
def test_local_model_failure_returns_the_complete_rules_fallback(monkeypatch, status, content):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        local_ai,
        "get_settings",
        lambda: SimpleNamespace(
            recap_ai_url="http://recap-ai:11434",
            recap_ai_model="qwen3:1.7b-q4_K_M",
            recap_ai_timeout_seconds=5,
        ),
    )
    actual = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(status, content=content))
    monkeypatch.setattr(
        local_ai.httpx, "Client", lambda **kwargs: actual(transport=transport, **kwargs)
    )
    assert (
        local_ai.compose([{"key": "MEMORY:test", "title": "Shared title"}], "de-DE", "2026-10")
        is None
    )


def test_local_model_never_receives_images_or_tools_and_rejects_foreign_sources(monkeypatch):  # type: ignore[no-untyped-def]
    import json

    monkeypatch.setattr(
        local_ai,
        "get_settings",
        lambda: SimpleNamespace(
            recap_ai_url="http://recap-ai:11434",
            recap_ai_model="qwen3:1.7b-q4_K_M",
            recap_ai_timeout_seconds=5,
        ),
    )
    actual = httpx.Client

    def respond(request):  # type: ignore[no-untyped-def]
        body = json.loads(request.content)
        assert body["think"] is False and body["keep_alive"] == 0
        assert "tools" not in body and "images" not in str(body)
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {
                    "content": json.dumps(
                        {
                            "title": "A title",
                            "introduction": "A short introduction",
                            "source_keys": ["FOREIGN:key"],
                        }
                    )
                },
            },
        )

    monkeypatch.setattr(
        local_ai.httpx,
        "Client",
        lambda **kwargs: actual(transport=httpx.MockTransport(respond), **kwargs),
    )
    assert (
        local_ai.compose([{"key": "MEMORY:test", "title": "Shared title"}], "de-DE", "2026-10")
        is None
    )


@pytest.mark.parametrize(
    "value",
    [
        "https://api.openai.com",
        "https://ollama.com",
        "http://8.8.8.8",
        "http://recap-ai:11434/api/chat",
        "http://user:secret@recap-ai:11434",
    ],
)
def test_only_operator_local_origins_are_accepted(value: str) -> None:
    with pytest.raises(ValueError):
        local_ai.validate_local_url(value)


def test_local_model_accepts_a_valid_bounded_narration(monkeypatch):  # type: ignore[no-untyped-def]
    import json

    monkeypatch.setattr(
        local_ai,
        "get_settings",
        lambda: SimpleNamespace(
            recap_ai_url="http://recap-ai:11434",
            recap_ai_model="qwen3:1.7b-q4_K_M",
            recap_ai_timeout_seconds=5,
        ),
    )
    actual = httpx.Client

    def respond(request):  # type: ignore[no-untyped-def]
        body = json.loads(request.content)
        assert body["options"]["num_gpu"] == 0
        assert body["options"]["num_ctx"] == 4096
        return httpx.Response(
            200,
            json={
                "done": True,
                "message": {
                    "content": json.dumps(
                        {
                            "title": "A shared afternoon",
                            "introduction": "A walk by the lake.",
                            "source_keys": ["MEMORY:test"],
                        }
                    )
                },
            },
        )

    monkeypatch.setattr(
        local_ai.httpx,
        "Client",
        lambda **kwargs: actual(transport=httpx.MockTransport(respond), **kwargs),
    )
    result = local_ai.compose(
        [{"key": "MEMORY:test", "title": "A walk by the lake"}], "en", "2026-10"
    )
    assert result and result.title == "A shared afternoon"


def test_an_alternative_differs_when_distinct_source_kinds_have_no_ties() -> None:
    items = [
        Candidate(kind, UUID(int=index + 1), date(2026, 10, index + 1), 1)
        for index, kind in enumerate(RecapSourceKind)
    ]
    baseline = select_candidates(items, RecapKind.MONTH, "space:month", 0)
    alternate = select_candidates(items, RecapKind.MONTH, "space:month", 1)
    assert len(baseline) == len(alternate) == 3
    assert baseline != alternate


@pytest.mark.parametrize(
    "title,introduction,keys",
    [
        ("A morning note", "A lovely day. Everyone was moved. The world stood still.", ["note"]),
        ("A morning note", "A note for 100 people.", ["note"]),
        ("October 2026", "A kind note.", ["note"]),
        ("A morning note", " ", ["note"]),
        ("A morning note", "A kind note.\nA new day.", ["note"]),
        ("A morning note", "A kind note.", ["note", "note"]),
        ("A morning note", "A kind note.", ["other"]),
        ("A morning note", "A kind note in the morning, a kind note in the morning.", ["note"]),
    ],
)
def test_editorial_checks_reject_unsupported_numbers_repetition_and_filler(
    title: str, introduction: str, keys: list[str]
) -> None:
    evidence = [
        {
            "key": "note",
            "title": "A kind note in the morning",
            "kind": "HEART_MOMENT",
            "occurred_on": "2026-10-26",
        },
        {"key": "other", "title": "100 people at a concert"},
    ]
    # The number in an uncited source or the date envelope cannot support prose.
    result = local_ai.Narration(title=title, introduction=introduction, source_keys=keys)
    if keys == ["other"]:
        evidence = evidence[:1]
    assert not local_ai.usable_narration(result, evidence)


def test_editorial_checks_accept_a_short_caption_using_only_cited_numbers() -> None:
    result = local_ai.Narration(
        title="An afternoon together",
        introduction="A walk by the lake. 2 notes from the afternoon.",
        source_keys=["memory"],
    )
    assert local_ai.usable_narration(
        result, [{"key": "memory", "title": "A walk by the lake", "excerpt": "2 notes"}]
    )


def test_overlong_model_prose_is_rejected_instead_of_truncated() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        local_ai.Narration(
            title="A morning note",
            introduction="A perfect day full of love and happiness. " * 8,
            source_keys=["note"],
        )
