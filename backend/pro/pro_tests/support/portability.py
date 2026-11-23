"""Helpers of the portability tests: export to bytes, import from bytes, media fixtures.

Nothing here imports the Core Transfer Bundle or its tests, so the Core feature can be removed
without touching these tests (Decision 0020).
"""

from __future__ import annotations

import hashlib
import io
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZIP_STORED, ZipFile

from eimir_pro.portability.archive import DEFAULT_LIMITS, BundleLimits
from eimir_pro.portability.common import TransferScope
from eimir_pro.portability.export import export_to_file
from eimir_pro.portability.importer import ApplyResult, apply_import_bundle, validate_import_bundle
from PIL import Image
from sqlalchemy.orm import Session

from eimir.attachments import service as attachments
from eimir.authorization import AuthorizationContext
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, sign_in


def couple(session: Session) -> dict[str, Any]:
    """Two members in one Space, signed in."""
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "context": AuthorizationContext(account_id=anna.id, space_id=space.id),
    }


def target_space(session: Session, pair: dict[str, Any]) -> AuthorizationContext:
    """An empty second Space with the same two members."""
    target = make_space(session, pair["anna"])
    relationship_service.add_member(session, target.id, pair["ben"])
    session.flush()
    return AuthorizationContext(account_id=pair["anna"].id, space_id=target.id)


def export_bytes(
    session: Session,
    context: AuthorizationContext,
    tmp_path: Path,
    scope: TransferScope = TransferScope.SHARED,
    *,
    limits: BundleLimits = DEFAULT_LIMITS,
    schema_revision: str | None = None,
) -> bytes:
    """Run the real disk export and return the file's bytes."""
    destination = tmp_path / f"bundle-{len(list(tmp_path.iterdir()))}.zip"
    export_to_file(
        session,
        context,
        scope,
        destination,
        limits=limits,
        schema_revision=schema_revision,
    )
    return destination.read_bytes()


def import_bytes(
    session: Session,
    context: AuthorizationContext,
    data: bytes,
    **options: Any,
) -> ApplyResult:
    """Validate and apply a bundle like the operator import, in the caller's transaction."""
    result = apply_import_bundle(
        session, context, io.BytesIO(data), compressed_size=len(data), **options
    )
    session.flush()
    return result


def validate_bytes(session: Session, context: AuthorizationContext, data: bytes, **options: Any):  # type: ignore[no-untyped-def]
    return validate_import_bundle(
        session, context, io.BytesIO(data), compressed_size=len(data), **options
    )


def jpeg_bytes(size: tuple[int, int] = (32, 24)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 20, 30)).save(buffer, "JPEG")
    return buffer.getvalue()


def upload_image(client, space_id: UUID, token: str, session: Session) -> str:  # type: ignore[no-untyped-def]
    """Upload and validate one photo through the real request path."""
    content = jpeg_bytes()
    base = f"/api/v1/spaces/{space_id}/attachments"
    created = client.post(
        base,
        json={
            "mediaType": "IMAGE",
            "originalName": "photo.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(token),
    )
    assert created.status_code == 201, created.text
    identifier = created.json()["attachment"]["id"]
    client.put(f"{base}/{identifier}/content", content=content, headers=auth(token))
    client.post(f"{base}/{identifier}/finalize", json={}, headers=auth(token))
    attachments.validate(session, UUID(identifier))
    session.flush()
    return str(identifier)


def create_memory(client, space_id: UUID, token: str, title: str, photos: list[str]) -> str:  # type: ignore[no-untyped-def]
    base = f"/api/v1/spaces/{space_id}/memories"
    created = client.post(
        base, json={"title": title, "happenedOn": "2026-06-13"}, headers=auth(token)
    )
    assert created.status_code == 201, created.text
    bound = client.put(
        f"{base}/{created.json()['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": photo, "position": index} for index, photo in enumerate(photos)
            ]
        },
        headers={**auth(token), "If-Match": f'"{created.json()["version"]}"'},
    )
    assert bound.status_code == 200, bound.text
    return str(created.json()["id"])


def forge(
    data: bytes,
    change: Callable[[dict[str, bytes]], None],
) -> bytes:
    """Rewrite entries of a real bundle and re-seal its manifest, as a hostile author can."""
    with ZipFile(io.BytesIO(data)) as archive:
        entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    change(entries)
    manifest = json.loads(entries["manifest.json"])
    for name in manifest["checksums"]:
        manifest["checksums"][name] = hashlib.sha256(entries[name]).hexdigest()
    entries["manifest.json"] = json.dumps(manifest).encode()
    forged = io.BytesIO()
    with ZipFile(forged, "w", compression=ZIP_STORED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return forged.getvalue()
