"""Migration 0168 allows preview v3; a downgrade returns v3 endpoints to v2 (#2158)."""

from __future__ import annotations

import base64
import json

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from eimir.auth import sessions
from eimir.db.base import Base
from eimir.engagement import push
from tests.conftest import make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
KEY = base64.urlsafe_b64encode(bytes(range(32))).decode().rstrip("=")


def test_downgrade_keeps_detailed_endpoints_on_v2_and_upgrade_allows_v3(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    push.register_endpoint(
        session,
        account_id=account.id,
        provider_key="fcm",
        endpoint_value=json.dumps(
            {"fid": "c" + "a" * 21, "activationId": "a056af57-e809-465f-8173-e17c23cd408a"},
            separators=(",", ":"),
        ),
        preview_key=KEY,
        preview_session_id=sessions.resolve(session, token)[0].id,
        preview_version=3,
    )
    session.flush()
    version = text("SELECT preview_version FROM push_preview_secrets")
    assert session.scalar(version) == 3
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0168").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert session.scalar(version) == 2
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(text("UPDATE push_preview_secrets SET preview_version = 3"))
        migration.upgrade()
    session.execute(text("UPDATE push_preview_secrets SET preview_version = 3"))
    assert session.scalar(version) == 3
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(text("UPDATE push_preview_secrets SET preview_version = 4"))
