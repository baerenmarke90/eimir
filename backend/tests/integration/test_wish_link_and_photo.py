"""Acceptance tests for the optional Wish link and single photo.

The link is protected payload content and the photo is an exclusive attachment
binding in ``wishes.photo_attachment_id``. They are independent of each other and
of title, description, and tags. A Plan created from the Wish does not copy
either; it reaches both through ``Plan.source_wish_id``.
"""

from __future__ import annotations

import io
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.authorization import AuthorizationContext
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs
from eimir.transfer import service as transfer_service
from eimir.transfer.models import ImportStatus, TransferScope
from eimir.wishes import links
from eimir.wishes.models import Wish
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_plan_images_and_editor import _upload_pdf
from tests.integration.test_related_person_attachments import image_bytes, ready_attachment

pytestmark = [pytest.mark.integration, requires_database]

HUT_LINK = "https://www.alpenverein.example/huetten/zugspitzhaus?lang=de#oeffnungszeiten"


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/wishes"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outside")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def create(  # type: ignore[no-untyped-def]
    client, couple, *, token_key: str = "token_a", headers: dict[str, str] | None = None, **fields
):
    return client.post(
        path(couple["space"].id),
        json={"title": "Hut weekend", **fields},
        headers={**auth(couple[token_key]), **(headers or {})},
    )


def patch(  # type: ignore[no-untyped-def]
    client, couple, wish: dict[str, Any], *, token_key: str = "token_a", **fields
):
    return client.patch(
        f"{path(couple['space'].id)}/{wish['id']}",
        json=fields,
        headers=if_match(couple[token_key], wish["version"]),
    )


def attachment_row(session: Session, attachment_id: str) -> Attachment:
    session.expire_all()
    return session.execute(
        select(Attachment).where(Attachment.id == UUID(attachment_id))
    ).scalar_one()


def read_access(  # type: ignore[no-untyped-def]
    client, couple, attachment_id: str, wish_id: str, *, token_key: str, space_key: str = "space"
):
    return client.post(
        f"/api/v1/spaces/{couple[space_key].id}/attachments/{attachment_id}/read-access",
        json={"parentType": "WISH", "parentId": wish_id},
        headers=auth(couple[token_key]),
    )


class TestLinkValidation:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("  https://Example.COM/Path?a=1#frag  ", "https://example.com/Path?a=1#frag"),
            ("HTTP://example.com", "http://example.com"),
            ("https://example.com:8443/x", "https://example.com:8443/x"),
            ("http://[::1]:8080/", "http://[::1]:8080/"),
            ("", None),
            ("   ", None),
            (None, None),
        ],
    )
    def test_normalizes(self, raw: str | None, expected: str | None) -> None:
        assert links.normalize_link(raw) == expected
        assert links.normalize_link(expected) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "ftp://example.com/x",
            "example.com/no-scheme",
            "//example.com/x",
            "https:///no-host",
            "https://user:secret@example.com/",
            "https://user@example.com/",
            "https://exa mple.com/",
            "https://example.com/a\tb",
            "https://example.com/a\nb",
            "https://example.com/a\\b",
            "https://example.com:notaport/",
            "https://example.com/" + "a" * 2048,
        ],
    )
    def test_rejects(self, raw: str) -> None:
        with pytest.raises(ValueError):
            links.normalize_link(raw)

    @pytest.mark.parametrize(
        "raw",
        [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://user:secret@example.com/",
            "https://example.com/" + "a" * 2048,
            "https://exa mple.com/",
        ],
    )
    def test_api_rejects_invalid_link_on_create_and_update(  # type: ignore[no-untyped-def]
        self, client, couple, raw: str
    ) -> None:
        assert create(client, couple, linkUrl=raw).status_code == 422
        wish = create(client, couple).json()
        assert patch(client, couple, wish, linkUrl=raw).status_code == 422
        unchanged = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        ).json()
        assert unchanged["linkUrl"] is None
        assert unchanged["version"] == wish["version"]


