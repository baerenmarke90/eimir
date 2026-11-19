"""Bounds and endpoint validation for optional server-local inference."""

from types import SimpleNamespace

import httpx
import pytest

from eimir import local_ai


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


@pytest.mark.parametrize(
    "status,content,expected",
    [
        (503, b"{}", None),
        (200, b"[]", None),
        (200, b"null", None),
        (200, b"not json", None),
        (200, b'{"done":false}', None),
        (200, b'{"done":true,"done_reason":"length","message":{"content":"{}"}}', None),
        (
            200,
            b'{"done":true,"message":{"content":"{}"}}',
            {"done": True, "message": {"content": "{}"}},
        ),
    ],
)
def test_local_model_checks_the_response_envelope(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    content: bytes,
    expected: dict[str, object] | None,
) -> None:
    monkeypatch.setattr(
        local_ai,
        "get_settings",
        lambda: SimpleNamespace(
            recap_ai_url="http://recap-ai:11434",
            recap_ai_timeout_seconds=5,
        ),
    )
    actual = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == "http://recap-ai:11434/api/chat"
        return httpx.Response(status, content=content)

    transport = httpx.MockTransport(respond)
    monkeypatch.setattr(
        local_ai.httpx, "Client", lambda **kwargs: actual(transport=transport, **kwargs)
    )
    assert local_ai.query_structured({"model": "test"}, timeout_limit=3) == expected
