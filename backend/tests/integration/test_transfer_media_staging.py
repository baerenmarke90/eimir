"""Verify encrypted transfer storage after rolling a real upload into its private spool."""

import pytest

from eimir.authorization import AuthorizationContext
from eimir.media.local import LocalMediaStore
from eimir.transfer import archive, service
from eimir.transfer.models import TransferImport
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def test_large_staged_transfer_only_reaches_the_store_as_ciphertext(
    production_client, monkeypatch, tmp_path
):
    import hashlib
    import io
    import wave
    from uuid import UUID, uuid4
    from zipfile import ZIP_STORED, ZipFile

    from eimir.media.encrypted import MAGIC, EncryptingMediaStore
    from eimir.security.keyring import EncryptionMode
    from tests.support.encryption import key_ring

    client, maker = production_client
    with maker.begin() as session:
        user = make_account(session)
        space = make_space(session, user)
        context = AuthorizationContext(account_id=user.id, space_id=space.id)
        token = sign_in(session, user)
    raw = LocalMediaStore(tmp_path)
    sealed = EncryptingMediaStore(raw, key_ring(), EncryptionMode.REQUIRED)
    monkeypatch.setattr(service, "get_media_store", lambda: sealed)
    with io.BytesIO() as sound, io.BytesIO() as body:
        with wave.open(sound, "wb") as recording:
            recording.setparams((2, 2, 48000, 0, "NONE", "not compressed"))
            for _ in range(93):
                recording.writeframes(b"\x00" * (48000 * 4))
        name = f"media/{uuid4()}/original"
        audio = sound.getvalue()
        with ZipFile(body, "w", compression=ZIP_STORED) as bundle:
            bundle.writestr(name, audio)
            bundle.writestr(
                "manifest.json",
                archive.manifest_bytes(
                    exported_at="2026-11-19T00:00:00Z",
                    application_version="1",
                    scope="PERSONAL",
                    source_space_id=str(context.space_id),
                    exported_by_source_id=str(context.account_id),
                    personal_owner_source_id=str(context.account_id),
                    checksums={name: hashlib.sha256(audio).hexdigest()},
                ),
            )
        content = body.getvalue()
        assert len(content) > 16 * 1024**2
        assert name in archive.validate_zip(body, compressed_size=len(content)).entries
        response = client.post(
            f"/api/v1/spaces/{context.space_id}/transfer/imports",
            headers=auth(token) | {"Content-Type": "application/zip"},
            content=content,
        )
    assert response.status_code == 202
    with maker.begin() as session:
        transfer = session.get(TransferImport, UUID(response.json()["id"]))
        key = service.import_storage_key(transfer)
        assert transfer.artifact_size == len(content)
    with raw.open(key) as ciphertext, sealed.open(key) as plaintext:
        assert ciphertext.read(len(MAGIC)) == MAGIC
        assert hashlib.file_digest(plaintext, "sha256").digest() == hashlib.sha256(content).digest()