class TestLink:
    def test_create_with_link_only(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create(client, couple, linkUrl=f"  {HUT_LINK}  ")
        assert created.status_code == 201, created.text
        wish = created.json()
        assert wish["linkUrl"] == HUT_LINK
        assert wish["photoAttachmentId"] is None
        assert created.headers["ETag"] == '"1"'
        seen_by_partner = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_b"])
        ).json()
        assert seen_by_partner["linkUrl"] == HUT_LINK

    def test_wish_without_link_or_photo_serializes_nulls(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        wish = create(client, couple).json()
        assert wish["linkUrl"] is None
        assert wish["photoAttachmentId"] is None

    def test_link_is_editable_and_clearable_independently(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        wish = create(
            client, couple, description="Bring boots", tags=["alps"], linkUrl=HUT_LINK
        ).json()
        changed = patch(client, couple, wish, title="Hut weekend 2", token_key="token_b")
        assert changed.status_code == 200
        assert changed.json()["linkUrl"] == HUT_LINK
        replaced = patch(
            client, couple, changed.json(), linkUrl="https://other.example/hut", token_key="token_b"
        )
        assert replaced.status_code == 200
        assert replaced.json()["linkUrl"] == "https://other.example/hut"
        assert replaced.json()["description"] == "Bring boots"
        assert replaced.json()["tags"] == ["alps"]
        cleared = patch(client, couple, replaced.json(), linkUrl=None)
        assert cleared.status_code == 200
        cleared_wish = cleared.json()
        assert cleared_wish["linkUrl"] is None
        assert cleared_wish["title"] == "Hut weekend 2"
        assert cleared_wish["description"] == "Bring boots"
        blank = patch(client, couple, {**cleared_wish, "version": 99}, linkUrl="")
        assert blank.status_code == 409  # stale version, nothing applied
        assert patch(client, couple, cleared_wish, linkUrl="").json()["linkUrl"] is None

    def test_update_without_any_field_is_still_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        wish = create(client, couple).json()
        assert patch(client, couple, wish).status_code == 422


class TestPhoto:
    def test_link_then_photo_on_the_same_wish_via_two_updates(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        wish = create(client, couple, linkUrl=HUT_LINK).json()
        photo = ready_attachment(client, couple, session)
        with_photo = patch(client, couple, wish, photoAttachmentId=photo)
        assert with_photo.status_code == 200, with_photo.text
        assert with_photo.json()["photoAttachmentId"] == photo
        assert with_photo.json()["linkUrl"] == HUT_LINK
        assert with_photo.json()["version"] == wish["version"] + 1
        # A second update touching only the title keeps both.
        retitled = patch(client, couple, with_photo.json(), title="Zugspitze hut")
        assert retitled.status_code == 200
        assert retitled.json()["photoAttachmentId"] == photo
        assert retitled.json()["linkUrl"] == HUT_LINK
        assert attachment_row(session, photo).status == AttachmentStatus.READY.value

    def test_create_with_photo_starts_at_version_one(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        created = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK)
        assert created.status_code == 201, created.text
        assert created.json()["photoAttachmentId"] == photo
        assert created.json()["linkUrl"] == HUT_LINK
        assert created.headers["ETag"] == '"1"'

    def test_clear_photo_only_marks_it_for_deletion_and_keeps_the_link(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK).json()
        cleared = patch(client, couple, wish, photoAttachmentId=None)
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["photoAttachmentId"] is None
        assert cleared.json()["linkUrl"] == HUT_LINK
        assert attachment_row(session, photo).status == AttachmentStatus.DELETING.value

    def test_resending_the_same_photo_changes_nothing(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo).json()
        again = patch(client, couple, wish, photoAttachmentId=photo, linkUrl=HUT_LINK)
        assert again.status_code == 200, again.text
        assert again.json()["photoAttachmentId"] == photo
        assert attachment_row(session, photo).status == AttachmentStatus.READY.value

    def test_replacing_the_photo_marks_the_old_one_deleted(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        first = ready_attachment(client, couple, session)
        second = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=first, linkUrl=HUT_LINK).json()
        replaced = patch(client, couple, wish, photoAttachmentId=second)
        assert replaced.status_code == 200, replaced.text
        assert replaced.json()["photoAttachmentId"] == second
        assert replaced.json()["linkUrl"] == HUT_LINK
        assert attachment_row(session, first).status == AttachmentStatus.DELETING.value
        assert attachment_row(session, second).status == AttachmentStatus.READY.value

    def test_the_partner_may_replace_the_photo_with_their_own_upload(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        first = ready_attachment(client, couple, session)
        theirs = ready_attachment(client, couple, session, token_key="token_b")
        wish = create(client, couple, photoAttachmentId=first).json()
        replaced = patch(client, couple, wish, token_key="token_b", photoAttachmentId=theirs)
        assert replaced.status_code == 200, replaced.text
        assert replaced.json()["photoAttachmentId"] == theirs
        assert attachment_row(session, first).status == AttachmentStatus.DELETING.value

    def test_pending_upload_is_rejected_and_a_retried_upload_binds_cleanly(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        content = image_bytes()
        pending = client.post(
            f"/api/v1/spaces/{couple['space'].id}/attachments",
            json={
                "mediaType": "IMAGE",
                "originalName": "hut.jpg",
                "expectedMimeType": "image/jpeg",
                "expectedSize": len(content),
            },
            headers=auth(couple["token_a"]),
        ).json()["attachment"]["id"]
        wish = create(client, couple, linkUrl=HUT_LINK).json()
        rejected = patch(client, couple, wish, photoAttachmentId=pending)
        assert rejected.status_code == 409
        assert rejected.json()["code"] == "ATTACHMENT_NOT_READY"
        assert create(client, couple, photoAttachmentId=pending).status_code == 409

        failed = attachment_row(session, pending)
        failed.status = AttachmentStatus.FAILED.value
        session.flush()
        assert patch(client, couple, wish, photoAttachmentId=pending).status_code == 409

        retried = ready_attachment(client, couple, session)
        bound = patch(client, couple, wish, photoAttachmentId=retried)
        assert bound.status_code == 200, bound.text
        assert bound.json()["photoAttachmentId"] == retried
        assert bound.json()["linkUrl"] == HUT_LINK
        # The failed attempt never became a leftover binding.
        assert (
            session.scalar(select(Wish.id).where(Wish.photo_attachment_id == UUID(pending))) is None
        )

    def test_non_image_attachment_is_rejected(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        pdf, _ = _upload_pdf(client, couple, session, couple["token_a"])
        wish = create(client, couple).json()
        rejected = patch(client, couple, wish, photoAttachmentId=pdf)
        assert rejected.status_code == 422
        assert create(client, couple, photoAttachmentId=pdf).status_code == 422
        unchanged = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        ).json()
        assert unchanged["photoAttachmentId"] is None

    def test_attachment_of_the_other_partner_or_an_unknown_one_is_not_bindable(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        from_ben = ready_attachment(client, couple, session, token_key="token_b")
        wish = create(client, couple).json()
        assert patch(client, couple, wish, photoAttachmentId=from_ben).status_code == 404
        assert patch(client, couple, wish, photoAttachmentId=str(uuid4())).status_code == 404

    def test_an_already_bound_attachment_cannot_be_reused(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        first = create(client, couple, photoAttachmentId=photo).json()
        second = create(client, couple).json()
        reused = patch(client, couple, second, photoAttachmentId=photo)
        assert reused.status_code == 409
        assert reused.json()["code"] == "ATTACHMENT_ALREADY_LINKED"
        assert create(client, couple, photoAttachmentId=photo).status_code == 409
        still = client.get(
            f"{path(couple['space'].id)}/{first['id']}", headers=auth(couple["token_a"])
        ).json()
        assert still["photoAttachmentId"] == photo

    def test_an_attachment_bound_to_another_resource_cannot_become_a_wish_photo(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        plan = client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Weekend", "coverAttachmentId": photo},
            headers=auth(couple["token_a"]),
        )
        assert plan.status_code == 201, plan.text
        wish = create(client, couple).json()
        reused = patch(client, couple, wish, photoAttachmentId=photo)
        assert reused.status_code == 409
        assert reused.json()["code"] == "ATTACHMENT_ALREADY_LINKED"


class TestReadAccess:
    def test_partner_reads_the_photo_and_an_outsider_cannot(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo).json()

        partner = read_access(client, couple, photo, wish["id"], token_key="token_b")
        assert partner.status_code == 200, partner.text
        uploader = read_access(client, couple, photo, wish["id"], token_key="token_a")
        assert uploader.status_code == 200, uploader.text
        content = client.get(
            f"/api/v1/spaces/{couple['space'].id}/attachments/{photo}/content",
            headers=auth(couple["token_b"]),
        )
        assert content.status_code == 200

        outsider = read_access(
            client,
            couple,
            photo,
            wish["id"],
            token_key="token_outsider",
            space_key="outsider_space",
        )
        assert outsider.status_code == 404
        outsider_in_space = read_access(
            client, couple, photo, wish["id"], token_key="token_outsider"
        )
        assert outsider_in_space.status_code == 404
        outsider_content = client.get(
            f"/api/v1/spaces/{couple['space'].id}/attachments/{photo}/content",
            headers=auth(couple["token_outsider"]),
        )
        assert outsider_content.status_code == 404

    def test_a_false_parent_assertion_is_rejected(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        create(client, couple, photoAttachmentId=photo)
        other = create(client, couple).json()
        wrong = read_access(client, couple, photo, other["id"], token_key="token_b")
        assert wrong.status_code == 404

    def test_replaced_photo_is_no_longer_readable(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        first = ready_attachment(client, couple, session)
        second = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=first).json()
        patch(client, couple, wish, photoAttachmentId=second)
        gone = read_access(client, couple, first, wish["id"], token_key="token_b")
        assert gone.status_code in {404, 409}


class TestDeleteAndIdempotency:
    def test_deleting_the_wish_releases_the_photo(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK).json()
        deleted = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_b"], wish["version"]),
        )
        assert deleted.status_code == 204
        assert attachment_row(session, photo).status == AttachmentStatus.DELETING.value
        assert session.scalar(select(Wish.id).where(Wish.id == UUID(wish["id"]))) is None

    def test_deleting_a_wish_without_photo_still_works(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        wish = create(client, couple, linkUrl=HUT_LINK).json()
        deleted = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], wish["version"]),
        )
        assert deleted.status_code == 204

    def test_idempotent_create_replay_with_the_same_link_and_photo(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        headers = {"Idempotency-Key": str(uuid4())}
        first = create(
            client, couple, headers=headers, photoAttachmentId=photo, linkUrl=f" {HUT_LINK} "
        )
        assert first.status_code == 201, first.text
        replay = create(client, couple, headers=headers, photoAttachmentId=photo, linkUrl=HUT_LINK)
        assert replay.status_code == 200, replay.text
        assert replay.json()["id"] == first.json()["id"]
        assert replay.json()["photoAttachmentId"] == photo
        assert replay.json()["linkUrl"] == HUT_LINK

    def test_idempotency_key_reuse_with_a_different_link_or_photo_conflicts(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        headers = {"Idempotency-Key": str(uuid4())}
        assert create(client, couple, headers=headers, linkUrl=HUT_LINK).status_code == 201
        different_link = create(client, couple, headers=headers, linkUrl="https://other.example/")
        assert different_link.status_code == 409
        with_photo = create(
            client, couple, headers=headers, linkUrl=HUT_LINK, photoAttachmentId=photo
        )
        assert with_photo.status_code == 409


class TestRepeatAndPlan:
    def test_repeat_copies_the_link_but_not_the_photo(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK).json()
        completed = client.post(
            f"{path(couple['space'].id)}/{wish['id']}/complete",
            headers=if_match(couple["token_a"], wish["version"]),
        )
        assert completed.status_code == 200, completed.text
        repeated = client.post(
            f"{path(couple['space'].id)}/{wish['id']}/repeat",
            headers=auth(couple["token_a"]),
        )
        assert repeated.status_code == 201, repeated.text
        assert repeated.json()["linkUrl"] == HUT_LINK
        assert repeated.json()["photoAttachmentId"] is None
        source = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        ).json()
        assert source["photoAttachmentId"] == photo
        assert attachment_row(session, photo).status == AttachmentStatus.READY.value

    def test_plan_from_the_wish_keeps_the_source_and_the_wish_still_serves_both(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        wish = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK).json()
        converted = client.post(
            f"{path(couple['space'].id)}/{wish['id']}/plan",
            json={},
            headers=if_match(couple["token_a"], wish["version"]),
        )
        assert converted.status_code in {200, 201}, converted.text
        plan = converted.json()["plan"]
        assert plan["sourceWishId"] == wish["id"]
        # Nothing is copied to the Plan.
        assert plan.get("coverAttachment") is None
        assert plan.get("attachments", []) == []

        after = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_b"])
        )
        assert after.status_code == 200
        served = after.json()
        assert served["status"] == "PLANNED"
        assert served["linkUrl"] == HUT_LINK
        assert served["photoAttachmentId"] == photo
        assert (
            read_access(client, couple, photo, wish["id"], token_key="token_b").status_code == 200
        )


class TestPortableTransfer:
    def test_shared_transfer_round_trip_preserves_link_and_rebinds_the_photo(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        photo = ready_attachment(client, couple, session)
        created = create(client, couple, photoAttachmentId=photo, linkUrl=HUT_LINK)
        assert created.status_code == 201, created.text
        target = make_space(session, couple["anna"])
        relationship_service.add_member(session, target.id, couple["ben"])
        source_context = AuthorizationContext(
            account_id=couple["anna"].id, space_id=couple["space"].id
        )
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

        imported = session.execute(select(Wish).where(Wish.space_id == target.id)).scalar_one()
        assert imported.id != UUID(created.json()["id"])
        assert imported.payload.link_url == HUT_LINK
        assert imported.photo_attachment_id is not None
        assert imported.photo_attachment_id != UUID(photo)
        served = client.get(
            f"{path(target.id)}/{imported.id}", headers=auth(couple["token_b"])
        ).json()
        assert served["linkUrl"] == HUT_LINK
        assert served["photoAttachmentId"] == str(imported.photo_attachment_id)
        media = client.post(
            f"/api/v1/spaces/{target.id}/attachments/{imported.photo_attachment_id}/read-access",
            json={"parentType": "WISH", "parentId": str(imported.id)},
            headers=auth(couple["token_b"]),
        )
        assert media.status_code == 200, media.text
