"""Only the member who imported a skipped video sees, recovers or dismisses it (#2141, P7).

The remembered rows keep two people apart: ``imported_by`` is the member who
imported the bundle without its videos, and ``owner_id`` is the owner a
recovered video gets, which in a shared bundle is often the partner. The partner
sees nothing, cannot dismiss the importer's hints and cannot recover them.
"""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.transfer import service as transfers
from eimir.transfer.models import ImportStatus, TransferSkippedVideo
from tests.conftest import auth, requires_database, sign_in
from tests.integration.test_transfer_video_gate import _run_apply_job
from tests.integration.test_transfer_video_recovery import _apply, _path, _stage, skipped

pytestmark = [pytest.mark.integration, requires_database]

__all__ = ["skipped"]  # a fixture reused from the recovery tests


def _rows(session: Session, space_id: UUID) -> list[TransferSkippedVideo]:
    return list(
        session.scalars(
            select(TransferSkippedVideo).where(TransferSkippedVideo.space_id == space_id)
        )
    )


def _listed(client, skipped, token: str):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{skipped['target'].id}/transfer/skipped-videos", headers=auth(token)
    )


def _owned_by_partner(session: Session, skipped) -> None:  # type: ignore[no-untyped-def]
    """The skipped videos belong to Ben, as in a shared bundle; Anna imported them."""
    for row in _rows(session, skipped["target"].id):
        row.owner_id = skipped["ben"].id
    session.flush()


def test_each_row_remembers_who_imported_it(session, skipped) -> None:  # type: ignore[no-untyped-def]
    rows = _rows(session, skipped["target"].id)

    assert len(rows) == 2
    assert {row.imported_by for row in rows} == {skipped["anna"].id}


def test_the_partner_sees_nothing_and_cannot_dismiss(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    _owned_by_partner(session, skipped)
    ben = sign_in(session, skipped["ben"])

    assert _listed(client, skipped, ben).json() == {"count": 0, "totalSize": 0}
    assert _listed(client, skipped, skipped["token"]).json()["count"] == 2

    dismissed = client.delete(
        f"/api/v1/spaces/{skipped['target'].id}/transfer/skipped-videos", headers=auth(ben)
    )
    assert dismissed.status_code == 404, dismissed.text
    assert len(_rows(session, skipped["target"].id)) == 2


def test_dismissing_twice_finds_nothing_the_second_time(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    path = f"/api/v1/spaces/{skipped['target'].id}/transfer/skipped-videos"

    assert client.delete(path, headers=auth(skipped["token"])).status_code == 204
    assert client.delete(path, headers=auth(skipped["token"])).status_code == 404


def test_the_partner_cannot_recover_the_importers_videos(
    client, session, skipped, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    _owned_by_partner(session, skipped)
    ben = skipped["ben"]
    context = AuthorizationContext(account_id=ben.id, space_id=skipped["target"].id)
    staged = _stage(session, context, skipped["data"])
    token = sign_in(session, ben)

    summary = client.get(_path(staged), headers=auth(token)).json()["summary"]
    assert summary["recoverableVideoCount"] == 0
    assert summary["recoverableVideoBytes"] == 0

    refused, _ = _apply(client, session, staged, token, "VIDEOS_ONLY")
    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "TRANSFER_NOTHING_TO_RECOVER"
    assert len(_rows(session, skipped["target"].id)) == 2


def test_the_importer_recovers_videos_for_their_owner(
    client, session, skipped, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    _owned_by_partner(session, skipped)
    again = _stage(session, skipped["context"], skipped["data"])

    accepted, _ = _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, again)

    assert again.status == ImportStatus.COMPLETED, again.error_code
    videos = list(
        session.scalars(
            select(Attachment).where(
                Attachment.space_id == skipped["target"].id,
                Attachment.media_type == MediaType.VIDEO.value,
            )
        )
    )
    assert len(videos) == 2
    assert {video.owner_id for video in videos} == {skipped["ben"].id}
    assert _rows(session, skipped["target"].id) == []


@pytest.mark.parametrize("deleted", ["anna", "ben"])
def test_deleting_either_the_importer_or_the_owner_removes_the_rows(
    session, skipped, deleted: str
) -> None:  # type: ignore[no-untyped-def]
    _owned_by_partner(session, skipped)
    account = skipped[deleted]

    apply_accepted_tombstone(session, account.id, accepted_at=now())
    apply_core_cleanup(session, account.id)
    session.flush()

    assert _rows(session, skipped["target"].id) == []
