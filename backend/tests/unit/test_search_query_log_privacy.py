"""Search query text must never reach an HTTP access-log sink.

`docs/m4/SEARCH-DESIGN.md` SS11 forbids logging Search query text. Application
logging is covered by the ASGI middleware tests and the caplog-based search
tests; this file covers the two boundaries those cannot reach on their own:
the shipped reverse-proxy config (issue #696), and the request-logging
middleware's own emitted record shape.
"""

from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from eimir.main import create_app

NGINX_CONF = Path(__file__).parents[3] / "web" / "nginx.conf"


def test_shipped_nginx_config_disables_access_log_for_the_api_proxy() -> None:
    """The stock nginx `main` log format records "$request", the full
    request line including the query string. Any Search `q=<private text>`
    value routed through this proxy hop would otherwise be written to
    nginx's access log by default, independent of anything the application
    itself does.
    """
    text = NGINX_CONF.read_text(encoding="utf-8")
    _, _, after_api_location = text.partition("location /api/ {")
    assert after_api_location, "location /api/ block not found in web/nginx.conf"

    block, _, _ = after_api_location.partition("}")
    assert "access_log off;" in block, (
        "web/nginx.conf's /api/ proxy location must disable access logging "
        "so query strings (e.g. Search q=) are never written to nginx's "
        "access log."
    )


def test_request_logging_middleware_emits_path_only_never_the_query_string(caplog) -> None:  # type: ignore[no-untyped-def]
    """Drives a real request with a private-text canary in its query string
    through the actual ASGI middleware stack (not a unit-level call into the
    middleware), and asserts the emitted access-log record contains only the
    path, never the query string.
    """
    import logging

    canary = "private-search-canary-nginx-and-middleware-boundary"

    with (
        TestClient(create_app(), raise_server_exceptions=False) as client,
        caplog.at_level(logging.INFO, logger="eimir.access"),
    ):
        client.get(
            "/api/v1/health",
            params={"q": canary, "unrelated": "value"},
        )

    access_records = [record for record in caplog.records if record.name == "eimir.access"]
    assert access_records, "expected the request-logging middleware to emit a record"
    for record in access_records:
        assert canary not in record.getMessage()
        assert getattr(record, "http_path", "") == "/api/v1/health"
