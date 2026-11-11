"""Real Plan cover binding, shared authorization and atomic editor corrections."""

import io
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from eimir.attachments.binding import PlanAttachment
from eimir.attachments.limits import DOCUMENT_MAX_SIZE
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.attachments.service import validate
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.deletion_media import apply_account_media_cleanup
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from eimir.relationship.offboarding import leave_space
from eimir.transfer import jobs
from eimir.transfer import service as transfer_service
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_related_person_attachments import couple as couple
from tests.integration.test_related_person_attachments import ready_attachment

pytestmark = [pytest.mark.integration, requires_database]


def path(couple):  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/plans"


def _ticket_pdf() -> bytes:
    pdf = b"%PDF-1.7\n"
    offsets = [0]
    for number, body in enumerate(
        (
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
        ),
        start=1,
    ):
        offsets.append(len(pdf))
        pdf += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += b"xref\n0 4\n0000000000 65535 f \n"
    pdf += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    return pdf + f"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()


def _upload_pdf(client, couple, session, token, data=None):  # type: ignore[no-untyped-def]
    data = _ticket_pdf() if data is None else data
    base = f"/api/v1/spaces/{couple['space'].id}/attachments"
    headers = auth(token)
    response = client.post(
        base,
        json={
            "mediaType": "DOCUMENT",
            "expectedMimeType": "application/pdf",
            "expectedSize": len(data),
            "originalName": "Buchungsbestätigung.pdf",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    identifier = response.json()["attachment"]["id"]
    url = f"{base}/{identifier}"
    uploaded = client.put(f"{url}/content", content=data, headers=headers)
    assert uploaded.status_code == 204, uploaded.text
    finalized = client.post(f"{url}/finalize", json={}, headers=headers)
    assert finalized.status_code == 202, finalized.text
    metadata = client.get(url, headers=headers)
    assert metadata.status_code == 200, metadata.text
    assert metadata.json()["status"] == "PROCESSING"
    validate(session, UUID(identifier))
    session.flush()
    return identifier, url


def test_plan_pdfs_follow_plan_access_and_versioned_edits(client, couple, session):  # type: ignore[no-untyped-def]
    token_a, token_b = couple["token_a"], couple["token_b"]
    pdf, file_url = _upload_pdf(client, couple, session, token_a)
    metadata = client.get(file_url, headers=auth(token_a))
    assert metadata.status_code == 200, metadata.text
    assert metadata.json()["status"] == AttachmentStatus.READY.value
    assert client.get(file_url, headers=auth(token_b)).status_code == 404
    assert client.get(f"{file_url}/content", headers=auth(token_a)).status_code == 404
    assert client.get(f"{file_url}/content", headers=auth(token_b)).status_code == 404
    body = {"title": "Train journey", "fileAttachmentIds": [pdf]}
    assert client.post(path(couple), json=body, headers=auth(token_b)).status_code == 404
    assert (
        client.post(
            path(couple),
            json={"title": "Invalid cover", "coverAttachmentId": pdf},
            headers=auth(token_a),
        ).status_code
        == 422
    )

    create_headers = {**auth(token_a), "Idempotency-Key": str(uuid4())}
    result = client.post(path(couple), json=body, headers=create_headers)
    assert result.status_code == 201, result.text
    plan = result.json()
    assert client.post(path(couple), json=body, headers=create_headers).json()["id"] == plan["id"]
    assert plan["fileAttachments"] == [
        {"id": pdf, "name": "Buchungsbestätigung.pdf", "size": len(_ticket_pdf())}
    ]
    assert plan["attachments"] == []
    assert plan["coverAttachment"] is None
    url = f"{path(couple)}/{plan['id']}"
    assert (
        client.get(url, headers=auth(token_b)).json()["fileAttachments"] == plan["fileAttachments"]
    )
    download = client.get(f"{file_url}/content", headers=auth(token_b))
    assert download.status_code == 200
    assert download.headers["Content-Type"] == "application/pdf"
    assert download.headers["Content-Disposition"].startswith("attachment;")
    assert "Buchungsbest%C3%A4tigung.pdf" in download.headers["Content-Disposition"]
    assert download.content == _ticket_pdf()
    outsider = make_account(session, "Outside")
    other_space = make_space(session, outsider)
    denied = client.get(
        f"/api/v1/spaces/{other_space.id}/attachments/{pdf}/content",
        headers=auth(sign_in(session, outsider)),
    )
    assert denied.status_code == 404

    second, _ = _upload_pdf(client, couple, session, token_b)
    version = str(plan["version"])
    update = client.patch(
        url,
        headers={**auth(token_b), "If-Match": version},
        json={"fileAttachmentChanges": {"add": [second]}},
    )
    assert update.status_code == 200, update.text
    assert {file["id"] for file in update.json()["fileAttachments"]} == {pdf, second}
    assert update.json()["version"] > plan["version"]
    remove = {"fileAttachmentChanges": {"remove": [pdf]}}
    assert (
        client.patch(url, headers={**auth(token_a), "If-Match": version}, json=remove).status_code
        == 409
    )
    current = client.patch(
        url,
        headers={**auth(token_a), "If-Match": str(update.json()["version"])},
        json=remove,
    )
    assert current.status_code == 200, current.text
    assert [file["id"] for file in current.json()["fileAttachments"]] == [second]
    assert session.get(Attachment, UUID(pdf)).status == AttachmentStatus.DELETING.value
    deleted = client.delete(
        url, headers={**auth(token_b), "If-Match": str(current.json()["version"])}
    )
    assert deleted.status_code == 204
    assert session.get(Attachment, UUID(second)).status == AttachmentStatus.DELETING.value


def test_unvalidated_or_oversized_pdfs_cannot_be_added(client, couple, session):  # type: ignore[no-untyped-def]
    token = couple["token_a"]
    attachment, _ = _upload_pdf(client, couple, session, token, b"%PDF-1.7\nInvalid PDF\n%%EOF")
    assert session.get(Attachment, UUID(attachment)).status == AttachmentStatus.FAILED.value
    result = client.post(
        path(couple),
        json={"title": "Invalid PDF", "fileAttachmentIds": [attachment]},
        headers=auth(token),
    )
    assert result.status_code == 409
    oversized = client.post(
        f"/api/v1/spaces/{couple['space'].id}/attachments",
        json={
            "mediaType": "DOCUMENT",
            "expectedMimeType": "application/pdf",
            "expectedSize": DOCUMENT_MAX_SIZE + 1,
            "originalName": "ticket.pdf",
        },
        headers=auth(token),
    )
    assert oversized.status_code == 413


def test_cover_is_shared_only_through_its_authorized_plan(client, couple, session):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    response = client.post(
        path(couple),
        json={"title": "Time at the sea", "coverAttachmentId": image, "coverIsSensitive": True},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert plan["coverAttachment"]["id"] == image
    assert plan["coverAttachment"]["isSensitive"] is True
    base = f"/api/v1/spaces/{couple['space'].id}/attachments/{image}"
    partner = client.post(
        f"{base}/read-access",
        json={"parentType": "PLAN", "parentId": plan["id"], "variant": "thumbnail"},
        headers=auth(couple["token_b"]),
    )
    assert partner.status_code == 200, partner.text
    assert client.get(f"{base}/content", headers=auth(couple["token_b"])).status_code == 200
    other = make_account(session, "Other")
    other_space = make_space(session, other)
    other_token = sign_in(session, other)
    foreign = client.get(
        f"/api/v1/spaces/{other_space.id}/attachments/{image}/content", headers=auth(other_token)
    )
    assert foreign.status_code == 404
    reused = client.post(
        path(couple),
        json={"title": "Another plan", "coverAttachmentId": image},
        headers=auth(couple["token_a"]),
    )
    assert reused.status_code == 409
    assert reused.json()["code"] == "ATTACHMENT_ALREADY_LINKED"


def test_cannot_bind_a_partners_unbound_upload_or_a_foreign_image(client, couple, session):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    response = client.post(
        path(couple),
        json={"title": "Unbound image", "coverAttachmentId": image},
        headers=auth(couple["token_b"]),
    )
    assert response.status_code == 404
    other = make_account(session, "Other")
    other_space = make_space(session, other)
    other_token = sign_in(session, other)
    foreign = client.post(
        f"/api/v1/spaces/{other_space.id}/plans",
        json={"title": "Foreign image", "coverAttachmentId": image},
        headers=auth(other_token),
    )
    assert foreign.status_code == 404


def test_one_patch_saves_content_schedule_countdown_and_cover_atomically(client, couple, session):  # type: ignore[no-untyped-def]
    plan = client.post(
        path(couple), json={"title": "An idea"}, headers=auth(couple["token_a"])
    ).json()
    image = ready_attachment(client, couple, session)
    headers = {**auth(couple["token_a"]), "If-Match": str(plan["version"])}
    response = client.patch(
        f"{path(couple)}/{plan['id']}",
        json={
            "title": "A weekend",
            "description": "Together",
            "schedule": {"plannedOn": "2027-06-17"},
            "anticipationEnabled": True,
            "coverAttachmentId": image,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["title"] == "A weekend"
    assert saved["status"] == "PLANNED"
    assert saved["plannedOn"] == "2027-06-17"
    assert saved["plannedStart"] is None
    assert saved["anticipationEnabled"] is True
    assert saved["coverAttachment"]["id"] == image
    assert saved["version"] == plan["version"] + 1
    assert (
        client.patch(
            f"{path(couple)}/{plan['id']}", json={"title": "Stale overwrite"}, headers=headers
        ).status_code
        == 409
    )
    cleared = client.patch(
        f"{path(couple)}/{plan['id']}",
        json={"schedule": None, "coverAttachmentId": None},
        headers={**auth(couple["token_b"]), "If-Match": str(saved["version"])},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["status"] == "IDEA"
    assert cleared.json()["coverAttachment"] is None
    assert session.get(Attachment, UUID(image)).status == AttachmentStatus.DELETING.value


def test_failed_binding_rolls_back_all_other_editor_changes(client, couple):  # type: ignore[no-untyped-def]
    plan = client.post(
        path(couple), json={"title": "Original"}, headers=auth(couple["token_a"])
    ).json()
    url = f"{path(couple)}/{plan['id']}"
    bad = client.patch(
        url,
        json={
            "title": "Must roll back",
            "schedule": {"plannedOn": "2027-06-17"},
            "coverAttachmentId": "00000000-0000-4000-8000-000000000000",
        },
        headers={**auth(couple["token_a"]), "If-Match": str(plan["version"])},
    )
    assert bad.status_code == 404
    current = client.get(url, headers=auth(couple["token_a"])).json()
    assert current["title"] == "Original"
    assert current["status"] == "IDEA"
    assert current["version"] == plan["version"]


def test_deleting_plan_schedules_cover_cleanup(client, couple, session):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    plan = client.post(
        path(couple),
        json={"title": "Plan", "coverAttachmentId": image},
        headers=auth(couple["token_a"]),
    ).json()
    response = client.delete(
        f"{path(couple)}/{plan['id']}",
        headers={**auth(couple["token_b"]), "If-Match": str(plan["version"])},
    )
    assert response.status_code == 204
    assert session.get(Attachment, UUID(image)).status == AttachmentStatus.DELETING.value


def test_gallery_partner_reorder_legacy_edit_and_delete_are_atomic(client, couple, session):  # type: ignore[no-untyped-def]
    images = [ready_attachment(client, couple, session) for _ in range(3)]
    created = client.post(
        path(couple),
        json={
            "title": "Gallery",
            "attachments": [
                {"attachmentId": image, "position": index} for index, image in enumerate(images)
            ],
        },
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201, created.text
    plan = created.json()
    url = f"{path(couple)}/{plan['id']}"
    for image in images:
        read = client.post(
            f"/api/v1/spaces/{couple['space'].id}/attachments/{image}/read-access",
            json={"parentType": "PLAN", "parentId": plan["id"]},
            headers=auth(couple["token_b"]),
        )
        assert read.status_code == 200, read.text
        reused = client.post(
            path(couple),
            json={"title": "Other", "coverAttachmentId": image},
            headers=auth(couple["token_a"]),
        )
        assert reused.status_code == 409
    reordered = client.patch(
        url,
        json={
            "title": "Together",
            "attachments": [
                {"attachmentId": image, "position": index, "isSensitive": index == 1}
                for index, image in enumerate(reversed(images))
            ],
        },
        headers={**auth(couple["token_b"]), "If-Match": str(plan["version"])},
    )
    assert reordered.status_code == 200, reordered.text
    saved = reordered.json()
    assert [photo["id"] for photo in saved["attachments"]] == list(reversed(images))
    assert saved["coverAttachment"]["id"] == images[-1]
    assert saved["attachments"][1]["isSensitive"] is True
    assert all(session.get(Attachment, UUID(image)).status == "READY" for image in images)
    stale = client.patch(
        url,
        json={"attachments": []},
        headers={**auth(couple["token_a"]), "If-Match": str(plan["version"])},
    )
    assert stale.status_code == 409
    # Older clients clear only the leading photo; supplemental photos survive.
    legacy = client.patch(
        url,
        json={"coverAttachmentId": None},
        headers={**auth(couple["token_a"]), "If-Match": str(saved["version"])},
    )
    assert legacy.status_code == 200, legacy.text
    assert [photo["id"] for photo in legacy.json()["attachments"]] == [images[1], images[0]]
    assert session.get(Attachment, UUID(images[2])).status == "DELETING"
    deleted = client.delete(
        url, headers={**auth(couple["token_b"]), "If-Match": str(legacy.json()["version"])}
    )
    assert deleted.status_code == 204
    assert all(session.get(Attachment, UUID(image)).status == "DELETING" for image in images)
    assert (
        session.scalar(select(PlanAttachment).where(PlanAttachment.plan_id == UUID(plan["id"])))
        is None
    )


def test_gallery_rejects_unowned_and_duplicate_media_without_partial_changes(
    client, couple, session
):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    created = client.post(path(couple), json={"title": "Original"}, headers=auth(couple["token_b"]))
    plan = created.json()
    url = f"{path(couple)}/{plan['id']}"
    for photos, status in [
        ([{"attachmentId": image, "position": 0}], 404),
        ([{"attachmentId": image, "position": 0}, {"attachmentId": image, "position": 1}], 422),
    ]:
        response = client.patch(
            url,
            json={"title": "Must roll back", "attachments": photos},
            headers={**auth(couple["token_b"]), "If-Match": str(plan["version"])},
        )
        assert response.status_code == status, response.text
        current = client.get(url, headers=auth(couple["token_b"])).json()
        assert current["title"] == "Original"
        assert current["attachments"] == []
        assert current["version"] == plan["version"]
    assert session.get(Attachment, UUID(image)).status == "READY"


def test_shared_transfer_round_trip_preserves_cover_and_rebinds_its_parent(client, couple, session):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    second = ready_attachment(client, couple, session)
    pdf, _ = _upload_pdf(client, couple, session, couple["token_a"])
    created = client.post(
        path(couple),
        json={
            "title": "Portable plan",
            "fileAttachmentIds": [pdf],
            "attachments": [
                {"attachmentId": image, "position": 0},
                {"attachmentId": second, "position": 1, "isSensitive": True},
            ],
        },
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201
    target = make_space(session, couple["anna"])
    relationship_service.add_member(session, target.id, couple["ben"])
    source_context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    target_context = AuthorizationContext(account_id=couple["anna"].id, space_id=target.id)
    with transfer_service.build_export_archive(
        session, source_context, TransferScope.SHARED
    ) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        transfer_service.validate_import_bundle(
            session, target_context, bundle, compressed_size=size
        )
        bundle.seek(0)
        transfer = transfer_service.create_import(session, target_context, bundle, size=size)
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.READY_TO_APPLY.value, transfer.error_code
    transfer_service.request_apply(session, target_context, str(transfer.id))
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED.value, transfer.error_code
    imported = session.execute(select(Plan).where(Plan.space_id == target.id)).scalar_one()
    assert imported.cover_attachment_id is not None
    assert imported.cover_attachment_id != UUID(image)
    result = client.get(
        f"/api/v1/spaces/{target.id}/plans/{imported.id}", headers=auth(couple["token_a"])
    )
    assert result.status_code == 200
    assert result.json()["coverAttachment"]["id"] == str(imported.cover_attachment_id)
    [restored_pdf] = result.json()["fileAttachments"]
    assert restored_pdf["id"] != pdf
    assert restored_pdf["name"] == "Buchungsbestätigung.pdf"
    document = client.get(
        f"/api/v1/spaces/{target.id}/attachments/{restored_pdf['id']}/content",
        headers=auth(couple["token_b"]),
    )
    assert document.status_code == 200
    assert document.content == _ticket_pdf()
    restored = result.json()["attachments"]
    assert [photo["position"] for photo in restored] == [0, 1]
    assert restored[1]["id"] not in {image, second}
    assert restored[1]["isSensitive"] is True
    assert session.scalar(select(PlanAttachment).where(PlanAttachment.plan_id == imported.id))
    media = client.post(
        f"/api/v1/spaces/{target.id}/attachments/{imported.cover_attachment_id}/read-access",
        json={"parentType": "PLAN", "parentId": str(imported.id)},
        headers=auth(couple["token_b"]),
    )
    assert media.status_code == 200, media.text


def test_lookup_checks_space_before_provider_and_is_bounded(client, couple, session, monkeypatch):  # type: ignore[no-untyped-def]
    calls = []

    def search(*args):  # type: ignore[no-untyped-def]
        calls.append(args)
        return []

    monkeypatch.setattr("eimir.api.v1.places.search_places", search)
    url = f"/api/v1/spaces/{couple['space'].id}/places/lookup"
    body = {"query": "Beach", "locale": "de-DE"}
    assert client.post(url, json=body).status_code == 401
    outsider = make_account(session, "Outside")
    assert client.post(url, json=body, headers=auth(sign_in(session, outsider))).status_code == 404
    assert calls == []
    for _ in range(30):
        response = client.post(url, json=body, headers=auth(couple["token_a"]))
        assert response.status_code == 200, response.text
        assert response.headers["Cache-Control"] == "private, no-store"
        assert response.json()["items"] == []
    limited = client.post(url, json=body, headers=auth(couple["token_a"]))
    assert limited.status_code == 429
    assert len(calls) == 30


@pytest.mark.parametrize("lifecycle", ["space_exit", "account_deletion"])
def test_shared_plan_cover_survives_uploader_offboarding(client, couple, session, lifecycle):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    second = ready_attachment(client, couple, session)
    created = client.post(
        path(couple),
        json={
            "title": "Retained shared plan",
            "attachments": [
                {"attachmentId": image, "position": 0},
                {"attachmentId": second, "position": 1},
            ],
        },
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]
    owner = couple["anna"]
    if lifecycle == "space_exit":
        result = leave_space(session, owner, couple["space"].id)
        assert result.changed
    else:
        apply_accepted_tombstone(session, owner.id, accepted_at=now())
        apply_core_cleanup(session, owner.id)
        cleanup = apply_account_media_cleanup(session, owner.id)
        assert cleanup.retained_shared == 2
        assert cleanup.inconsistent_bindings == 0
    session.flush()
    assert session.get(Attachment, UUID(image)).status == AttachmentStatus.READY.value
    current = client.get(f"{path(couple)}/{plan_id}", headers=auth(couple["token_b"]))
    assert current.status_code == 200, current.text
    assert current.json()["coverAttachment"]["id"] == image
    assert [photo["id"] for photo in current.json()["attachments"]] == [image, second]
    assert session.get(Attachment, UUID(second)).status == AttachmentStatus.READY.value
    media = client.post(
        f"/api/v1/spaces/{couple['space'].id}/attachments/{image}/read-access",
        json={"parentType": "PLAN", "parentId": plan_id},
        headers=auth(couple["token_b"]),
    )
    assert media.status_code == 200, media.text


def test_gallery_create_replay_is_bound_to_the_ordered_photo_intent(client, couple, session):  # type: ignore[no-untyped-def]
    images = [ready_attachment(client, couple, session) for _ in range(2)]
    headers = {**auth(couple["token_a"]), "Idempotency-Key": str(uuid4())}
    body = {
        "title": "One plan",
        "attachments": [
            {"attachmentId": image, "position": index} for index, image in enumerate(images)
        ],
    }
    first = client.post(path(couple), json=body, headers=headers)
    assert first.status_code == 201, first.text
    replay = client.post(path(couple), json=body, headers=headers)
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]
    assert [photo["id"] for photo in replay.json()["attachments"]] == images
    changed = {
        "title": "One plan",
        "attachments": [
            {"attachmentId": image, "position": index}
            for index, image in enumerate(reversed(images))
        ],
    }
    assert client.post(path(couple), json=changed, headers=headers).status_code == 409


@pytest.mark.parametrize("selection", [{}, {"attachments": []}])
def test_empty_gallery_creation_keeps_the_initial_plan_version(client, couple, selection):  # type: ignore[no-untyped-def]
    response = client.post(
        path(couple), json={"title": "A simple idea", **selection}, headers=auth(couple["token_a"])
    )
    assert response.status_code == 201, response.text
    plan = response.json()
    assert plan["version"] == 1
    current = client.get(f"{path(couple)}/{plan['id']}", headers=auth(couple["token_a"]))
    assert current.headers["ETag"] == '"1"'
    assert current.json()["attachments"] == []
    updated = client.patch(
        f"{path(couple)}/{plan['id']}",
        json={"title": "A shared idea"},
        headers={**auth(couple["token_a"]), "If-Match": "1"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
