"""A Space whose media exceeds the bundle budget fails its export visibly (#2158 follow-up).

Photos and videos do not compress, so the 512 MiB compressed-bundle budget is hit
by the media alone, well below the Cloud storage quota. The export job records a
handled failure, which the Job list shows as succeeded. These tests pin what a
member and an operator can see of that failure: the stored error code, the API
detail and a content-free worker log line.
"""

from __future__ import annotations

import pytest

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ErrorCode
from eimir.media.local import LocalMediaStore
from eimir.relationship import service as relationship_service
from eimir.transfer import archive, jobs, service
from eimir.transfer.models import ExportStatus, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_transfer_video_gate import _image, _memory

pytestmark = [pytest.mark.integration, requires_database]

BUDGET = 4 * 1024


def _media_space(production_client):  # type: ignore[no-untyped-def]
    """Commit a Space with twelve photos in one memory, through the real request path."""
    client, maker = production_client
    with maker.begin() as session:
        anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        token = sign_in(session, anna)
        context = AuthorizationContext(account_id=anna.id, space_id=space.id)
    photos = []
    for _ in range(12):
        with maker.begin() as session:
            photos.append(_image(client, space.id, token, session))
    _memory(client, space.id, token, "A day at the lake", photos)
    return maker, client, context, token


def _capture_warnings(monkeypatch, *loggers):  # type: ignore[no-untyped-def]
    """Record ``(message, extra)`` for each warning the given loggers emit.

    ``caplog`` cannot positively capture ``eimir.*`` records here: importing
    ``eimir.main`` reconfigures the root logger, so the logger methods are
    observed directly, as ``test_observability_failure_diagnostics`` does.
    """
    captured: list[tuple[str, dict[str, object]]] = []

    def record(message, *args, **kwargs):  # type: ignore[no-untyped-def]
        captured.append((message % args if args else message, kwargs.get("extra", {})))

    for logger in loggers:
        monkeypatch.setattr(logger, "warning", record)
    return captured


def test_export_over_the_compressed_budget_fails_with_a_visible_cause(
    production_client, monkeypatch, tmp_path
) -> None:
    maker, client, context, token = _media_space(production_client)
    store = LocalMediaStore(tmp_path)
    monkeypatch.setattr(jobs, "get_media_store", lambda: store)

    # Control: the same Space exports fine within the production budget.
    with maker.begin() as session:
        ready = service.create_export(session, context, TransferScope.SHARED)
        jobs.handle_export(session, {"exportId": str(ready.id)})
        assert ready.status == ExportStatus.READY.value
        assert (ready.artifact_size or 0) > BUDGET

    monkeypatch.setattr(archive, "MAX_COMPRESSED_BYTES", BUDGET)
    with maker.begin() as session:
        failing = service.create_export(session, context, TransferScope.SHARED)
        warnings = _capture_warnings(monkeypatch, archive.log, jobs.log)
        jobs.handle_export(session, {"exportId": str(failing.id)})
        failing_id = failing.id
        status, error_code = failing.status, failing.error_code
        key = service.export_storage_key(failing)

    assert status == ExportStatus.FAILED.value
    assert error_code == ErrorCode.TRANSFER_TOO_LARGE
    assert not store.exists(key)

    path = f"/api/v1/spaces/{context.space_id}/transfer/exports/{failing_id}"
    detail = client.get(path, headers=auth(token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "FAILED"
    assert detail.json()["errorCode"] == ErrorCode.TRANSFER_TOO_LARGE

    records = dict(warnings)
    limit = records["transfer export exceeds a bundle limit"]
    assert (limit["limit"], limit["maximum_bytes"]) == ("compressed", BUDGET)
    assert limit["observed_bytes"] > BUDGET  # type: ignore[operator]
    refused = records["transfer export failed"]
    assert refused["error_code"] == ErrorCode.TRANSFER_TOO_LARGE
    assert refused["transfer_id"] == str(failing_id)
    assert "lake" not in repr(warnings)  # no private content in the log
