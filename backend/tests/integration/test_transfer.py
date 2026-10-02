"""PostgreSQL/HTTP evidence for Transfer Bundle authorization and validation."""

from __future__ import annotations

import hashlib
import io
import json
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.core.clock import now
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.identity.models import AccountEmail
from eimir.media import get_media_store
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.private_notes import service as private_note_service
from eimir.profiles import service as profile_service
from eimir.profiles.models import PartnerProfile
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from eimir.reminders.runtime_models import RulePreference
from eimir.transfer import jobs, service
from eimir.transfer.models import ExportStatus, ImportStatus, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def _verified_email(session: Session, account, address: str) -> None:  # type: ignore[no-untyped-def]
    session.add(
        AccountEmail(
            account_id=account.id,
            email=address,
            verified_at=datetime(2026, 8, 31, 10, 0, tzinfo=UTC),
            is_primary=True,
        )
    )
    session.flush()


def _minimal_bundle(source_id: str, email: str | None) -> io.BytesIO:
    accounts = (
        json.dumps(
            {
                "members": [
                    {
                        "sourceId": source_id,
                        "displayName": "Portable member",
                        "birthday": None,
                        "locale": "de-DE",
                        "timezone": "Europe/Berlin",
                        "verifiedEmail": email,
                    }
                ]
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode()
    manifest = {
        "formatVersion": 1,
        "exportedAt": "2026-08-31T10:00:00+00:00",
        "applicationVersion": "0.1.0",
        "scope": "PERSONAL",
        "sourceSpaceId": str(uuid4()),
        "exportedBySourceId": source_id,
        "personalOwnerSourceId": source_id,
        "checksums": {"accounts.json": hashlib.sha256(accounts).hexdigest()},
    }
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("accounts.json", accounts)
        archive.writestr(
            "manifest.json",
            (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode(),
        )
    output.seek(0)
    return output


def test_export_descriptor_is_creator_bound(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)

    created = client.post(
        f"/api/v1/spaces/{space.id}/transfer/exports",
        json={"scope": "PERSONAL"},
        headers=auth(anna_token),
    )
    assert created.status_code == 202, created.text
    export_id = created.json()["id"]
    assert created.json()["status"] == "QUEUED"
    assert created.json()["scope"] == "PERSONAL"
    assert created.headers["cache-control"] == "private, no-store"

    own = client.get(
        f"/api/v1/spaces/{space.id}/transfer/exports/{export_id}",
        headers=auth(anna_token),
    )
    assert own.status_code == 200

    partner = client.get(
        f"/api/v1/spaces/{space.id}/transfer/exports/{export_id}",
        headers=auth(ben_token),
    )
    assert partner.status_code == 404


def test_foreign_space_transfer_id_is_privacy_safe(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_space = make_space(session, anna)
    ben_space = make_space(session, ben)
    transfer = service.create_export(
        session,
        AuthorizationContext(account_id=anna.id, space_id=anna_space.id),
        TransferScope.SHARED,
    )
    ben_token = sign_in(session, ben)

    response = client.get(
        f"/api/v1/spaces/{ben_space.id}/transfer/exports/{transfer.id}",
        headers=auth(ben_token),
    )

    assert response.status_code == 404


def test_export_worker_rechecks_active_membership(session: Session) -> None:
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    authorization = AuthorizationContext(account_id=anna.id, space_id=space.id)
    transfer = service.create_export(session, authorization, TransferScope.SHARED)
    membership = session.execute(
        select(Membership).where(
            Membership.space_id == space.id,
            Membership.account_id == anna.id,
        )
    ).scalar_one()
    membership.status = MembershipStatus.LEFT.value
    session.flush()

    jobs.handle_export(session, {"exportId": str(transfer.id)})

    assert transfer.status == ExportStatus.FAILED.value
    assert transfer.error_code == "TRANSFER_EXPORT_FAILED"


def test_shared_export_excludes_owner_only_and_personal_keeps_only_requester(
    session: Session,
) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    anna_context = AuthorizationContext(account_id=anna.id, space_id=space.id)
    ben_context = AuthorizationContext(account_id=ben.id, space_id=space.id)

    private_note_service.create_note(
        session,
        anna_context,
        title="Anna secret",
        body="Only Anna may export this.",
        pinned=False,
    )
    private_note_service.create_note(
        session,
        ben_context,
        title="Ben secret",
        body="Anna must never export this.",
        pinned=False,
    )
    profile_service.set_partner_nickname(
        session, anna_context, "Anna's private label", expected_version=0
    )
    profile_service.set_partner_nickname(
        session, ben_context, "Ben's private label", expected_version=0
    )
    session.add_all(
        [
            RulePreference(
                account_id=anna.id,
                space_id=space.id,
                rule_key="portable-test-rule",
                enabled=False,
                parameters={"days_before": [7]},
            ),
            RulePreference(
                account_id=ben.id,
                space_id=space.id,
                rule_key="portable-test-rule",
                enabled=True,
                parameters={"days_before": [1]},
            ),
        ]
    )
    session.flush()

    with (
        service.build_export_archive(session, anna_context, TransferScope.SHARED) as bundle,
        ZipFile(bundle, "r") as archive,
    ):
        assert "private/notes.json" not in archive.namelist()
        assert "rules.json" not in archive.namelist()
        shared_profiles = json.loads(archive.read("profiles.json"))

    assert all(group["name"] != "partner_nicknames" for group in shared_profiles["tables"])

    with (
        service.build_export_archive(session, anna_context, TransferScope.PERSONAL) as bundle,
        ZipFile(bundle, "r") as archive,
    ):
        private_document = json.loads(archive.read("private/notes.json"))
        rule_document = json.loads(archive.read("rules.json"))
        personal_profiles = json.loads(archive.read("profiles.json"))

    notes = next(group for group in private_document["tables"] if group["name"] == "private_notes")[
        "rows"
    ]
    rules = next(group for group in rule_document["tables"] if group["name"] == "rule_preferences")[
        "rows"
    ]
    nicknames = next(
        group for group in personal_profiles["tables"] if group["name"] == "partner_nicknames"
    )["rows"]
    assert len(notes) == 1
    assert notes[0]["ownerId"] == str(anna.id)
    assert notes[0]["payload"]["title"] == "Anna secret"
    assert len(rules) == 1
    assert rules[0]["accountId"] == str(anna.id)
    assert rules[0]["enabled"] is False
    assert len(nicknames) == 1
    assert nicknames[0]["ownerId"] == str(anna.id)
    assert nicknames[0]["accountId"] == str(ben.id)
    assert nicknames[0]["payload"]["nickname"] == "Anna's private label"


def test_shared_round_trip_maps_email_less_pair_and_reuses_target_profiles(
    session: Session,
) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    source_space = make_space(session, anna)
    relationship_service.add_member(session, source_space.id, ben)
    target_space = make_space(session, anna)
    relationship_service.add_member(session, target_space.id, ben)
    source_authorization = AuthorizationContext(account_id=anna.id, space_id=source_space.id)
    target_authorization = AuthorizationContext(account_id=anna.id, space_id=target_space.id)
    target_profile_ids = set(
        session.execute(
            select(PartnerProfile.id).where(PartnerProfile.space_id == target_space.id)
        ).scalars()
    )
    assert len(target_profile_ids) == 2

    memory_service.create_memory(
        session,
        source_authorization,
        title="Portable day",
        body="Together",
        happened_on=date(2026, 9, 1),
        tags=["home", "Our first summer"],
    )
    heart_moment_service.create_heart_moment(
        session,
        source_authorization,
        text="",
        emotion=HeartEmotion.HAPPY,
        visibility=ContentVisibility.SHARED,
        happened_on=date(2026, 9, 1),
        tags=["everyday", "Our tradition"],
    )

    with service.build_export_archive(
        session, source_authorization, TransferScope.SHARED
    ) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        transfer = service.create_import(
            session,
            target_authorization,
            bundle,
            size=size,
        )
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    session.flush()

    assert transfer.status == ImportStatus.READY_TO_APPLY.value
    assert transfer.member_mapping == {
        str(anna.id): str(anna.id),
        str(ben.id): str(ben.id),
    }

    service.request_apply(session, target_authorization, str(transfer.id))
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()

    assert transfer.status == ImportStatus.COMPLETED.value
    imported_target_profile_ids = set(
        session.execute(
            select(PartnerProfile.id).where(PartnerProfile.space_id == target_space.id)
        ).scalars()
    )
    assert imported_target_profile_ids == target_profile_ids
    imported_memory = session.execute(
        select(Memory).where(Memory.space_id == target_space.id)
    ).scalar_one()
    imported_heart = session.execute(
        select(HeartMoment).where(HeartMoment.space_id == target_space.id)
    ).scalar_one()
    assert imported_memory.payload.tags == ["home", "Our first summer"]
    assert imported_heart.payload.tags == ["everyday", "Our tradition"]


def test_personal_import_maps_requester_and_apply_is_idempotent(session: Session) -> None:
    target = make_account(session, "Target")
    _verified_email(session, target, "target@example.test")
    space = make_space(session, target)
    authorization = AuthorizationContext(account_id=target.id, space_id=space.id)
    source_id = str(uuid4())
    bundle = _minimal_bundle(source_id, "target@example.test")

    transfer = service.create_import(
        session,
        authorization,
        bundle,
        size=len(bundle.getvalue()),
    )
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    session.flush()

    assert transfer.status == ImportStatus.READY_TO_APPLY.value
    assert transfer.scope == TransferScope.PERSONAL.value
    assert transfer.member_mapping == {source_id: str(target.id)}
    assert transfer.summary == {
        "scope": "PERSONAL",
        "recordCounts": {},
        "mediaCount": 0,
        "sourceMemberCount": 1,
    }

    service.request_apply(session, authorization, str(transfer.id))
    apply_job_id = transfer.apply_job_id
    assert apply_job_id is not None
    second_apply = service.request_apply(session, authorization, str(transfer.id))
    assert second_apply.apply_job_id == apply_job_id
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()

    assert transfer.status == ImportStatus.COMPLETED.value
    assert transfer.artifact_size == 0
    assert service.request_apply(session, authorization, str(transfer.id)).status == (
        ImportStatus.COMPLETED.value
    )


def test_personal_import_fails_when_owner_maps_to_other_member(session: Session) -> None:
    requester = make_account(session, "Requester")
    partner = make_account(session, "Partner")
    _verified_email(session, requester, "requester@example.test")
    _verified_email(session, partner, "partner@example.test")
    space = make_space(session, requester)
    relationship_service.add_member(session, space.id, partner)
    authorization = AuthorizationContext(account_id=requester.id, space_id=space.id)
    source_id = str(uuid4())
    bundle = _minimal_bundle(source_id, "partner@example.test")

    transfer = service.create_import(
        session,
        authorization,
        bundle,
        size=len(bundle.getvalue()),
    )
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    session.flush()

    assert transfer.status == ImportStatus.FAILED.value
    assert transfer.error_code == "TRANSFER_MEMBER_MAPPING_INVALID"


def test_expired_staged_import_is_physically_deleted_idempotently(session: Session) -> None:
    target = make_account(session, "Target")
    space = make_space(session, target)
    authorization = AuthorizationContext(account_id=target.id, space_id=space.id)
    source_id = str(uuid4())
    bundle = _minimal_bundle(source_id, None)
    transfer = service.create_import(
        session,
        authorization,
        bundle,
        size=len(bundle.getvalue()),
    )
    store = get_media_store()
    key = service.import_storage_key(transfer)
    assert store.exists(key)
    transfer.expires_at = now() - timedelta(seconds=1)
    session.flush()

    assert service.cleanup_expired(session) == 1
    assert transfer.status == ImportStatus.EXPIRED.value
    assert not store.exists(key)
    assert service.cleanup_expired(session) == 0
