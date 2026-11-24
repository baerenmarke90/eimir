"""Saved app designs remain readable on downgrade to the preceding backend."""

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
    ("revision", "introduced"),
    [
        ("0158", {"quiet_together", "handwriting"}),
        ("0172", {"home_rooms"}),
        ("0173", {"shared_rhythm"}),
        ("0174", {"together_index"}),
    ],
)
def test_downgrade_resets_only_introduced_designs(
    session: Session, revision: str, introduced: set[str]
) -> None:
    owner = make_account(session, "Owner")
    space = make_space(session, owner)
    design_ids = {design.value for design in WirDesignId} | {"handwriting", "together_index"}
    for design_id in sorted(design_ids):
        account = make_account(session, design_id)
        session.add(
            AppIconPreference(
                account_id=account.id,
                space_id=space.id,
                icon_id="sage",
                wir_design=design_id,
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

    original = sorted((design, 1, "sage") for design in design_ids)
    rollback = sorted(
        ("connected", 2, "sage") if design in introduced else (design, 1, "sage")
        for design in design_ids
    )
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision(revision).module
    with Operations.context(MigrationContext.configure(session.connection())):
        migration.upgrade()
        assert saved() == original

        migration.downgrade()
        assert saved() == rollback

        migration.upgrade()
        assert saved() == rollback
