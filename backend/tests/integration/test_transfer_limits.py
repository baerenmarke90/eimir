"""Production transactions and the v1 writer/reader resource contract."""

import pytest
from sqlalchemy import event, func, select

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ErrorCode
from eimir.media.local import LocalMediaStore
from eimir.transfer import archive, jobs, service
from eimir.transfer.models import ExportStatus, TransferImport, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def _identity(maker):
    with maker.begin() as session:
        user = make_account(session)
        space = make_space(session, user)
        return AuthorizationContext(account_id=user.id, space_id=space.id), sign_in(session, user)


@pytest.mark.parametrize(
    "resource",
    [
        None,
        "MAX_ENTRIES",
        "MAX_COMPRESSED_BYTES",
        "MAX_JSON_BYTES",
        "MAX_ENTRY_BYTES",
        "MAX_UNCOMPRESSED_BYTES",
    ],
)
def test_worker_only_publishes_importable_archives(
    production_client, monkeypatch, tmp_path, resource
):
    _, maker = production_client
    context, _ = _identity(maker)
    store = LocalMediaStore(tmp_path)
    monkeypatch.setattr(jobs, "get_media_store", lambda: store)
    if resource:
        monkeypatch.setattr(archive, resource, 1)
    else:
        monkeypatch.setattr(archive, "MAX_COMPRESSION_RATIO", 2)
    with maker.begin() as session:
        transfer = service.create_export(session, context, TransferScope.SHARED)
        jobs.handle_export(session, {"exportId": str(transfer.id)})
        key = service.export_storage_key(transfer)
        if resource:
            assert transfer.status == ExportStatus.FAILED.value
            assert transfer.error_code == ErrorCode.TRANSFER_TOO_LARGE
            assert not store.exists(key)
        else:
            assert transfer.status == ExportStatus.READY.value
            with store.open(key) as body:
                bundle = archive.validate_zip(body, compressed_size=transfer.artifact_size)
            assert bundle.manifest["sourceSpaceId"] == str(context.space_id)


@pytest.mark.parametrize("failure", ["store", "commit"])
def test_import_failure_revokes_staged_object_and_status(
    production_client, monkeypatch, tmp_path, failure
):
    client, maker = production_client
    context, token = _identity(maker)
    store = LocalMediaStore(tmp_path)
    keys = []

    original = store.put

    def put(key, source, content_type):
        result = original(key, source, content_type)
        keys.append(key)
        if failure == "store":
            raise OSError("fixture storage failure")
        return result

    def before_commit(session):
        if failure == "commit" and keys and session.info.get("eimir.after_rollback"):
            raise OSError("fixture commit failure")

    monkeypatch.setattr(store, "put", put)
    monkeypatch.setattr(service, "get_media_store", lambda: store)
    event.listen(maker.class_, "before_commit", before_commit)
    try:
        resp = client.post(
            f"/api/v1/spaces/{context.space_id}/transfer/imports",
            headers=auth(token) | {"Content-Type": "application/zip"},
            content=b"staging fixture",
        )
    finally:
        event.remove(maker.class_, "before_commit", before_commit)
    assert resp.status_code == 500
    assert len(keys) == 1 and not store.exists(keys[0])
    with maker.begin() as session:
        assert session.scalar(select(func.count()).select_from(TransferImport)) == 0
