"""Importing a bundle without its videos leaves a consistent graph (#2141)."""

from __future__ import annotations

from uuid import UUID, uuid4

from eimir.transfer.models import TransferScope
from eimir.transfer.service import ValidatedGraph, without_videos


def _media(identifier: UUID, kind: str) -> dict[str, object]:
    return {"sourceId": str(identifier), "mediaType": kind, "size": 10}


def _graph(tables: dict[str, list[dict[str, object]]], media: list[dict[str, object]]):  # type: ignore[no-untyped-def]
    return ValidatedGraph(
        scope=TransferScope.SHARED,
        source_space_id=uuid4(),
        personal_owner_source_id=None,
        mapping={},
        tables=tables,
        media=media,
        summary={},
    )


def test_a_gallery_keeps_its_order_and_loses_cover_and_reactions_on_a_video() -> None:
    memory, first, video, last, partner = (uuid4() for _ in range(5))
    payload = {
        "title": "A day at the lake",
        "selected_cover_attachment_id": str(video),
        "photo_reactions": [
            {"attachment_id": str(video), "account_id": str(partner), "reaction": "LOVE"},
            {"attachment_id": str(last), "account_id": str(partner), "reaction": "LAUGH"},
        ],
    }
    tables = {
        "memories": [{"id": str(memory), "payload": payload}],
        "memory_attachments": [
            {"memoryId": str(memory), "attachmentId": str(first), "position": 0},
            {"memoryId": str(memory), "attachmentId": str(video), "position": 1},
            {"memoryId": str(memory), "attachmentId": str(last), "position": 2},
        ],
    }
    media = [_media(first, "IMAGE"), _media(video, "VIDEO"), _media(last, "IMAGE")]
    graph = _graph(tables, media)

    result = without_videos(graph)

    assert [
        (row["attachmentId"], row["position"]) for row in result.tables["memory_attachments"]
    ] == [(str(first), 0), (str(last), 1)]
    kept = result.tables["memories"][0]["payload"]
    assert isinstance(kept, dict)
    assert kept["selected_cover_attachment_id"] is None
    assert kept["photo_reactions"] == [payload["photo_reactions"][1]]
    assert [item["sourceId"] for item in result.media] == [str(first), str(last)]
    # The validated graph itself is untouched.
    assert len(graph.tables["memory_attachments"]) == 3
    assert graph.tables["memories"][0]["payload"] is payload
    assert payload["selected_cover_attachment_id"] == str(video)


def test_a_heart_moment_whose_primary_media_is_a_video_moves_its_gallery_up() -> None:
    moment, video, photo = uuid4(), uuid4(), uuid4()
    tables = {
        "heart_moments": [{"id": str(moment), "attachmentId": str(video), "payload": {}}],
        "heart_moment_attachments": [
            {"heartMomentId": str(moment), "attachmentId": str(photo), "position": 1}
        ],
    }
    result = without_videos(_graph(tables, [_media(video, "VIDEO"), _media(photo, "IMAGE")]))

    assert result.tables["heart_moments"][0]["attachmentId"] is None
    assert [
        (row["attachmentId"], row["position"]) for row in result.tables["heart_moment_attachments"]
    ] == [(str(photo), 0)]


def test_a_memory_with_only_a_video_keeps_its_content_without_media() -> None:
    memory, video = uuid4(), uuid4()
    tables = {
        "memories": [{"id": str(memory), "payload": {"title": "Only a clip"}}],
        "memory_attachments": [
            {"memoryId": str(memory), "attachmentId": str(video), "position": 0}
        ],
    }
    result = without_videos(_graph(tables, [_media(video, "VIDEO")]))

    assert result.tables["memories"] == tables["memories"]
    assert result.tables["memory_attachments"] == []
    assert result.media == []


def test_a_bundle_without_videos_is_returned_unchanged() -> None:
    photo = uuid4()
    graph = _graph({"memory_attachments": []}, [_media(photo, "IMAGE")])
    assert without_videos(graph) is graph
