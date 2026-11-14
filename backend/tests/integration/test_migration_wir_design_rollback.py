"""Wir design compatibility when rolling back to a previous backend."""

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.appearance.models import AppIconPreference, WirDesignId
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


@pytest.mark.parametrize(
    ("revision", "reset_design"),
    [("0131", WirDesignId.SHARED_ALBUM), ("0132", WirDesignId.QUIET_TOGETHER)],
)
def test_downgrade_resets_only_the_added_design_and_invalidates_its_etag(
    session: Session, revision: str, reset_design: WirDesignId
) -> None:
    owner = make_account(session, "Owner")
    space = make_space(session, owner)
    for design_id in WirDesignId:
        account = make_account(session, design_id.value)
        session.add(
            AppIconPreference(
                account_id=account.id,
                space_id=space.id,
                icon_id="sage",
                wir_design=design_id.value,
            )
        )
    session.flush()

    def saved() -> list[tuple[str, int, str]]:
        return [
            (design, version, icon)
            for design, version, icon in session.execute(
                select(
                    AppIconPreference.wir_design,
                    AppIconPreference.version,
                    AppIconPreference.icon_id,
                ).order_by(AppIconPreference.wir_design, AppIconPreference.version)
            )
        ]

    original = sorted((design.value, 1, "sage") for design in WirDesignId)
    rollback = sorted(
        ("connected", 2, "sage") if design is reset_design else (design.value, 1, "sage")
        for design in WirDesignId
    )
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(revision).module
    with Operations.context(MigrationContext.configure(session.connection())):
        migration.upgrade()
        assert saved() == original

        migration.downgrade()
        assert saved() == rollback

        migration.upgrade()
        assert saved() == rollback
