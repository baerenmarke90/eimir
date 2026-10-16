"""HTTP, tenant, and privacy contract for editable profile identity (#368)."""

from __future__ import annotations

import io

import pytest
from sqlalchemy.orm import Session

from eimir.attachments import binding as attachment_binding
from eimir.attachments import service as attachment_service
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.media import get_media_store
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def profile_path(space_id: object, account_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profiles/{account_id}"


def avatar_path(space_id: object, account_id: object) -> str:
    return f"{profile_path(space_id, account_id)}/avatar/content"


def ready_avatar(
    session: Session,
    *,
    account_id,
    space_id,
    data: bytes = b"sanitized-avatar-bytes",
) -> Attachment:  # type: ignore[no-untyped-def]
    attachment = Attachment(
        space_id=space_id,
        owner_id=account_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=len(data),
        mime_type="image/jpeg",
        size=len(data),
        ready_at=now(),
        payload=AttachmentPayload(original_name="avatar.jpg"),
    )
    session.add(attachment)
    session.flush()
    get_media_store().put(
        attachment_service.storage_key_for(attachment),
        io.BytesIO(data),
        "image/jpeg",
    )
    return attachment


def bind_avatar(session: Session, account_id, attachment_id) -> None:  # type: ignore[no-untyped-def]
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=account_id,
            attachment_id=attachment_id,
        )
    )
    session.flush()


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def test_profile_projection_and_display_name_update(client, couple) -> None:  # type: ignore[no-untyped-def]
    initial = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_b"]),
    )
    assert initial.status_code == 200
    assert initial.json()["profileAttachmentId"] is None
    assert initial.json()["version"] == 1
    assert initial.headers["etag"] == '"1"'

    updated = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"displayName": "  Änne 李  "},
        headers={**auth(couple["token_a"]), "If-Match": initial.headers["etag"]},
    )
    assert updated.status_code == 200
    assert updated.json()["displayName"] == "Änne 李"
    assert updated.json()["profileAttachmentId"] is None
    assert updated.json()["version"] == 2
    assert updated.headers["etag"] == '"2"'

    partner_view = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_b"]),
    )
    assert partner_view.status_code == 200
    assert partner_view.json()["displayName"] == "Änne 李"
    assert partner_view.json()["version"] == 2
    assert partner_view.headers["etag"] == '"2"'

    stale = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"displayName": "Veraltet"},
        headers={**auth(couple["token_a"]), "If-Match": initial.headers["etag"]},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "VERSION_CONFLICT"

    foreign_write = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"displayName": "Nicht erlaubt"},
        headers={**auth(couple["token_b"]), "If-Match": partner_view.headers["etag"]},
    )
    assert foreign_write.status_code == 403
    assert foreign_write.json()["code"] == "PROFILE_SELF_WRITE_ONLY"

    invalid = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"displayName": None},
        headers={**auth(couple["token_a"]), "If-Match": partner_view.headers["etag"]},
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "DISPLAY_NAME_REQUIRED"


def test_profile_birthday_is_self_write_partner_read_and_clear(client, couple) -> None:  # type: ignore[no-untyped-def]
    initial = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_a"]),
    )
    assert initial.status_code == 200
    assert initial.json()["birthday"] is None

    birthday_set = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"birthday": "1992-05-14"},
        headers={**auth(couple["token_a"]), "If-Match": initial.headers["etag"]},
    )
    assert birthday_set.status_code == 200, birthday_set.text
    assert birthday_set.json()["birthday"] == "1992-05-14"
    assert birthday_set.json()["version"] == 2

    partner_view = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_b"]),
    )
    assert partner_view.status_code == 200
    assert partner_view.json()["birthday"] == "1992-05-14"

    cleared = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"birthday": None},
        headers={**auth(couple["token_a"]), "If-Match": partner_view.headers["etag"]},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["birthday"] is None
    assert cleared.json()["version"] == 3


def test_avatar_set_remove_and_attachment_owner_boundary(
    client,
    couple,
    session: Session,
) -> None:  # type: ignore[no-untyped-def]
    initial = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_a"]),
    )
    assert initial.status_code == 200
    assert initial.headers["etag"] == '"1"'

    avatar = ready_avatar(
        session,
        account_id=couple["anna"].id,
        space_id=couple["space"].id,
    )
    set_response = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"profileAttachmentId": str(avatar.id)},
        headers={**auth(couple["token_a"]), "If-Match": initial.headers["etag"]},
    )
    assert set_response.status_code == 200
    assert set_response.json()["profileAttachmentId"] == str(avatar.id)
    assert set_response.json()["version"] == 2
    assert set_response.headers["etag"] == '"2"'

    partner_view = client.get(
        profile_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_b"]),
    )
    assert partner_view.status_code == 200
    assert partner_view.json()["profileAttachmentId"] == str(avatar.id)
    assert partner_view.json()["version"] == 2

    foreign_avatar = ready_avatar(
        session,
        account_id=couple["ben"].id,
        space_id=couple["space"].id,
    )
    foreign_candidate = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"profileAttachmentId": str(foreign_avatar.id)},
        headers={**auth(couple["token_a"]), "If-Match": partner_view.headers["etag"]},
    )
    assert foreign_candidate.status_code == 404

    removed = client.patch(
        profile_path(couple["space"].id, couple["anna"].id),
        json={"profileAttachmentId": None},
        headers={**auth(couple["token_a"]), "If-Match": partner_view.headers["etag"]},
    )
    assert removed.status_code == 200
    assert removed.json()["profileAttachmentId"] is None
    assert removed.json()["version"] == 3
    assert removed.headers["etag"] == '"3"'
    assert avatar.status == AttachmentStatus.DELETING.value


def test_avatar_content_is_profile_authorized_and_account_global(
    client,
    couple,
    session: Session,
) -> None:  # type: ignore[no-untyped-def]
    content = b"current-account-avatar"
    avatar = ready_avatar(
        session,
        account_id=couple["anna"].id,
        space_id=couple["space"].id,
        data=content,
    )
    bind_avatar(session, couple["anna"].id, avatar.id)

    partner_read = client.get(
        avatar_path(couple["space"].id, couple["anna"].id),
        headers=auth(couple["token_b"]),
    )
    assert partner_read.status_code == 200
    assert partner_read.content == content
    assert partner_read.headers["content-type"].startswith("image/jpeg")
    assert partner_read.headers["cache-control"] == "private, no-store"

    anonymous = client.get(avatar_path(couple["space"].id, couple["anna"].id))
    assert anonymous.status_code == 401

    cross_tenant = client.get(
        avatar_path(couple["outsider_space"].id, couple["anna"].id),
        headers=auth(couple["token_outsider"]),
    )
    assert cross_tenant.status_code == 404
    assert cross_tenant.json()["code"] == "PARTNER_PROFILE_NOT_FOUND"

    second_partner = make_account(session, "Carla")
    second_space = make_space(session, couple["anna"])
    relationship_service.add_member(session, second_space.id, second_partner)
    session.flush()
    token_c = sign_in(session, second_partner)

    # The avatar is Account-global presentation identity. Carla may read the
    # exact current avatar because Anna is active in Carla's Space even though
    # the backing attachment was uploaded in Anna's other Space.
    second_space_read = client.get(
        avatar_path(second_space.id, couple["anna"].id),
        headers=auth(token_c),
    )
    assert second_space_read.status_code == 200
    assert second_space_read.content == content
