"""Operator notices name their topic and live longer on preview v4 devices (#2337)."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime

import pytest
from joserfc import jwe
from joserfc.jwk import OctKey
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.config import get_settings
from eimir.core import clock
from eimir.engagement import push, push_preview
from eimir.engagement.models import Notification, PushDelivery, PushDeliveryStatus
from eimir.identity.models import AccountEmail
from eimir.monitoring import operator_push
from tests.conftest import make_account, requires_database
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 11, 27, 8, 25, tzinfo=UTC)
ADMIN_EMAIL = "operator@example.test"
KEY = base64.urlsafe_b64encode(bytes(range(32))).decode().rstrip("=")
ENDPOINT = json.dumps(
    {"fid": "c" + "a" * 21, "activationId": "a056af57-e809-465f-8173-e17c23cd408a"},
    separators=(",", ":"),
)


@pytest.fixture
def admin(session: Session, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    def settings():  # type: ignore[no-untyped-def]
        return get_settings().model_copy(update={"server_admin_emails": [ADMIN_EMAIL]})

    monkeypatch.setattr("eimir.authorization.server_admin.get_settings", settings)
    monkeypatch.setattr(clock, "now", lambda: NOW)
    push.providers.clear()
    account = make_account(session, "Operator")
    account.timezone = "UTC"
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=NOW)
    )
    session.flush()
    yield account
    push.providers.clear()


def _register(session: Session, account, version: int) -> FakePushProvider:  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("fcm", provider)
    device, _ = sessions.start_session(session, account, device_name="Pixel")
    session.flush()
    push.register_endpoint(
        session,
        account_id=account.id,
        provider_key="fcm",
        endpoint_value=ENDPOINT,
        preview_key=KEY,
        preview_session_id=device.id,
        preview_version=version,
    )
    session.flush()
    return provider


def _deliver_one(session: Session, provider: FakePushProvider) -> dict[str, str]:
    delivery = session.scalars(select(PushDelivery)).one()
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    reference = provider.calls[-1]["notificationReference"]
    assert isinstance(reference, dict)
    return reference


def _decrypt(reference: dict[str, str]) -> dict[str, object]:
    decoded = jwe.decrypt_compact(
        reference["encryptedPreview"],
        OctKey.import_key({"kty": "oct", "k": KEY}),
        algorithms=["dir", "A256GCM"],
    )
    return json.loads(decoded.plaintext)


def test_a_v4_device_gets_the_topic_and_an_hour_of_validity(session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    # No neutral reference capability is needed: the topic is not neutral on v4.
    provider = _register(session, admin, 4)
    operator_push.notify(session, topic="support_reports", at=NOW, recipients=[admin.id])

    reference = _deliver_one(session, provider)
    preview = _decrypt(reference)

    assert reference["ttl"] == "3600"
    assert preview["v"] == 4
    assert preview["kind"] == "OPERATOR_ALERT"
    assert preview["targetType"] == "SUPPORT_REPORTS"
    assert preview["name"] == preview["title"] == preview["body"] == ""
    assert preview["when"] == preview["place"] == ""
    assert preview["expiresAt"] - preview["issuedAt"] == 3600  # type: ignore[operator]
    notice = session.scalars(select(Notification)).one()
    assert preview["notificationId"] == str(notice.id)


def test_every_operator_topic_has_a_closed_device_code() -> None:
    from eimir.engagement.models import OPERATOR_TOPICS

    assert {push_preview.operator_topic_code(topic) for topic in OPERATOR_TOPICS} == {
        "FAILED_JOBS",
        "SPACE_QUOTA_PRESSURE",
        "DISK_PRESSURE",
        "DELIVERY_FAILURES",
        "BACKUP_NOT_CONFIGURED",
        "SUPPORT_REPORTS",
    }


def test_validity_never_outlives_the_notice(session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    provider = _register(session, admin, 4)
    operator_push.notify(session, topic="failed_jobs", at=NOW, recipients=[admin.id])
    notice = session.scalars(select(Notification)).one()
    notice.expires_at = datetime(2026, 11, 27, 8, 45, tzinfo=UTC)
    session.flush()

    reference = _deliver_one(session, provider)
    preview = _decrypt(reference)

    assert reference["ttl"] == "1200"
    assert preview["expiresAt"] - preview["issuedAt"] == 1200  # type: ignore[operator]


def test_a_v3_device_keeps_the_neutral_five_minute_notice(session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    provider = _register(session, admin, 3)
    operator_push.notify(session, topic="support_reports", at=NOW, recipients=[admin.id])

    reference = _deliver_one(session, provider)

    # Without the neutral reference capability a v3 device gets no preview at all.
    assert "encryptedPreview" not in reference
    assert reference["ttl"] == "300"
    notice = session.scalars(select(Notification)).one()
    encoded = push_preview.for_notification(
        session, notice, digest=False, version=3, neutral_reference=True
    )
    assert encoded is not None
    assert json.loads(encoded)["targetType"] == ""
    assert "SUPPORT_REPORTS" not in encoded
