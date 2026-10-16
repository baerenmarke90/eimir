"""Production-style regression coverage for request transaction visibility."""

from __future__ import annotations

import io
from uuid import UUID

import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments import service as attachment_service
from eimir.identity.models import Account
from tests.conftest import (
    TEST_BOOTSTRAP_TOKEN,
    auth,
    make_account,
    make_space,
    requires_database,
    sign_in,
)

pytestmark = [pytest.mark.integration, requires_database]

GOOD_PASSWORD = "a-sufficiently-long-password"


def _image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 20, 30)).save(buffer, "JPEG")
    return buffer.getvalue()


def _register(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Anna",
            "email": "anna@example.org",
            "password": GOOD_PASSWORD,
            "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
        },
    )
    assert response.status_code == 201


def test_successful_sign_in_is_immediately_visible_to_next_request(production_client) -> None:  # type: ignore[no-untyped-def]
    client, _ = production_client
    _register(client)

    signed_in = client.post(
        "/api/v1/auth/sign-in",
        json={"email": "anna@example.org", "password": GOOD_PASSWORD},
    )
    assert signed_in.status_code == 200

    token = signed_in.json()["tokens"]["accessToken"]
    immediate_follow_up = client.get("/api/v1/auth/me", headers=auth(token))
    assert immediate_follow_up.status_code == 200


def test_attachment_binding_is_immediately_visible_to_read_access(production_client) -> None:  # type: ignore[no-untyped-def]
    client, maker = production_client

    with maker() as setup:
        account = make_account(setup, "Anna")
        space = make_space(setup, account)
        token = sign_in(setup, account)
        space_id = space.id
        setup.commit()

    content = _image_bytes()
    created = client.post(
        f"/api/v1/spaces/{space_id}/attachments",
        json={
            "mediaType": "IMAGE",
            "originalName": "photo.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(token),
    )
    assert created.status_code == 201
    attachment_id = created.json()["attachment"]["id"]

    uploaded = client.put(
        f"/api/v1/spaces/{space_id}/attachments/{attachment_id}/content",
        content=content,
        headers=auth(token),
    )
    assert uploaded.status_code == 204

    finalized = client.post(
        f"/api/v1/spaces/{space_id}/attachments/{attachment_id}/finalize",
        json={},
        headers=auth(token),
    )
    assert finalized.status_code == 202

    with maker() as worker:
        attachment_service.validate(worker, UUID(attachment_id))
        worker.commit()

    memory = client.post(
        f"/api/v1/spaces/{space_id}/memories",
        json={"title": "Trip"},
        headers=auth(token),
    )
    assert memory.status_code == 201

    bound = client.put(
        f"/api/v1/spaces/{space_id}/memories/{memory.json()['id']}/attachments",
        json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
        headers={**auth(token), "If-Match": f'"{memory.json()["version"]}"'},
    )
    assert bound.status_code == 200

    immediate_follow_up = client.post(
        f"/api/v1/spaces/{space_id}/attachments/{attachment_id}/read-access",
        json={"parentType": "MEMORY", "parentId": memory.json()["id"]},
        headers=auth(token),
    )
    assert immediate_follow_up.status_code == 200


def test_commit_failure_cannot_return_success_response(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    client, maker = production_client

    def fail_commit(self: Session) -> None:
        raise RuntimeError("synthetic transaction commit failure")

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        response = client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Anna",
                "email": "anna@example.org",
                "password": GOOD_PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )

    assert response.status_code == 500
    with maker() as committed:
        assert committed.execute(select(func.count()).select_from(Account)).scalar_one() == 0
