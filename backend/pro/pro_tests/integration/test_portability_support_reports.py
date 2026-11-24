"""The personal data copy carries the requester's own support reports and replies (#2245).

Reports belong to an Account, not a Space. They are exported only in the personal scope, only
for the requesting account, never with the operator's ticket link, and the import ignores them.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import pytest
from eimir_pro.portability.common import TransferScope
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.support_reports import service as support_report_service
from eimir.support_reports.models import SupportReportKind
from eimir.support_reports.payload import ClientContext, FailureReference, SupportReportPayload
from pro_tests.support.portability import couple, export_bytes, import_bytes, target_space
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _client() -> ClientContext:
    return ClientContext(
        app_version="0.2.0",
        build="123",
        platform="app",
        os="Android 16",
        engine="WebView 142",
        locale="de-DE",
        theme="dark",
        online=True,
        local_time="2026-11-24T10:15:00",
        time_zone="Europe/Berlin",
    )


def _report(session: Session, account_id, note: str, *, reply: str | None = None):  # type: ignore[no-untyped-def]
    report, _ = support_report_service.create_report(
        session,
        account_id=account_id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note=note,
            failure=FailureReference(reference="POST:/api/v1/memories:500", request_id="req-1"),
            client=_client(),
        ),
    )
    if reply is not None:
        support_report_service.send_reply(
            session, report_id=report.id, text=reply, operator_id=None
        )
    session.flush()
    return report


def _accounts(data: bytes) -> dict:  # type: ignore[type-arg]
    with ZipFile(io.BytesIO(data)) as archive:
        return json.loads(archive.read("accounts.json"))


def test_personal_export_has_own_reports_and_reply_and_never_anothers(
    session: Session, tmp_path: Path
) -> None:
    pair = couple(session)
    own = _report(session, pair["anna"].id, "Anna's own problem", reply="Anna's answer")
    support_report_service.set_archived(session, own.id, True)
    unanswered = _report(session, pair["anna"].id, "Anna without reply")
    _report(session, pair["ben"].id, "Ben's problem", reply="Ben's answer")

    data = export_bytes(session, pair["context"], tmp_path, TransferScope.PERSONAL)
    reports = _accounts(data)["personalSupportReports"]

    assert {item["id"] for item in reports} == {str(own.id), str(unanswered.id)}
    by_id = {item["id"]: item for item in reports}
    first = by_id[str(own.id)]
    assert first["accountId"] == str(pair["anna"].id)
    assert first["kind"] == "PROBLEM"
    assert first["payload"]["note"] == "Anna's own problem"
    assert first["payload"]["failure"]["reference"] == "POST:/api/v1/memories:500"
    assert first["payload"]["client"]["platform"] == "app"
    assert first["reply"]["payload"]["text"] == "Anna's answer"
    assert first["reply"]["repliedAt"]
    assert by_id[str(unanswered.id)]["reply"] is None
    # Never another person's content, and never the operator's ticket link.
    plaintext = data.decode("latin-1")
    assert "Ben's problem" not in plaintext
    assert "Ben's answer" not in plaintext
    assert "ticket" not in json.dumps(reports).lower()
    assert "archived" not in json.dumps(reports).lower()


def test_the_requester_is_the_account_not_the_space(session: Session, tmp_path: Path) -> None:
    pair = couple(session)
    _report(session, pair["anna"].id, "Anna problem")
    ben_report = _report(session, pair["ben"].id, "Ben problem", reply="Ben answer")
    ben_context = AuthorizationContext(account_id=pair["ben"].id, space_id=pair["space"].id)

    data = export_bytes(session, ben_context, tmp_path, TransferScope.PERSONAL)
    reports = _accounts(data)["personalSupportReports"]

    assert [item["id"] for item in reports] == [str(ben_report.id)]
    assert "Anna problem" not in data.decode("latin-1")


def test_a_shared_export_never_carries_support_reports(session: Session, tmp_path: Path) -> None:
    pair = couple(session)
    _report(session, pair["anna"].id, "Private to Anna", reply="Reply to Anna")

    data = export_bytes(session, pair["context"], tmp_path, TransferScope.SHARED)

    assert "personalSupportReports" not in _accounts(data)
    assert "Private to Anna" not in data.decode("latin-1")


def test_a_person_without_reports_gets_an_empty_list(session: Session, tmp_path: Path) -> None:
    pair = couple(session)
    data = export_bytes(session, pair["context"], tmp_path, TransferScope.PERSONAL)
    assert _accounts(data)["personalSupportReports"] == []


def test_reports_are_decrypted_into_the_export_and_stored_encrypted(
    session: Session, encryption, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    pair = couple(session)
    report = _report(session, pair["anna"].id, "Sensitive note", reply="Sensitive reply")
    for table, column in (("support_reports", "id"), ("support_report_replies", "report_id")):
        stored = session.scalar(
            text(f"SELECT payload::text FROM {table} WHERE {column} = :i"), {"i": report.id}
        )
        assert "Sensitive" not in stored

    data = export_bytes(session, pair["context"], tmp_path, TransferScope.PERSONAL)
    item = _accounts(data)["personalSupportReports"][0]

    assert item["payload"]["note"] == "Sensitive note"
    assert item["reply"]["payload"]["text"] == "Sensitive reply"
    assert item["cryptoVersion"] == 0
    assert item["reply"]["cryptoVersion"] == 0


def test_import_ignores_the_export_only_reports(session: Session, tmp_path: Path) -> None:
    pair = couple(session)
    _report(session, pair["anna"].id, "Stays at the source", reply="Also stays")
    target = target_space(session, pair)
    data = export_bytes(session, pair["context"], tmp_path, TransferScope.PERSONAL)

    import_bytes(session, target, data)
    import_bytes(session, target, data)

    count = session.scalar(text("SELECT count(*) FROM support_reports"))
    replies = session.scalar(text("SELECT count(*) FROM support_report_replies"))
    assert (count, replies) == (1, 1)
